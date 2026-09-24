import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSocialAppCredentials } from '@/lib/social/meta-social';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active account found' }, { status: 400 });
    }

    const { appId, appSecret } = await getSocialAppCredentials();
    if (!appId || !appSecret) {
      return NextResponse.json({
        configured: false,
        error: 'Meta App credentials are not configured in platform settings.',
      });
    }

    if (!/^\d+$/.test(appId)) {
      return NextResponse.json({
        configured: false,
        error: 'Invalid Meta App ID in Super-Admin settings. Meta App ID must be a numeric ID (15-16 digits from developers.facebook.com ➔ App settings ➔ Basic), not your personal Facebook login email.',
      });
    }

    const requestedRedirectUri = req.nextUrl.searchParams.get('redirectUri');
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    const computedOrigin =
      forwardedHost && !forwardedHost.includes('0.0.0.0') && !forwardedHost.includes('127.0.0.1')
        ? `${forwardedProto}://${forwardedHost}`
        : (process.env.NEXT_PUBLIC_SITE_URL || 'https://dash.aibotflow.in');

    const redirectUri = requestedRedirectUri || `${computedOrigin}/api/meta/social/oauth/callback`;
    const encodedRedirectUri = Buffer.from(redirectUri).toString('base64url');
    // Prepend accountId and userId, and append encoded redirectUri to state
    const state = `${profile.account_id}:${user.id}:${encodedRedirectUri}`;

    const scope = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages',
      'public_profile',
      'business_management',
    ].join(',');

    const oauthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    oauthUrl.searchParams.set('client_id', appId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('state', state);
    oauthUrl.searchParams.set('scope', scope);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('auth_type', 'rerequest');
    oauthUrl.searchParams.set('return_scopes', 'true');

    return NextResponse.json({
      configured: true,
      appId,
      redirectUri,
      oauthUrl: oauthUrl.toString(),
    });
  } catch (err) {
    console.error('[Meta Social OAuth URL Error]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
