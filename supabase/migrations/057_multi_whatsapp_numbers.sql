-- ============================================================
-- 057_multi_whatsapp_numbers
--
-- One business (account) can connect several WhatsApp numbers, from
-- the same WABA or from different WABAs, and work them from one inbox.
--
--   1. whatsapp_config  — drop UNIQUE(account_id); add label,
--                          display_phone_number and is_default (exactly
--                          one default per account).
--   2. conversations    — whatsapp_config_id: the number a WhatsApp
--                          chat lives on. A contact gets one chat per
--                          number. Existing chats are pinned to the
--                          account's (single) number.
--   3. broadcasts       — whatsapp_config_id: the number it sends from.
--   4. message_templates— waba_id: templates belong to a WABA, so two
--                          numbers on one WABA share templates and
--                          numbers on different WABAs keep their own.
--   5. plans            — max_whatsapp_numbers (trial/starter 1,
--                          growth 3, enterprise 5, founder 10).
--   6. merge_duplicate_conversations() now merges only within a number.
--   7. create_broadcast_with_recipients() records the sending number.
--
-- Idempotent: every statement is guarded, so a re-run is a no-op.
-- Accounts with a single number behave exactly as before.
-- ============================================================

BEGIN;

-- ---------- 1) whatsapp_config ------------------------------------

ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS display_phone_number TEXT;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

-- Every account that has numbers but no default gets its oldest one.
UPDATE public.whatsapp_config w
SET is_default = true
WHERE w.id = (
    SELECT w2.id FROM public.whatsapp_config w2
    WHERE w2.account_id = w.account_id
    ORDER BY w2.created_at ASC NULLS LAST, w2.id ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_config w3
    WHERE w3.account_id = w.account_id AND w3.is_default
  );

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_one_default_per_account
  ON public.whatsapp_config (account_id)
  WHERE is_default;

-- ---------- 2) conversations.whatsapp_config_id -------------------

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES public.whatsapp_config(id) ON DELETE SET NULL;

UPDATE public.conversations c
SET whatsapp_config_id = w.id
FROM public.whatsapp_config w
WHERE c.whatsapp_config_id IS NULL
  AND COALESCE(c.channel, 'whatsapp') = 'whatsapp'
  AND w.account_id = c.account_id
  AND w.is_default;

CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_config
  ON public.conversations (whatsapp_config_id);

-- One chat per (account, contact, number) for WhatsApp; Facebook /
-- Instagram chats keep the old one-per-(account, contact) guarantee.
-- WhatsApp chats whose number was removed (config set NULL) are left
-- unconstrained so removing a number never fails.
DROP INDEX IF EXISTS public.idx_conversations_account_contact;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_number
  ON public.conversations (account_id, contact_id, whatsapp_config_id)
  WHERE whatsapp_config_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_social
  ON public.conversations (account_id, contact_id)
  WHERE whatsapp_config_id IS NULL AND COALESCE(channel, 'whatsapp') <> 'whatsapp';

-- ---------- 3) broadcasts.whatsapp_config_id ----------------------

ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES public.whatsapp_config(id) ON DELETE SET NULL;

-- ---------- 4) message_templates.waba_id --------------------------

ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS waba_id TEXT;

UPDATE public.message_templates t
SET waba_id = w.waba_id
FROM public.whatsapp_config w
WHERE t.waba_id IS NULL
  AND w.account_id = t.account_id
  AND w.is_default
  AND w.waba_id IS NOT NULL;

-- Same template name may exist on two WABAs of one account.
DROP INDEX IF EXISTS public.message_templates_user_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_waba_name_language_key
  ON public.message_templates (account_id, waba_id, name, language)
  NULLS NOT DISTINCT;

-- ---------- 5) plans.max_whatsapp_numbers -------------------------

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_whatsapp_numbers INTEGER NOT NULL DEFAULT 1;

UPDATE public.plans
SET max_whatsapp_numbers = CASE slug
    WHEN 'growth'     THEN 3
    WHEN 'enterprise' THEN 5
    WHEN 'founder'    THEN 10
    ELSE 1
  END
WHERE max_whatsapp_numbers = 1;

-- ---------- 6) merge only within one number -----------------------

CREATE OR REPLACE FUNCTION public.merge_duplicate_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group    RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_all      UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           contact_id,
           whatsapp_config_id,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids,
           COALESCE(SUM(unread_count), 0)                AS total_unread
    FROM conversations
    WHERE whatsapp_config_id IS NOT NULL
       OR COALESCE(channel, 'whatsapp') <> 'whatsapp'
    GROUP BY account_id, contact_id, whatsapp_config_id
    HAVING count(*) > 1
  LOOP
    v_all      := v_group.ids;
    v_survivor := v_all[1];
    v_losers   := v_all[2:array_length(v_all, 1)];

    UPDATE messages          SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE message_reactions SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE deals             SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE flow_runs         SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE notifications     SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE ai_usage_log      SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);

    UPDATE conversations c
    SET unread_count      = v_group.total_unread,
        last_message_text = lm.content_text,
        last_message_at   = lm.created_at,
        updated_at        = NOW()
    FROM (
      SELECT content_text, created_at
      FROM messages
      WHERE conversation_id = v_survivor
      ORDER BY created_at DESC
      LIMIT 1
    ) lm
    WHERE c.id = v_survivor;

    UPDATE conversations
    SET unread_count = v_group.total_unread,
        updated_at   = NOW()
    WHERE id = v_survivor
      AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_survivor);

    DELETE FROM conversations WHERE id = ANY(v_losers);

    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_conversations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC;

-- ---------- 7) API broadcasts record their number atomically -----
-- create_broadcast_with_recipients gains p_whatsapp_config_id (DEFAULT
-- NULL, so older callers keep working). The parent row and its number
-- are written in the same atomic call (see migration 037 / #370).

DROP FUNCTION IF EXISTS public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[]);

CREATE OR REPLACE FUNCTION public.create_broadcast_with_recipients(
  p_account_id         UUID,
  p_user_id            UUID,
  p_name               TEXT,
  p_template_name      TEXT,
  p_template_language  TEXT,
  p_total_recipients   INTEGER,
  p_contact_ids        UUID[],
  p_template_params    JSONB[],
  p_whatsapp_config_id UUID DEFAULT NULL
)
RETURNS TABLE(broadcast_id UUID, recipient_id UUID, contact_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id UUID;
BEGIN
  INSERT INTO broadcasts (
    account_id, user_id, name, template_name,
    template_language, status, total_recipients, whatsapp_config_id
  )
  VALUES (
    p_account_id, p_user_id, p_name, p_template_name,
    p_template_language, 'sending', p_total_recipients, p_whatsapp_config_id
  )
  RETURNING id INTO v_broadcast_id;

  RETURN QUERY
  WITH ins AS (
    INSERT INTO broadcast_recipients (
      broadcast_id, contact_id, status, template_params
    )
    SELECT v_broadcast_id, t.cid, 'pending', t.prm
    FROM unnest(p_contact_ids, p_template_params) AS t(cid, prm)
    RETURNING id, broadcast_recipients.contact_id
  )
  SELECT v_broadcast_id, ins.id, ins.contact_id
  FROM ins;
END;
$$;

REVOKE ALL ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[], UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[], UUID) FROM anon;
REVOKE ALL ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[], UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_broadcast_with_recipients(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, UUID[], JSONB[], UUID) TO service_role;

COMMIT;
