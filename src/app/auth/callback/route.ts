import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'recovery' | 'signup' | 'email' | 'magiclink' | null;
  const next = searchParams.get('next') || '/inbox';

  // Robustly determine public origin (avoid internal 0.0.0.0 or 127.0.0.1 Docker host)
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  let siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://dash.aibotflow.in';
  if (
    forwardedHost &&
    !forwardedHost.includes('0.0.0.0') &&
    !forwardedHost.includes('127.0.0.1') &&
    !forwardedHost.includes('localhost')
  ) {
    siteOrigin = `${forwardedProto}://${forwardedHost}`;
  }

  const cleanNext = next.startsWith('/') ? next : `/${next}`;
  const targetRedirectUrl = `${siteOrigin}${cleanNext}`;

  const supabase = await createClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      // Sync Google user profile full_name & avatar if available
      try {
        const fullName =
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          '';
        const avatarUrl =
          data.user.user_metadata?.avatar_url ||
          data.user.user_metadata?.picture ||
          null;

        if (fullName || avatarUrl) {
          const updates: Record<string, any> = {};
          if (fullName) updates.full_name = fullName;
          if (avatarUrl) updates.avatar_url = avatarUrl;
          await supabase
            .from('profiles')
            .update(updates)
            .eq('user_id', data.user.id);
        }
      } catch (metaErr) {
        console.warn('[auth/callback] Non-fatal profile metadata sync:', metaErr);
      }

      return NextResponse.redirect(targetRedirectUrl);
    }
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      return NextResponse.redirect(targetRedirectUrl);
    }
  }

  return NextResponse.redirect(
    `${siteOrigin}/login?error=${encodeURIComponent('The authentication link has expired or is invalid. Please try again.')}`
  );
}
