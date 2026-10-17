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
import { pickNumberToConnect, saveConnectedNumber } from '@/lib/whatsapp/save-connected-number';

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

  // Resolve user & account, and coexistence mode from state
  let targetAccountId: string | null = null;
  let targetUserId: string | null = null;
  let isCoexistence = false;

  if (state) {
    const parts = state.split(':');
    if (parts[0]) targetAccountId = parts[0];
    if (parts[1]) targetUserId = parts[1] || null;
    if (parts[2] === 'coex') isCoexistence = true;
  }

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

  if (!targetAccountId || !targetUserId) {
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

  // 1. Exchange code for access token (must pass the same redirect_uri used in the OAuth dialog)
  const redirectUri = `${baseUrl}/api/whatsapp/embedded-signup/callback`;
  const tokenRes = await exchangeCodeForAccessToken(code, appId, appSecret, redirectUri);
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
      // If the account already has a connected phone number and a new number was added to the WABA,
      // pick the newly added number (which Meta appends at the end) so adding a new number works seamlessly.
      const { data: connected } = await adminSupabase
        .from('whatsapp_config')
        .select('phone_number_id')
        .eq('account_id', targetAccountId);
      const selected = pickNumberToConnect(
        numbers,
        (connected ?? []).map((r: { phone_number_id: string }) => r.phone_number_id),
      )!;

      phoneNumberId = selected.id;
      displayPhoneNumber = selected.display_phone_number;
    }
    // Subscribe WABA
    await subscribeWabaToApp(wabaId, accessToken);
  }

  if (!phoneNumberId) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent('Could not find a WhatsApp Phone Number in your Meta account.')}`
    );
  }

  // 4. Save to whatsapp_config (adds a number or reconnects one — 057)
  const encryptedToken = encrypt(accessToken);
  const saved = await saveConnectedNumber(adminSupabase, {
    accountId: targetAccountId,
    userId: targetUserId,
    phoneNumberId,
    wabaId: wabaId || null,
    encryptedAccessToken: encryptedToken,
    coexistence: isCoexistence,
    displayPhoneNumber: displayPhoneNumber || null,
  });

  if (!saved.ok) {
    console.error('[Meta Embedded Callback] DB save error:', saved.message);
    const message =
      saved.code === 'db_error' ? 'Failed to save WhatsApp configuration to database.' : saved.message;
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=whatsapp&error=${encodeURIComponent(message)}`
    );
  }

  return NextResponse.redirect(
    `${baseUrl}/settings?tab=whatsapp&connected=true&coex=${isCoexistence ? 'true' : 'false'}&phone=${encodeURIComponent(displayPhoneNumber)}`
  );
}
