-- ============================================================
-- 046_meta_social_metadata.sql
--
-- Ensure `metadata` JSONB column exists on `meta_social_config` table
-- for storing available Facebook pages, account sync details, and
-- OAuth connection metadata.
-- ============================================================

ALTER TABLE meta_social_config
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
