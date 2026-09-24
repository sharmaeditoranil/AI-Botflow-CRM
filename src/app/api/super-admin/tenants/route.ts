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
        trialEndsAt: acct.trial_ends_at,
        currentPeriodEnd: acct.current_period_end,
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
    const { accountId, isSuspended, planId, subscriptionStatus, trialEndsAt, currentPeriodEnd } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required.' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof isSuspended === 'boolean') updates.is_suspended = isSuspended;
    if (planId) updates.plan_id = planId;
    if (subscriptionStatus) updates.subscription_status = subscriptionStatus;
    if (trialEndsAt !== undefined) updates.trial_ends_at = trialEndsAt;
    if (currentPeriodEnd !== undefined) updates.current_period_end = currentPeriodEnd;

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

export async function DELETE(req: NextRequest) {
  try {
    const admin = await assertSuperAdmin();
    const supabase = getAdminSupabase();

    const { searchParams } = new URL(req.url);
    let accountId = searchParams.get('accountId');
    let action = searchParams.get('action') || 'delete_account'; // 'delete_account' | 'delete_subscription'

    // Also support JSON body if sent
    if (!accountId) {
      try {
        const body = await req.json();
        accountId = body.accountId;
        if (body.action) action = body.action;
      } catch {
        // query param fallback
      }
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required.' }, { status: 400 });
    }

    // Safety: prevent self-deletion or deleting any super admin account
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', admin.userId)
      .maybeSingle();

    if (adminProfile?.account_id === accountId) {
      return NextResponse.json(
        { error: 'Action denied: You cannot delete or reset your own active Super-Admin account.' },
        { status: 400 }
      );
    }

    const { data: targetProfiles } = await supabase
      .from('profiles')
      .select('user_id, is_super_admin')
      .eq('account_id', accountId);

    if (targetProfiles?.some((p) => p.is_super_admin)) {
      return NextResponse.json(
        { error: 'Action denied: Cannot delete an account belonging to a Super Admin.' },
        { status: 400 }
      );
    }

    if (action === 'delete_subscription') {
      const { data: trialPlan } = await supabase
        .from('plans')
        .select('id')
        .eq('slug', 'trial')
        .maybeSingle();

      const { error: accSubErr } = await supabase
        .from('accounts')
        .update({
          plan_id: trialPlan?.id || null,
          subscription_status: 'cancelled',
          current_period_end: null,
          trial_ends_at: null,
        })
        .eq('id', accountId);

      if (accSubErr) {
        return NextResponse.json({ error: accSubErr.message }, { status: 500 });
      }

      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('account_id', accountId);

      await logSuperAdminAction({
        actorUserId: admin.userId,
        action: 'cancel_tenant_subscription',
        targetType: 'account',
        targetId: accountId,
        details: { cancelledAt: new Date().toISOString() },
      });

      return NextResponse.json({ success: true, message: 'Subscription removed and cancelled successfully.' });
    }

    // Action: delete_account
    // 1. Delete associated non-admin auth users
    for (const p of targetProfiles || []) {
      if (p.user_id) {
        try {
          await supabase.auth.admin.deleteUser(p.user_id);
        } catch (authErr) {
          console.warn('Could not delete auth user:', authErr);
        }
      }
    }

    // 2. Delete the account row (all child tables cascade ON DELETE CASCADE)
    const { error: delError } = await supabase.from('accounts').delete().eq('id', accountId);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    await logSuperAdminAction({
      actorUserId: admin.userId,
      action: 'delete_tenant_account',
      targetType: 'account',
      targetId: accountId,
      details: { deletedAt: new Date().toISOString() },
    });

    return NextResponse.json({ success: true, message: 'Tenant account permanently deleted.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
