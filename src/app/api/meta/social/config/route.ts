import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';
import { getSocialAppCredentials } from '@/lib/social/meta-social';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { appId, appSecret } = await getSocialAppCredentials();
    const metaAppConfigured = Boolean(appId && appSecret && /^\d+$/.test(appId));

    const { data, error } = await supabase
      .from('meta_social_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching meta_social_config:', error);
      return NextResponse.json({ error: error.message, metaAppConfigured }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ config: null, metaAppConfigured });
    }

    // Mask access token before returning to client
    const safeConfig = {
      ...data,
      facebook_page_access_token: data.facebook_page_access_token ? '••••••••' : null,
      has_access_token: Boolean(data.facebook_page_access_token),
    };

    return NextResponse.json({ config: safeConfig, metaAppConfigured });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');

    const body = await request.json();
    const {
      facebook_page_id,
      facebook_page_name,
      facebook_page_access_token,
      facebook_status,
      instagram_account_id,
      instagram_username,
      instagram_status,
      verify_token,
    } = body;

    // Check existing config to preserve token if masked
    const { data: existing } = await supabase
      .from('meta_social_config')
      .select('id, facebook_page_access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    let encryptedToken = existing?.facebook_page_access_token ?? null;
    if (facebook_page_access_token && !facebook_page_access_token.includes('••••')) {
      encryptedToken = encrypt(facebook_page_access_token.trim());
    }

    const payload = {
      account_id: accountId,
      user_id: userId,
      facebook_page_id: facebook_page_id ? facebook_page_id.trim() : null,
      facebook_page_name: facebook_page_name ? facebook_page_name.trim() : null,
      facebook_page_access_token: encryptedToken,
      facebook_status: facebook_status || (facebook_page_id && encryptedToken ? 'connected' : 'disconnected'),
      instagram_account_id: instagram_account_id ? instagram_account_id.trim() : null,
      instagram_username: instagram_username ? instagram_username.trim().replace(/^@/, '') : null,
      instagram_status: instagram_status || (instagram_account_id ? 'connected' : 'disconnected'),
      verify_token: verify_token ? verify_token.trim() : 'wacrm_social_webhook_token',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('meta_social_config')
      .upsert(payload, { onConflict: 'account_id' })
      .select()
      .single();

    if (error) {
      console.error('Error saving meta_social_config:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: {
        ...data,
        facebook_page_access_token: data.facebook_page_access_token ? '••••••••' : null,
        has_access_token: Boolean(data.facebook_page_access_token),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'all';

    let updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (channel === 'all' || channel === 'facebook') {
      updatePayload = {
        ...updatePayload,
        facebook_page_id: null,
        facebook_page_name: null,
        facebook_page_access_token: null,
        facebook_status: 'disconnected',
        instagram_account_id: null,
        instagram_username: null,
        instagram_status: 'disconnected',
      };
    } else if (channel === 'instagram') {
      updatePayload = {
        ...updatePayload,
        instagram_account_id: null,
        instagram_username: null,
        instagram_status: 'disconnected',
      };
    }

    const { error } = await supabase
      .from('meta_social_config')
      .update(updatePayload)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Disconnected.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

