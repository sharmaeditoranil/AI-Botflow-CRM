import { NextRequest, NextResponse } from 'next/server';
import { assertSuperAdmin, logSuperAdminAction } from '@/lib/auth/super-admin';
import { getPlanFeaturesConfig, savePlanFeaturesConfig } from '@/lib/billing/plan-features';

export async function GET() {
  try {
    await assertSuperAdmin();
    const config = await getPlanFeaturesConfig();
    return NextResponse.json({ config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await assertSuperAdmin();
    const body = await req.json();
    const { planSlug, updates, config } = body;

    let success = false;
    if (config) {
      success = await savePlanFeaturesConfig(config);
    } else if (planSlug && updates) {
      success = await savePlanFeaturesConfig({ [planSlug]: updates });
    } else {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!success) {
      return NextResponse.json({ error: 'Failed to save plan features.' }, { status: 500 });
    }

    await logSuperAdminAction({
      actorUserId: admin.userId,
      action: 'update_plan_features',
      targetType: 'platform_settings',
      targetId: 'plan_features',
      details: { planSlug, updates, config },
    });

    const updated = await getPlanFeaturesConfig();
    return NextResponse.json({ success: true, message: 'Plan features updated successfully.', config: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
