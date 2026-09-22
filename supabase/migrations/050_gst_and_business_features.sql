-- ============================================================
-- 050_gst_and_business_features.sql
-- Supports:
-- 1. GST Invoicing & Payment History
-- 2. Accounts GST & CSAT & AI Followup Settings
-- 3. Products / Catalog
-- 4. CSAT Surveys & Deals AI Followup
-- ============================================================

-- Invoices Table Extensions
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 18,
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_state TEXT;

-- Accounts Table Extensions
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_state TEXT,
  ADD COLUMN IF NOT EXISTS csat_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_review_url TEXT,
  ADD COLUMN IF NOT EXISTS ai_followup_enabled BOOLEAN DEFAULT TRUE;

-- Deals Table Extensions
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS ai_followup_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS followup_instructions TEXT;

-- Products / Catalog Table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  image_url TEXT,
  sku TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view products" ON products;
CREATE POLICY "Account members can view products"
  ON products FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Account admins can manage products" ON products;
CREATE POLICY "Account admins can manage products"
  ON products FOR ALL
  USING (is_account_member(account_id, 'agent'));

-- CSAT Responses Table
CREATE TABLE IF NOT EXISTS csat_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE csat_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view csat" ON csat_responses;
CREATE POLICY "Account members can view csat"
  ON csat_responses FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Account agents can insert csat" ON csat_responses;
CREATE POLICY "Account agents can insert csat"
  ON csat_responses FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
