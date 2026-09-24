import { createClient as createAdminClient } from '@supabase/supabase-js';

export interface WalletRates {
  marketing: number;
  utility: number;
  service: number;
  auth: number;
  enabled: boolean;
}

export const DEFAULT_WALLET_RATES: WalletRates = {
  marketing: 0.85,
  utility: 0.15,
  service: 0.35,
  auth: 0.15,
  enabled: true,
};

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key);
}

/**
 * Fetch platform-wide wallet settings and per-message pricing rates.
 */
export async function getWalletRates(): Promise<WalletRates> {
  const supabase = getAdminSupabase();
  if (!supabase) return DEFAULT_WALLET_RATES;

  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('wallet_system_enabled, wallet_rate_marketing, wallet_rate_utility, wallet_rate_service, wallet_rate_auth')
      .eq('id', 'default')
      .maybeSingle();

    if (!data) return DEFAULT_WALLET_RATES;

    return {
      enabled: data.wallet_system_enabled !== false,
      marketing: Number(data.wallet_rate_marketing ?? DEFAULT_WALLET_RATES.marketing),
      utility: Number(data.wallet_rate_utility ?? DEFAULT_WALLET_RATES.utility),
      service: Number(data.wallet_rate_service ?? DEFAULT_WALLET_RATES.service),
      auth: Number(data.wallet_rate_auth ?? DEFAULT_WALLET_RATES.auth),
    };
  } catch {
    return DEFAULT_WALLET_RATES;
  }
}

/**
 * Get or initialize account wallet.
 */
export async function getAccountWallet(accountId: string): Promise<{
  id: string;
  account_id: string;
  balance: number;
  currency: string;
  is_active: boolean;
}> {
  const supabase = getAdminSupabase();
  if (!supabase) {
    return {
      id: 'mock-wallet',
      account_id: accountId,
      balance: 999999,
      currency: 'INR',
      is_active: true,
    };
  }

  // Try RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_or_create_wallet', {
    p_account_id: accountId,
  });

  if (!rpcError && rpcData) {
    return {
      id: rpcData.id,
      account_id: rpcData.account_id,
      balance: Number(rpcData.balance || 0),
      currency: rpcData.currency || 'INR',
      is_active: rpcData.is_active !== false,
    };
  }

  // Fallback to table query / upsert
  const { data: existing } = await supabase
    .from('wallets')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      account_id: existing.account_id,
      balance: Number(existing.balance || 0),
      currency: existing.currency || 'INR',
      is_active: existing.is_active !== false,
    };
  }

  const { data: created, error: insertError } = await supabase
    .from('wallets')
    .insert({
      account_id: accountId,
      balance: 0.0,
      currency: 'INR',
      is_active: true,
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('[Wallet] Error creating wallet row:', insertError);
    return {
      id: '',
      account_id: accountId,
      balance: 0,
      currency: 'INR',
      is_active: true,
    };
  }

  return {
    id: created.id,
    account_id: created.account_id,
    balance: Number(created.balance || 0),
    currency: created.currency || 'INR',
    is_active: created.is_active !== false,
  };
}

/**
 * Calculate per-message cost based on category.
 */
export function calculateMessageCost(
  category: string | undefined | null,
  rates: WalletRates = DEFAULT_WALLET_RATES
): number {
  if (!category) return rates.service;

  const normalized = category.toLowerCase().trim();
  if (normalized.includes('marketing')) return rates.marketing;
  if (normalized.includes('utility')) return rates.utility;
  if (normalized.includes('auth')) return rates.auth;
  if (normalized.includes('service')) return rates.service;

  return rates.utility;
}

/**
 * Helper to determine if an account is owned or operated by a verified Super Admin.
 */
export async function isSuperAdminAccount(accountId: string): Promise<boolean> {
  const supabase = getAdminSupabase();
  if (!supabase) return false;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('account_id', accountId)
      .eq('is_super_admin', true)
      .limit(1)
      .maybeSingle();

    return Boolean(data?.is_super_admin);
  } catch {
    return false;
  }
}

/**
 * Check if the account has sufficient wallet balance for a given amount.
 */
export async function checkWalletBalance(
  accountId: string,
  requiredAmount: number
): Promise<{ allowed: boolean; balance: number; rates: WalletRates }> {
  const rates = await getWalletRates();

  if (!rates.enabled || requiredAmount <= 0) {
    return { allowed: true, balance: 999999, rates };
  }

  // Only verified Super-Admin accounts bypass wallet balance checks (billed via direct Meta card)
  if (await isSuperAdminAccount(accountId)) {
    return { allowed: true, balance: 999999, rates };
  }

  const wallet = await getAccountWallet(accountId);

  return {
    allowed: wallet.is_active && wallet.balance >= requiredAmount,
    balance: wallet.balance,
    rates,
  };
}

/**
 * Atomically deduct wallet credits and write to the transaction passbook.
 */
export async function deductWalletCredits(params: {
  accountId: string;
  amount: number;
  referenceType: 'broadcast' | 'webhook_trigger' | 'direct_send' | 'automation' | 'admin_adjustment';
  referenceId?: string | null;
  description: string;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const rates = await getWalletRates();
  if (!rates.enabled || params.amount <= 0) {
    return { success: true };
  }

  const supabase = getAdminSupabase();
  if (!supabase) return { success: true };

  // Only verified Super-Admin accounts bypass deductions (billed directly on Meta card)
  if (await isSuperAdminAccount(params.accountId)) {
    return { success: true, newBalance: 999999 };
  }

  const { data, error } = await supabase.rpc('deduct_wallet_balance', {
    p_account_id: params.accountId,
    p_amount: params.amount,
    p_ref_type: params.referenceType,
    p_ref_id: params.referenceId || null,
    p_description: params.description,
    p_metadata: params.metadata || {},
  });

  if (error) {
    console.error('[Wallet] deduct_wallet_balance RPC error:', error);
    return { success: false, error: error.message };
  }

  if (!data?.success) {
    return {
      success: false,
      error: data?.message || data?.error || 'Insufficient wallet balance',
    };
  }

  return {
    success: true,
    newBalance: Number(data.new_balance),
  };
}

/**
 * Atomically credit wallet balance (e.g. after Razorpay recharge or admin adjustment).
 */
export async function creditWalletBalance(params: {
  accountId: string;
  amount: number;
  referenceType: 'razorpay_recharge' | 'admin_adjustment' | 'bonus' | 'refund';
  referenceId?: string | null;
  description: string;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (params.amount <= 0) {
    return { success: false, error: 'Credit amount must be greater than zero' };
  }

  const supabase = getAdminSupabase();
  if (!supabase) return { success: true };

  const { data, error } = await supabase.rpc('credit_wallet_balance', {
    p_account_id: params.accountId,
    p_amount: params.amount,
    p_ref_type: params.referenceType,
    p_ref_id: params.referenceId || null,
    p_description: params.description,
    p_metadata: params.metadata || {},
  });

  if (error) {
    console.error('[Wallet] credit_wallet_balance RPC error:', error);
    return { success: false, error: error.message };
  }

  return {
    success: true,
    newBalance: Number(data?.new_balance),
  };
}
