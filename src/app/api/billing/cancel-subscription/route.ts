import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
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

    if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only the account owner or admin can cancel the subscription.' },
        { status: 403 }
      );
    }

    const adminSupabase = getAdminSupabase();

    // Find default trial plan
    const { data: trialPlan } = await adminSupabase
      .from('plans')
      .select('id')
      .eq('slug', 'trial')
      .maybeSingle();

    // Update account status
    const { error: accErr } = await adminSupabase
      .from('accounts')
      .update({
        plan_id: trialPlan?.id || null,
        subscription_status: 'cancelled',
        current_period_end: null,
      })
      .eq('id', profile.account_id);

    if (accErr) {
      return NextResponse.json({ error: accErr.message }, { status: 500 });
    }

    // Cancel active subscriptions in subscriptions table
    await adminSupabase
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('account_id', profile.account_id)
      .eq('status', 'active');

    // Audit log
    await adminSupabase.from('audit_logs').insert({
      actor_user_id: user.id,
      action: 'user_cancel_subscription',
      target_type: 'account',
      target_id: profile.account_id,
      details: {
        cancelledAt: new Date().toISOString(),
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription cancelled successfully. Your account has been reverted to the Free Trial tier.',
    });
  } catch (err: any) {
    console.error('[API /api/billing/cancel-subscription] POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
