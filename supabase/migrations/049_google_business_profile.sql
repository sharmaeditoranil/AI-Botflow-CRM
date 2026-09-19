-- ============================================================
-- Migration 049: Google Business Profile (GMB) Integration
-- Connects Google Accounts, Locations, Reviews, and AI Replies
-- ============================================================

-- 1. Add Google Cloud API credentials to platform_settings
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS google_client_id TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS google_client_secret TEXT;

-- 2. Google Business Accounts (OAuth connection per tenant)
CREATE TABLE IF NOT EXISTS google_business_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  google_user_id TEXT,
  email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, google_user_id)
);

-- 3. Google Business Locations (Storefront listings)
CREATE TABLE IF NOT EXISTS google_business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  google_account_id UUID REFERENCES google_business_accounts(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  location_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  website TEXT,
  primary_category TEXT,
  is_verified BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, location_id)
);

-- 4. Google Business Reviews
CREATE TABLE IF NOT EXISTS google_business_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  location_id UUID REFERENCES google_business_locations(id) ON DELETE CASCADE,
  google_review_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_photo_url TEXT,
  star_rating INTEGER NOT NULL,
  comment TEXT,
  review_timestamp TIMESTAMPTZ,
  reply_text TEXT,
  reply_timestamp TIMESTAMPTZ,
  is_replied BOOLEAN DEFAULT false,
  sentiment TEXT DEFAULT 'positive',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, google_review_id)
);

-- RLS policies
ALTER TABLE google_business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_business_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'google_business_accounts_tenant_isolation'
  ) THEN
    CREATE POLICY google_business_accounts_tenant_isolation ON google_business_accounts
      FOR ALL USING (account_id = current_setting('app.current_account_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'google_business_locations_tenant_isolation'
  ) THEN
    CREATE POLICY google_business_locations_tenant_isolation ON google_business_locations
      FOR ALL USING (account_id = current_setting('app.current_account_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'google_business_reviews_tenant_isolation'
  ) THEN
    CREATE POLICY google_business_reviews_tenant_isolation ON google_business_reviews
      FOR ALL USING (account_id = current_setting('app.current_account_id', true)::uuid);
  END IF;
END $$;
