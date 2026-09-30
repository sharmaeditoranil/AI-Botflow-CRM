import { NextRequest, NextResponse } from 'next/server';
import { assertSuperAdmin, getAdminSupabase, logSuperAdminAction } from '@/lib/auth/super-admin';
import { getPlanFeaturesConfig, DEFAULT_PLAN_FEATURES } from '@/lib/billing/plan-features';

export async function GET() {
  try {
    await assertSuperAdmin();
    const supabase = getAdminSupabase();

    const [plansRes, featuresConfig] = await Promise.all([
      supabase
        .from('plans')
        .select('*')
        .order('sort_order', { ascending: true }),
      getPlanFeaturesConfig(),
    ]);

    if (plansRes.error) {
      return NextResponse.json({ error: plansRes.error.message }, { status: 500 });
    }

    const enrichedPlans = (plansRes.data || []).map((p) => ({
      ...p,
      features: featuresConfig[p.slug] || DEFAULT_PLAN_FEATURES[p.slug] || DEFAULT_PLAN_FEATURES.starter,
    }));

    return NextResponse.json({ plans: enrichedPlans, featuresConfig });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await assertSuperAdmin();
    const supabase = getAdminSupabase();
    const body = await req.json();
    const {
      id,
      name,
      description,
      price_monthly,
      price_yearly,
      max_contacts,
      max_broadcasts_monthly,
      max_team_members,
      max_automations,
      max_flows,
      ai_agents_enabled,
      is_active,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (price_monthly !== undefined) updates.price_monthly = Number(price_monthly);
    if (price_yearly !== undefined) updates.price_yearly = Number(price_yearly);
    if (max_contacts !== undefined) updates.max_contacts = Number(max_contacts);
    if (max_broadcasts_monthly !== undefined) updates.max_broadcasts_monthly = Number(max_broadcasts_monthly);
    if (max_team_members !== undefined) updates.max_team_members = Number(max_team_members);
    if (max_automations !== undefined) updates.max_automations = Number(max_automations);
    if (max_flows !== undefined) updates.max_flows = Number(max_flows);
    if (ai_agents_enabled !== undefined) updates.ai_agents_enabled = Boolean(ai_agents_enabled);
    if (is_active !== undefined) updates.is_active = is_active;

    const { error } = await supabase.from('plans').update(updates).eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logSuperAdminAction({
      actorUserId: admin.userId,
      action: 'update_plan',
      targetType: 'plan',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ success: true, message: 'Plan updated successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
