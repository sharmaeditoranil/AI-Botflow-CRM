import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
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
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account associated with user.' }, { status: 400 });
    }

    const adminSupabase = getAdminSupabase();

    // Fetch invoices for this account with subscription & plan info
    const { data: invoices, error } = await adminSupabase
      .from('invoices')
      .select(`
        *,
        subscription:subscriptions(
          id,
          billing_cycle,
          plan:plans(id, name, slug)
        )
      `)
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invoices:', error);
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }

    // Also fetch account GST / business info
    const { data: account } = await adminSupabase
      .from('accounts')
      .select('name, gst_number, business_name, billing_address, billing_state')
      .eq('id', profile.account_id)
      .maybeSingle();

    return NextResponse.json({
      invoices: invoices || [],
      account: account || {},
    });
  } catch (err: any) {
    console.error('Invoice retrieval error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
