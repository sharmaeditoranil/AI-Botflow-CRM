-- 051_admin_ai_settings.sql
-- Master platform AI model credentials for Super Admin
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS admin_openai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS admin_gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS admin_ai_model TEXT DEFAULT 'gpt-4o-mini';
