import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  getSocialAppCredentials,
  exchangeCodeForUserToken,
  getLongLivedUserToken,
  fetchUserFacebookPages,
  subscribePageToApp,
} from '@/lib/social/meta-social';
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

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    req.nextUrl.origin ||
    'https://dash.aibotflow.in';

  if (error) {
    console.error('[Meta Social OAuth Callback] Error from Meta:', error);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent('No authorization code provided by Meta.')}`
    );
  }

  const adminSupabase = getAdminSupabase();

  // Resolve user & account from state
  let targetAccountId: string | null = null;
  let targetUserId: string | null = null;

  if (state) {
    const parts = state.split(':');
    if (parts[0]) targetAccountId = parts[0];
    if (parts[1]) targetUserId = parts[1] || null;
  }

  if (!targetAccountId) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent('Could not identify user session. Please try again.')}`
    );
  }

  const { appId, appSecret } = await getSocialAppCredentials();
  if (!appId || !appSecret) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent('Meta App credentials are not configured in platform settings.')}`
    );
  }

  // 1. Exchange code for user access token (must match the exact redirect_uri used in OAuth)
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const origin =
    forwardedHost && !forwardedHost.includes('0.0.0.0') && !forwardedHost.includes('127.0.0.1')
      ? `${forwardedProto}://${forwardedHost}`
      : (process.env.NEXT_PUBLIC_SITE_URL || baseUrl);

  const redirectUri = `${origin}/api/meta/social/oauth/callback`;
  const tokenRes = await exchangeCodeForUserToken(code, appId, appSecret, redirectUri);
  if ('error' in tokenRes) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent(tokenRes.error)}`
    );
  }

  // 2. Exchange for long-lived user access token
  const longLivedRes = await getLongLivedUserToken(tokenRes.userAccessToken, appId, appSecret);
  const userToken = 'longLivedToken' in longLivedRes ? longLivedRes.longLivedToken : tokenRes.userAccessToken;

  // 3. Fetch user's Facebook Pages and connected Instagram accounts
  const pagesRes = await fetchUserFacebookPages(userToken);
  if ('error' in pagesRes) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent(pagesRes.error)}`
    );
  }

  const pages = pagesRes.pages;
  if (!pages || pages.length === 0) {
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent('No Facebook Pages found. Make sure your account manages at least one Facebook Page.')}`
    );
  }

  // Primary page to connect (default first page)
  const primaryPage = pages[0];
  const igAccount = primaryPage.instagram_business_account;

  // 4. Automatically subscribe the page to the app's webhooks
  await subscribePageToApp(primaryPage.id, primaryPage.access_token);

  // 5. Encrypt Page Access Token
  const encryptedPageToken = encrypt(primaryPage.access_token);

  // 6. Save in meta_social_config
  const availablePagesMeta = pages.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    has_instagram: !!p.instagram_business_account,
    instagram_id: p.instagram_business_account?.id || null,
    instagram_username: p.instagram_business_account?.username || null,
    access_token_encrypted: encrypt(p.access_token),
  }));

  const { error: upsertError } = await adminSupabase.from('meta_social_config').upsert(
    {
      account_id: targetAccountId,
      user_id: targetUserId || targetAccountId,
      facebook_page_id: primaryPage.id,
      facebook_page_name: primaryPage.name,
      facebook_page_access_token: encryptedPageToken,
      facebook_status: 'connected',
      instagram_account_id: igAccount?.id || null,
      instagram_username: igAccount?.username || null,
      instagram_status: igAccount ? 'connected' : 'disconnected',
      metadata: {
        available_pages: availablePagesMeta,
        connected_at: new Date().toISOString(),
        auth_mode: 'embedded_oauth',
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'account_id' }
  );

  if (upsertError) {
    console.error('[Meta Social OAuth Callback] Database save error:', upsertError);
    return NextResponse.redirect(
      `${baseUrl}/settings?tab=social&error=${encodeURIComponent('Failed to save social configuration.')}`
    );
  }

  const successParams = new URLSearchParams({
    tab: 'social',
    connected: 'true',
    pageName: primaryPage.name,
    hasIg: igAccount ? 'true' : 'false',
    igUser: igAccount?.username || '',
  });

  return NextResponse.redirect(`${baseUrl}/settings?${successParams.toString()}`);
}
