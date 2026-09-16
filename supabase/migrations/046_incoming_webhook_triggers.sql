-- ============================================================
-- 046_incoming_webhook_triggers.sql
--
-- Adds incoming webhook triggers for bots with unique URL and secret key,
-- automatic template message sending, recipient and variable mapping,
-- and execution/delivery logs.
-- ============================================================

-- 1) Webhook Triggers
CREATE TABLE IF NOT EXISTS webhook_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  secret_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en',
  phone_path TEXT NOT NULL DEFAULT 'phone',
  name_path TEXT DEFAULT 'name',
  variable_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_triggers_account_id
  ON webhook_triggers(account_id);

CREATE INDEX IF NOT EXISTS idx_webhook_triggers_active
  ON webhook_triggers(account_id, is_active);

ALTER TABLE webhook_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_triggers_select ON webhook_triggers;
CREATE POLICY webhook_triggers_select ON webhook_triggers FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS webhook_triggers_insert ON webhook_triggers;
CREATE POLICY webhook_triggers_insert ON webhook_triggers FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS webhook_triggers_update ON webhook_triggers;
CREATE POLICY webhook_triggers_update ON webhook_triggers FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS webhook_triggers_delete ON webhook_triggers;
CREATE POLICY webhook_triggers_delete ON webhook_triggers FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- 2) Webhook Trigger Delivery Logs
CREATE TABLE IF NOT EXISTS webhook_trigger_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_id UUID NOT NULL REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  http_status INTEGER NOT NULL DEFAULT 200,
  recipient_phone TEXT,
  recipient_name TEXT,
  request_payload JSONB DEFAULT '{}'::jsonb,
  mapped_variables JSONB DEFAULT '{}'::jsonb,
  whatsapp_message_id TEXT,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_trigger_logs_trigger
  ON webhook_trigger_logs(trigger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_trigger_logs_account
  ON webhook_trigger_logs(account_id, created_at DESC);

ALTER TABLE webhook_trigger_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_trigger_logs_select ON webhook_trigger_logs;
CREATE POLICY webhook_trigger_logs_select ON webhook_trigger_logs FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS webhook_trigger_logs_delete ON webhook_trigger_logs;
CREATE POLICY webhook_trigger_logs_delete ON webhook_trigger_logs FOR DELETE
  USING (is_account_member(account_id, 'admin'));
