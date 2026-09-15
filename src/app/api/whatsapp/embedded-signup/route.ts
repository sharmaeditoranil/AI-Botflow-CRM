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

/**
 * GET: Returns public Meta App ID and Config ID for initializing the Embedded Signup popup.
 */
export async function GET() {
  const { appId, configId } = await getMetaAppCredentials();
  return NextResponse.json({
    appId: appId || null,
    configId: configId || null,
    isConfigured: !!(appId && configId),
  });
}

/**
 * POST: Exchanges code, fetches WABA/phone, subscribes apps, and saves into whatsapp_config.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's account_id and check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.account_id) {
    return NextResponse.json({ error: 'No account associated with user.' }, { status: 400 });
  }

  if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
    return NextResponse.json({ error: 'Only admins and owners can connect WhatsApp.' }, { status: 403 });
  }

  const body = await req.json();
  const { code, wabaId: inputWabaId, phoneNumberId: inputPhoneId } = body;

  if (!code) {
    return NextResponse.json({ error: 'Authorization code is required.' }, { status: 400 });
  }

  const { appId, appSecret } = await getMetaAppCredentials();

  if (!appId || !appSecret) {
    return NextResponse.json(
      {
        error:
          'Meta App is not configured yet. Please configure Meta App ID and Secret in Super-Admin settings.',
      },
      { status: 500 }
    );
  }

  // 1. Exchange code for access token
  const tokenRes = await exchangeCodeForAccessToken(code, appId, appSecret);
  if ('error' in tokenRes) {
    return NextResponse.json({ error: tokenRes.error }, { status: 400 });
  }

  const accessToken = tokenRes.accessToken;
  let wabaId = inputWabaId;
  let phoneNumberId = inputPhoneId;
  let displayPhoneNumber = '';

  if (!wabaId) {
    wabaId = (await getWabaFromToken(accessToken, appId, appSecret)) || undefined;
  }

  // 2. If phone number ID is missing, fetch phone numbers under the WABA
  if (wabaId && !phoneNumberId) {
    const numbers = await fetchWabaPhoneNumbers(wabaId, accessToken);
    if (numbers.length > 0) {
      phoneNumberId = numbers[0].id;
      displayPhoneNumber = numbers[0].display_phone_number;
    }
  }

  if (!phoneNumberId) {
    return NextResponse.json(
      {
        error:
          'Could not resolve a WhatsApp Phone Number ID for this account. Ensure you selected a phone number during Embedded Signup.',
      },
      { status: 400 }
    );
  }

  // 3. Subscribe WABA to tech provider app
  if (wabaId) {
    await subscribeWabaToApp(wabaId, accessToken);
  }

  // 4. Encrypt access token
  const encryptedToken = encrypt(accessToken);

  // 5. Save to whatsapp_config using admin client to ensure bypass of any RLS ambiguity
  const adminSupabase = getAdminSupabase();
  const now = new Date().toISOString();

  const { error: upsertError } = await adminSupabase
    .from('whatsapp_config')
    .upsert(
      {
        account_id: profile.account_id,
        user_id: user.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId || null,
        access_token: encryptedToken,
        status: 'connected',
        connected_at: now,
        registered_at: now,
        subscribed_apps_at: now,
        updated_at: now,
      },
      { onConflict: 'account_id' }
    );

  if (upsertError) {
    console.error('[Meta Embedded] Error upserting whatsapp_config:', upsertError);
    return NextResponse.json(
      { error: `Database error saving WhatsApp configuration: ${upsertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'WhatsApp Business Account connected successfully via Meta Embedded Signup!',
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
  });
}
