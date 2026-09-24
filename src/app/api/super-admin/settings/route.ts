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

    const defaultSettings = {
      meta_app_id: '',
      meta_app_secret: '',
      meta_config_id: '',
      razorpay_key_id: '',
      razorpay_key_secret: '',
      razorpay_webhook_secret: '',
      google_client_id: process.env.GOOGLE_CLIENT_ID || '',
      google_client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      admin_openai_api_key: process.env.OPENAI_API_KEY || '',
      admin_gemini_api_key: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
      admin_ai_model: 'gpt-4o-mini',
      support_email: 'support@aibotflow.in',
      support_phone: '',
      wallet_system_enabled: true,
      wallet_rate_marketing: 0.85,
      wallet_rate_utility: 0.15,
      wallet_rate_service: 0.35,
      wallet_rate_auth: 0.15,
    };

    const finalSettings = {
      ...defaultSettings,
      ...(settings || {}),
      google_client_id:
        settings?.google_client_id || process.env.GOOGLE_CLIENT_ID || '',
      google_client_secret:
        settings?.google_client_secret || process.env.GOOGLE_CLIENT_SECRET || '',
      admin_openai_api_key:
        settings?.admin_openai_api_key || process.env.OPENAI_API_KEY || '',
      admin_gemini_api_key:
        settings?.admin_gemini_api_key || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '',
      admin_ai_model:
        settings?.admin_ai_model || 'gpt-4o-mini',
    };

    return NextResponse.json({
      settings: finalSettings,
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
      admin_openai_api_key,
      admin_gemini_api_key,
      admin_ai_model,
      support_email,
      support_phone,
      wallet_system_enabled,
      wallet_rate_marketing,
      wallet_rate_utility,
      wallet_rate_service,
      wallet_rate_auth,
    } = body;

    const payload: Record<string, any> = {
      id: 'default',
      updated_at: new Date().toISOString(),
    };

    if ('meta_app_id' in body) payload.meta_app_id = body.meta_app_id?.trim() || null;
    if ('meta_app_secret' in body) payload.meta_app_secret = body.meta_app_secret?.trim() || null;
    if ('meta_config_id' in body) payload.meta_config_id = body.meta_config_id?.trim() || null;
    if ('razorpay_key_id' in body) payload.razorpay_key_id = body.razorpay_key_id?.trim() || null;
    if ('razorpay_key_secret' in body) payload.razorpay_key_secret = body.razorpay_key_secret?.trim() || null;
    if ('razorpay_webhook_secret' in body) payload.razorpay_webhook_secret = body.razorpay_webhook_secret?.trim() || null;
    if ('google_client_id' in body) payload.google_client_id = body.google_client_id?.trim() || null;
    if ('google_client_secret' in body) payload.google_client_secret = body.google_client_secret?.trim() || null;
    if ('admin_openai_api_key' in body) payload.admin_openai_api_key = body.admin_openai_api_key?.trim() || null;
    if ('admin_gemini_api_key' in body) payload.admin_gemini_api_key = body.admin_gemini_api_key?.trim() || null;
    if ('admin_ai_model' in body) payload.admin_ai_model = body.admin_ai_model?.trim() || 'gpt-4o-mini';
    if ('support_email' in body) payload.support_email = body.support_email?.trim() || 'support@aibotflow.in';
    if ('support_phone' in body) payload.support_phone = body.support_phone?.trim() || null;

    if ('wallet_system_enabled' in body) payload.wallet_system_enabled = body.wallet_system_enabled !== false;
    if ('wallet_rate_marketing' in body) payload.wallet_rate_marketing = Number(body.wallet_rate_marketing);
    if ('wallet_rate_utility' in body) payload.wallet_rate_utility = Number(body.wallet_rate_utility);
    if ('wallet_rate_service' in body) payload.wallet_rate_service = Number(body.wallet_rate_service);
    if ('wallet_rate_auth' in body) payload.wallet_rate_auth = Number(body.wallet_rate_auth);

    // Use update if row exists, or upsert
    let { error } = await supabase
      .from('platform_settings')
      .update(payload)
      .eq('id', 'default');

    if (error && error.message?.includes('google_client_id')) {
      delete payload.google_client_id;
      delete payload.google_client_secret;
      const retry = await supabase
        .from('platform_settings')
        .update(payload)
        .eq('id', 'default');
      error = retry.error;
    }

    if (error) {
      // Fallback to upsert if default row was never created
      const upsertRetry = await supabase
        .from('platform_settings')
        .upsert(payload, { onConflict: 'id' });
      error = upsertRetry.error;
    }

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
