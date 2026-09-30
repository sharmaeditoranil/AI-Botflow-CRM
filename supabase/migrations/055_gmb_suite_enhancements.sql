-- ============================================================
-- Migration 055: GMB Suite Enhancements
-- 1. Google Business Posts & Smart Scheduling
-- 2. Magic QR (Smart Review Funnel & Negative Review Filter)
-- 3. Private Customer Feedback Management
-- ============================================================

-- 1. Google Business Posts & Scheduler
CREATE TABLE IF NOT EXISTS google_business_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  location_id UUID REFERENCES google_business_locations(id) ON DELETE SET NULL,
  topic_type TEXT DEFAULT 'STANDARD', -- 'STANDARD', 'OFFER', 'EVENT', 'ALERT'
  summary TEXT,
  content TEXT NOT NULL,
  call_to_action_type TEXT DEFAULT 'NONE', -- 'BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'
  call_to_action_url TEXT,
  media_url TEXT,
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'published', 'failed'
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  google_post_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmb_posts_account ON google_business_posts(account_id);
CREATE INDEX IF NOT EXISTS idx_gmb_posts_status ON google_business_posts(status, scheduled_at);

-- 2. Magic QR Settings
CREATE TABLE IF NOT EXISTS google_business_magic_qr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  location_id UUID REFERENCES google_business_locations(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  google_review_url TEXT,
  place_id TEXT,
  min_star_for_google INTEGER DEFAULT 4,
  whatsapp_alert_number TEXT,
  heading TEXT DEFAULT 'Rate Your Experience',
  subheading TEXT DEFAULT 'Your honest feedback helps us serve you better.',
  thank_you_title TEXT DEFAULT 'Thank you for your feedback!',
  thank_you_message TEXT DEFAULT 'We value your input and will use it to improve our service.',
  is_active BOOLEAN DEFAULT true,
  qr_scans_count INTEGER DEFAULT 0,
  positive_redirects_count INTEGER DEFAULT 0,
  negative_feedbacks_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_gmb_magic_qr_slug ON google_business_magic_qr(slug);
CREATE INDEX IF NOT EXISTS idx_gmb_magic_qr_account ON google_business_magic_qr(account_id);

-- 3. Private Customer Feedback (1-3 Stars captured before reaching Google)
CREATE TABLE IF NOT EXISTS google_business_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  magic_qr_id UUID REFERENCES google_business_magic_qr(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  star_rating INTEGER NOT NULL,
  feedback_text TEXT NOT NULL,
  status TEXT DEFAULT 'new', -- 'new', 'in_progress', 'resolved'
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmb_feedbacks_account ON google_business_feedbacks(account_id);

-- Enable RLS
ALTER TABLE google_business_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_business_magic_qr ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_business_feedbacks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'google_business_posts_tenant_isolation'
  ) THEN
    CREATE POLICY google_business_posts_tenant_isolation ON google_business_posts
      FOR ALL USING (account_id = current_setting('app.current_account_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'google_business_magic_qr_tenant_isolation'
  ) THEN
    CREATE POLICY google_business_magic_qr_tenant_isolation ON google_business_magic_qr
      FOR ALL USING (account_id = current_setting('app.current_account_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'google_business_feedbacks_tenant_isolation'
  ) THEN
    CREATE POLICY google_business_feedbacks_tenant_isolation ON google_business_feedbacks
      FOR ALL USING (account_id = current_setting('app.current_account_id', true)::uuid);
  END IF;
END $$;
