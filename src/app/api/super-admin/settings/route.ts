import { NextRequest, NextResponse } from 'next/server';
import { assertSuperAdmin, getAdminSupabase, logSuperAdminAction } from '@/lib/auth/super-admin';

export async function GET() {
  try {
    await assertSuperAdmin();
    const supabase = getAdminSupabase();

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 'default')
      .single();

    return NextResponse.json({
      settings: settings || {
        meta_app_id: '',
        meta_app_secret: '',
        meta_config_id: '',
        razorpay_key_id: '',
        razorpay_key_secret: '',
        razorpay_webhook_secret: '',
        google_client_id: '',
        google_client_secret: '',
        support_email: 'support@aibotflow.in',
        support_phone: '',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await assertSuperAdmin();
    const supabase = getAdminSupabase();
    const body = await req.json();

    const {
      meta_app_id,
      meta_app_secret,
      meta_config_id,
      razorpay_key_id,
      razorpay_key_secret,
      razorpay_webhook_secret,
      google_client_id,
      google_client_secret,
      support_email,
      support_phone,
    } = body;

    const payload = {
      id: 'default',
      meta_app_id: meta_app_id?.trim() || null,
      meta_app_secret: meta_app_secret?.trim() || null,
      meta_config_id: meta_config_id?.trim() || null,
      razorpay_key_id: razorpay_key_id?.trim() || null,
      razorpay_key_secret: razorpay_key_secret?.trim() || null,
      razorpay_webhook_secret: razorpay_webhook_secret?.trim() || null,
      google_client_id: google_client_id?.trim() || null,
      google_client_secret: google_client_secret?.trim() || null,
      support_email: support_email?.trim() || 'support@aibotflow.in',
      support_phone: support_phone?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('platform_settings')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logSuperAdminAction({
      actorUserId: admin.userId,
      action: 'update_platform_settings',
      targetType: 'platform_settings',
      targetId: 'default',
      details: {
        metaAppIdConfigured: !!payload.meta_app_id,
        razorpayKeyConfigured: !!payload.razorpay_key_id,
      },
    });

    return NextResponse.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
