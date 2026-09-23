import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getAccountWallet, getWalletRates } from '@/lib/billing/wallet';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account associated with user.' }, { status: 400 });
    }

    const accountId = profile.account_id;
    const adminSupabase = getAdminSupabase();

    const [wallet, rates, txRes] = await Promise.all([
      getAccountWallet(accountId),
      getWalletRates(),
      adminSupabase
        .from('wallet_transactions')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    return NextResponse.json({
      wallet,
      rates,
      transactions: txRes.data || [],
    });
  } catch (err: any) {
    console.error('[API /api/wallet] GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
