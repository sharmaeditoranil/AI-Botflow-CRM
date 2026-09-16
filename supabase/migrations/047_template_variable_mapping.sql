-- ============================================================
-- 047_template_variable_mapping.sql
--
-- Adds variable_mapping column to message_templates so that
-- templates synced from Meta (or created in-app) can retain
-- persistent mapping definitions (e.g. {{1}} -> customer name,
-- {{2}} -> today's date or custom field) for broadcasts and
-- automations.
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS variable_mapping JSONB;

COMMENT ON COLUMN message_templates.variable_mapping IS
  'Default variable mappings for template placeholders (e.g. {"1": {"type": "field", "value": "name"}, "2": {"type": "date", "value": "today"}}).';
