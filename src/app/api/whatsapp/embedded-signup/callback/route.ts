import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  getMetaAppCredentials,
  exchangeCodeForAccessToken,
  subscribeWabaToApp,
  fetchWabaPhoneNumbers,
  getWabaFromToken,
} from '@/lib/whatsapp/meta-embedded';
import { encrypt } from '@/lib/whatsapp/encryption';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error') || searchParams.get('error_description');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dash.aibotflow.in';

  if (error) {
    console.error('[Meta Embedded Callback] Error from Meta:', error);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent('No authorization code provided by Meta.')}`
    );
  }

  const adminSupabase = getAdminSupabase();

  // Resolve user & account
  let targetAccountId: string | null = null;
  let targetUserId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      targetUserId = user.id;
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile?.account_id) {
        targetAccountId = profile.account_id;
      }
    }
  } catch (err) {
    console.warn('[Meta Embedded Callback] Cookie auth check error:', err);
  }

  // Fallback to state param if cookie session was not attached on cross-site redirect
  if (!targetAccountId && state) {
    const [sAccountId, sUserId] = state.split(':');
    if (sAccountId) {
      targetAccountId = sAccountId;
      targetUserId = sUserId || null;
    }
  }

  if (!targetAccountId) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent('Could not identify user session. Please log in again.')}`
    );
  }

  const { appId, appSecret } = await getMetaAppCredentials();

  if (!appId || !appSecret) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent('Meta App credentials are not configured in platform settings.')}`
    );
  }

  // 1. Exchange code for access token
  const tokenRes = await exchangeCodeForAccessToken(code, appId, appSecret);
  if ('error' in tokenRes) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent(tokenRes.error)}`
    );
  }

  const accessToken = tokenRes.accessToken;

  // 2. Resolve WABA ID
  const wabaId = await getWabaFromToken(accessToken, appId, appSecret);

  // 3. Resolve Phone Number ID
  let phoneNumberId: string | null = null;
  let displayPhoneNumber = '';

  if (wabaId) {
    const numbers = await fetchWabaPhoneNumbers(wabaId, accessToken);
    if (numbers.length > 0) {
      phoneNumberId = numbers[0].id;
      displayPhoneNumber = numbers[0].display_phone_number;
    }
    // Subscribe WABA
    await subscribeWabaToApp(wabaId, accessToken);
  }

  if (!phoneNumberId) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent('Could not find a WhatsApp Phone Number in your Meta account.')}`
    );
  }

  // 4. Save to whatsapp_config
  const encryptedToken = encrypt(accessToken);
  const now = new Date().toISOString();

  const { error: dbError } = await adminSupabase
    .from('whatsapp_config')
    .upsert(
      {
        account_id: targetAccountId,
        user_id: targetUserId,
        phone_number_id: phoneNumberId,
        waba_id: wabaId || null,
        access_token: encryptedToken,
        status: 'connected',
        connected_at: now,
        subscribed_apps_at: now,
        updated_at: now,
      },
      { onConflict: 'account_id' }
    );

  if (dbError) {
    console.error('[Meta Embedded Callback] DB save error:', dbError);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent('Failed to save WhatsApp configuration to database.')}`
    );
  }

  return NextResponse.redirect(
    `${baseUrl}/settings?tab=whatsapp&connected=true&phone=${encodeURIComponent(displayPhoneNumber)}`
  );
}
