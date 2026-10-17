-- Migration 057: Meta Extended Credit Line auto-attach support
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS meta_extended_credit_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_system_user_token TEXT;
