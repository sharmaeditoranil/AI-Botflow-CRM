-- ============================================================
-- 052_prepaid_wallet_system.sql
-- Prepaid Wallet & Per-Message WhatsApp Credit Billing System
-- ============================================================

-- 1. Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  balance NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (balance >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_account_id ON wallets(account_id);

-- 2. Wallet Transactions (Audit Passbook) Table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'refund')),
  amount NUMERIC(12, 4) NOT NULL,
  balance_after NUMERIC(12, 4) NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_account_id ON wallet_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

-- 3. Extend platform_settings with Wallet configuration & rates
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS wallet_system_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wallet_rate_marketing NUMERIC(10, 4) DEFAULT 0.8500,
  ADD COLUMN IF NOT EXISTS wallet_rate_utility NUMERIC(10, 4) DEFAULT 0.1500,
  ADD COLUMN IF NOT EXISTS wallet_rate_service NUMERIC(10, 4) DEFAULT 0.3500,
  ADD COLUMN IF NOT EXISTS wallet_rate_auth NUMERIC(10, 4) DEFAULT 0.1500;

-- 4. Function: get_or_create_wallet
CREATE OR REPLACE FUNCTION get_or_create_wallet(p_account_id UUID)
RETURNS wallets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets;
BEGIN
  SELECT * INTO v_wallet FROM wallets WHERE account_id = p_account_id;
  IF NOT FOUND THEN
    INSERT INTO wallets (account_id, balance, currency, is_active)
    VALUES (p_account_id, 0.0000, 'INR', true)
    ON CONFLICT (account_id) DO UPDATE SET updated_at = NOW()
    RETURNING * INTO v_wallet;
  END IF;
  RETURN v_wallet;
END;
$$;

-- 5. Atomic Procedure: deduct_wallet_balance
CREATE OR REPLACE FUNCTION deduct_wallet_balance(
  p_account_id UUID,
  p_amount NUMERIC,
  p_ref_type TEXT,
  p_ref_id TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets;
  v_new_balance NUMERIC(12, 4);
  v_tx_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount', 'message', 'Amount must be greater than zero');
  END IF;

  -- Ensure wallet exists
  PERFORM get_or_create_wallet(p_account_id);

  -- Lock wallet row for update to guarantee atomicity
  SELECT * INTO v_wallet
  FROM wallets
  WHERE account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'wallet_not_found', 'message', 'Wallet not found for this account');
  END IF;

  IF NOT v_wallet.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'wallet_disabled', 'message', 'Wallet is suspended or inactive');
  END IF;

  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'message', 'Insufficient wallet balance',
      'current_balance', v_wallet.balance,
      'required_amount', p_amount
    );
  END IF;

  v_new_balance := v_wallet.balance - p_amount;

  UPDATE wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO wallet_transactions (
    account_id,
    wallet_id,
    type,
    amount,
    balance_after,
    reference_type,
    reference_id,
    description,
    metadata
  ) VALUES (
    p_account_id,
    v_wallet.id,
    'debit',
    p_amount,
    v_new_balance,
    p_ref_type,
    p_ref_id,
    p_description,
    p_metadata
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_id', v_tx_id,
    'deducted_amount', p_amount
  );
END;
$$;

-- 6. Atomic Procedure: credit_wallet_balance
CREATE OR REPLACE FUNCTION credit_wallet_balance(
  p_account_id UUID,
  p_amount NUMERIC,
  p_ref_type TEXT,
  p_ref_id TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets;
  v_new_balance NUMERIC(12, 4);
  v_tx_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount', 'message', 'Amount must be greater than zero');
  END IF;

  -- Ensure wallet exists
  PERFORM get_or_create_wallet(p_account_id);

  -- Lock wallet row for update
  SELECT * INTO v_wallet
  FROM wallets
  WHERE account_id = p_account_id
  FOR UPDATE;

  v_new_balance := v_wallet.balance + p_amount;

  UPDATE wallets
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO wallet_transactions (
    account_id,
    wallet_id,
    type,
    amount,
    balance_after,
    reference_type,
    reference_id,
    description,
    metadata
  ) VALUES (
    p_account_id,
    v_wallet.id,
    'credit',
    p_amount,
    v_new_balance,
    p_ref_type,
    p_ref_id,
    p_description,
    p_metadata
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_id', v_tx_id,
    'credited_amount', p_amount
  );
END;
$$;

-- 7. Row Level Security Policies
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view wallet" ON wallets;
CREATE POLICY "Account members can view wallet"
  ON wallets FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Account members can view wallet transactions" ON wallet_transactions;
CREATE POLICY "Account members can view wallet transactions"
  ON wallet_transactions FOR SELECT
  USING (is_account_member(account_id, 'viewer'));
