-- ============================================================
-- 058_deal_followup_time
--
-- AI follow-ups at the moment the customer asked for.
--
-- deals.expected_close_date is a DATE, so a follow-up could only ever
-- go out "some time that day". When a customer writes "kal shaam 5
-- baje call karna" or "Monday ko batata hoon", the AI now records that
-- exact moment in ai_followup_at and the follow-up runner sends at it.
-- NULL keeps the old date-only behaviour.
--
-- Idempotent.
-- ============================================================

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ai_followup_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deals_ai_followup_at
  ON public.deals (ai_followup_at)
  WHERE ai_followup_enabled AND ai_followup_at IS NOT NULL;
