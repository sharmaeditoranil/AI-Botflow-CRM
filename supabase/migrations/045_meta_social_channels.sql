-- ============================================================
-- 045_meta_social_channels
--
-- Add Facebook Messenger and Instagram DM channel support.
-- Preserves 100% backward compatibility for existing WhatsApp data.
--
-- 1. Adds `channel` column to `conversations` (default 'whatsapp').
-- 2. Adds `channel` column to `messages` (default 'whatsapp').
-- 3. Adds `fb_user_id` and `ig_user_id` to `contacts` with account-scoped
--    partial unique indexes (mirroring migration 040 for wa_user_id).
-- 4. Creates `meta_social_config` table for storing Facebook Page and
--    Instagram Business Account settings with encryption and RLS.
-- ============================================================

-- 1) Add channel column to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_conversations_account_channel
  ON conversations(account_id, channel);

-- 2) Add channel column to messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_messages_channel
  ON messages(channel);

-- 3) Add social identities to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS fb_user_id TEXT,
  ADD COLUMN IF NOT EXISTS ig_user_id TEXT;

COMMENT ON COLUMN contacts.fb_user_id IS
  'Facebook Page-scoped user ID (PSID) for Messenger conversations.';
COMMENT ON COLUMN contacts.ig_user_id IS
  'Instagram-scoped user ID (IGSID) for Instagram DM conversations.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_fb_user_id
  ON contacts (account_id, fb_user_id)
  WHERE fb_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_ig_user_id
  ON contacts (account_id, ig_user_id)
  WHERE ig_user_id IS NOT NULL;

-- 4) Create meta_social_config table
CREATE TABLE IF NOT EXISTS meta_social_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Facebook Page details
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  facebook_page_access_token TEXT,
  facebook_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (facebook_status IN ('connected', 'disconnected')),
  -- Instagram Business details
  instagram_account_id TEXT,
  instagram_username TEXT,
  instagram_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (instagram_status IN ('connected', 'disconnected')),
  -- Webhook verification
  verify_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT meta_social_config_account_id_key UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_social_config_account
  ON meta_social_config(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_social_config_fb_page
  ON meta_social_config(facebook_page_id)
  WHERE facebook_page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_social_config_ig_acc
  ON meta_social_config(instagram_account_id)
  WHERE instagram_account_id IS NOT NULL;

-- RLS policies for meta_social_config
ALTER TABLE meta_social_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_social_config_select ON meta_social_config;
CREATE POLICY meta_social_config_select
  ON meta_social_config FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS meta_social_config_insert ON meta_social_config;
CREATE POLICY meta_social_config_insert
  ON meta_social_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS meta_social_config_update ON meta_social_config;
CREATE POLICY meta_social_config_update
  ON meta_social_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS meta_social_config_delete ON meta_social_config;
CREATE POLICY meta_social_config_delete
  ON meta_social_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));
