import { NextRequest, NextResponse } from 'next/server';
import { assertSuperAdmin, getAdminSupabase, logSuperAdminAction } from '@/lib/auth/super-admin';

export async function GET() {
  try {
    await assertSuperAdmin();
    const supabase = getAdminSupabase();

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select(`
        id,
        name,
        created_at,
        subscription_status,
        trial_ends_at,
        current_period_end,
        is_suspended,
        plans (id, name, slug),
        whatsapp_config (status, phone_number_id, connected_at)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch owner emails for each account
    const { data: owners } = await supabase
      .from('profiles')
      .select('account_id, email, full_name')
      .eq('account_role', 'owner');

    const ownerMap = new Map((owners || []).map((o) => [o.account_id, o]));

    const formatted = (accounts || []).map((acct: any) => {
      const owner = ownerMap.get(acct.id);
      return {
        id: acct.id,
        name: acct.name,
        ownerEmail: owner?.email || 'Unknown',
        ownerName: owner?.full_name || '',
        planName: acct.plans?.name || 'No Plan',
        planId: acct.plans?.id,
        subscriptionStatus: acct.subscription_status,
        isSuspended: !!acct.is_suspended,
        whatsappConnected: acct.whatsapp_config?.[0]?.status === 'connected',
        createdAt: acct.created_at,
      };
    });

    return NextResponse.json({ tenants: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await assertSuperAdmin();
    const supabase = getAdminSupabase();
    const body = await req.json();
    const { accountId, isSuspended, planId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required.' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof isSuspended === 'boolean') updates.is_suspended = isSuspended;
    if (planId) updates.plan_id = planId;

    const { error } = await supabase.from('accounts').update(updates).eq('id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logSuperAdminAction({
      actorUserId: admin.userId,
      action: isSuspended !== undefined ? (isSuspended ? 'suspend_tenant' : 'reactivate_tenant') : 'update_tenant_plan',
      targetType: 'account',
      targetId: accountId,
      details: updates,
    });

    return NextResponse.json({ success: true, message: 'Tenant updated successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
