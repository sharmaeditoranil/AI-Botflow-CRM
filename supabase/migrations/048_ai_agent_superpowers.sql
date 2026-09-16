-- ============================================================
-- 048_ai_agent_superpowers.sql
--
-- Adds support for:
-- 1. AI Conversation Memory (cross-session context, customer profile memory)
-- 2. Lead Qualification (lead_status, lead_score, qualification_data)
-- 3. Follow-up Intelligence (auto-tagging, auto-unsubscribe, opt-out management)
-- ============================================================

-- 1. Extend contacts table
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_opted_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_out_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'warm', 'hot', 'qualified', 'unqualified', 'opted_out')),
  ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS ai_memory TEXT,
  ADD COLUMN IF NOT EXISTS qualification_data JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_contacts_account_opted_out
  ON contacts(account_id, is_opted_out);

CREATE INDEX IF NOT EXISTS idx_contacts_account_lead_status
  ON contacts(account_id, lead_status);

-- 2. Extend ai_configs table
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lead_qualification_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS qualification_criteria JSONB DEFAULT '{"track_budget":true,"track_timeline":true,"track_interest":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS followup_intelligence_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_tagging_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_unsubscribe_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribe_keywords TEXT[] DEFAULT ARRAY['nahi chahiye', 'stop', 'unsubscribe', 'dont message', 'mat bhejo', 'not interested', 'cancel', 'no thanks', 'nahi lena hai'],
  ADD COLUMN IF NOT EXISTS unsubscribe_reply_text TEXT DEFAULT 'Aapka request note kar liya gaya hai. Aage se aapko hamari taraf se koi automated WhatsApp message nahi aayega. Dhanyawad.',
  ADD COLUMN IF NOT EXISTS unsubscribe_tag_name TEXT DEFAULT 'Unsubscribed',
  ADD COLUMN IF NOT EXISTS qualified_tag_name TEXT DEFAULT 'Qualified Lead';
