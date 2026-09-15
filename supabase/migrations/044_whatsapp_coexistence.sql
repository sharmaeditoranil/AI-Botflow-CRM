-- ============================================================
-- 044_whatsapp_coexistence
--
-- Adds support for WhatsApp Business App Coexistence mode on
-- whatsapp_config.
--
-- Coexistence allows an account to use the WhatsApp Business App
-- (mobile app) and the WhatsApp Cloud API (Ai Botflow CRM Panel)
-- simultaneously on the same phone number.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS coexistence BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN whatsapp_config.coexistence IS
  'When true, the number is onboarded in Coexistence mode, allowing simultaneous '
  'use of WhatsApp Business mobile app and the CRM panel on the same phone number.';
