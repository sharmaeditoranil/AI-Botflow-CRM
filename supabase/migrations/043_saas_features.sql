-- ============================================================
-- 043_saas_features.sql — Aibotflow SaaS Subscriptions & Super-Admin
-- Idempotent migration — safe to run multiple times.
-- ============================================================

-- 1. OPERATIONAL PLATFORM SETTINGS (Meta & Payment Gateway Config)
CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  meta_app_id TEXT,
  meta_app_secret TEXT,
  meta_config_id TEXT,
  payment_gateway TEXT DEFAULT 'razorpay',
  razorpay_key_id TEXT,
  razorpay_key_secret TEXT,
  razorpay_webhook_secret TEXT,
  stripe_publishable_key TEXT,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  currency TEXT DEFAULT 'INR',
  trial_days INT DEFAULT 14,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed single settings row
INSERT INTO platform_settings (id, payment_gateway, currency, trial_days)
VALUES ('default', 'razorpay', 'INR', 14)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- 2. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  price_yearly NUMERIC NOT NULL DEFAULT 0,
  max_contacts INT NOT NULL DEFAULT 1000,
  max_team_members INT NOT NULL DEFAULT 2,
  max_broadcasts_monthly INT NOT NULL DEFAULT 5000,
  max_automations INT NOT NULL DEFAULT 5,
  max_flows INT NOT NULL DEFAULT 5,
  ai_agents_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default_trial BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active plans" ON plans;
CREATE POLICY "Anyone can view active plans"
  ON plans FOR SELECT
  USING (is_active = true);

-- Seed standard plans
INSERT INTO plans (name, slug, description, price_monthly, price_yearly, max_contacts, max_team_members, max_broadcasts_monthly, max_automations, max_flows, ai_agents_enabled, is_active, is_default_trial, sort_order)
VALUES
  ('Free Trial', 'trial', '14-day free trial with all core Aibotflow features', 0, 0, 500, 2, 1000, 3, 3, false, true, true, 1),
  ('Starter', 'starter', 'For small businesses getting started with WhatsApp CRM', 999, 9990, 2000, 3, 10000, 10, 10, false, true, false, 2),
  ('Growth', 'growth', 'Complete CRM with automation, broadcasts & AI agents', 2499, 24990, 10000, 10, 50000, 30, 30, true, true, false, 3),
  ('Enterprise', 'enterprise', 'Unlimited contacts, dedicated support and high volume', 5999, 59990, 50000, 50, 200000, 100, 100, true, true, false, 4),
  ('Founder / Unlimited', 'founder', 'Grandfathered plan for initial accounts', 0, 0, 999999, 999, 999999, 999, 999, true, false, false, 99)
ON CONFLICT (slug) DO NOTHING;

-- 3. EXTEND ACCOUNTS TABLE
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_subscription_id TEXT;

-- Backfill existing accounts with Founder plan
UPDATE accounts
SET plan_id = (SELECT id FROM plans WHERE slug = 'founder' LIMIT 1),
    subscription_status = 'active',
    trial_ends_at = NULL
WHERE plan_id IS NULL;

-- 4. EXTEND PROFILES TABLE (Super Admin Flag)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Grant Super Admin status to user email
UPDATE profiles
SET is_super_admin = TRUE
WHERE email = 'sharmaeditoranil@gmail.com';

-- 5. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  gateway TEXT DEFAULT 'razorpay',
  gateway_subscription_id TEXT,
  gateway_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view own subscription" ON subscriptions;
CREATE POLICY "Account members can view own subscription"
  ON subscriptions FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- 6. INVOICES TABLE
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'paid',
  gateway_payment_id TEXT,
  gateway_invoice_id TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view own invoices" ON invoices;
CREATE POLICY "Account members can view own invoices"
  ON invoices FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- 7. COUPONS TABLE
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL,
  max_redemptions INT,
  redemptions_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can validate active coupon" ON coupons;
CREATE POLICY "Anyone can validate active coupon"
  ON coupons FOR SELECT
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

-- 8. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 9. SUPER ADMIN HELPER FUNCTION
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = $1
      AND profiles.is_super_admin = TRUE
  );
$$;

-- Super admin RLS policies
DROP POLICY IF EXISTS "Super admins manage platform settings" ON platform_settings;
CREATE POLICY "Super admins manage platform settings"
  ON platform_settings FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins manage plans" ON plans;
CREATE POLICY "Super admins manage plans"
  ON plans FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins view all subscriptions" ON subscriptions;
CREATE POLICY "Super admins view all subscriptions"
  ON subscriptions FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins view all invoices" ON invoices;
CREATE POLICY "Super admins view all invoices"
  ON invoices FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins manage coupons" ON coupons;
CREATE POLICY "Super admins manage coupons"
  ON coupons FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins view audit logs" ON audit_logs;
CREATE POLICY "Super admins view audit logs"
  ON audit_logs FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admins manage all accounts" ON accounts;
CREATE POLICY "Super admins manage all accounts"
  ON accounts FOR ALL
  USING (is_super_admin());

-- 10. UPDATE handle_new_user TO ASSIGN TRIAL PLAN
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
  v_trial_plan_id UUID;
  v_is_super BOOLEAN := FALSE;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Automatically grant super-admin to owner email
  IF NEW.email = 'sharmaeditoranil@gmail.com' THEN
    v_is_super := TRUE;
  END IF;

  -- Find default trial plan
  SELECT id INTO v_trial_plan_id FROM public.plans WHERE slug = 'trial' OR is_default_trial = TRUE LIMIT 1;

  INSERT INTO public.accounts (
    name,
    owner_user_id,
    plan_id,
    subscription_status,
    trial_ends_at
  )
  VALUES (
    COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id,
    v_trial_plan_id,
    'trialing',
    NOW() + INTERVAL '14 days'
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (
    user_id,
    full_name,
    email,
    account_id,
    account_role,
    is_super_admin
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_account_id,
    'owner',
    v_is_super
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
