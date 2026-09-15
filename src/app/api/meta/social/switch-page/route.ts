import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { subscribePageToApp } from '@/lib/social/meta-social';
import { decrypt } from '@/lib/whatsapp/encryption';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const pageId = body.pageId;
    if (!pageId) {
      return NextResponse.json({ error: 'Page ID is required' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No active account found' }, { status: 400 });
    }

    const adminSupabase = getAdminSupabase();
    const { data: config } = await adminSupabase
      .from('meta_social_config')
      .select('*')
      .eq('account_id', profile.account_id)
      .maybeSingle();

    const availablePages = (config?.metadata as { available_pages?: Array<{
      id: string;
      name: string;
      instagram_id?: string | null;
      instagram_username?: string | null;
      has_instagram?: boolean;
      access_token_encrypted?: string;
    }> })?.available_pages || [];

    const targetPage = availablePages.find((p) => p.id === pageId);
    if (!targetPage) {
      return NextResponse.json({ error: 'Selected page not found in your connected pages.' }, { status: 404 });
    }

    if (targetPage.access_token_encrypted) {
      const rawToken = decrypt(targetPage.access_token_encrypted);
      if (rawToken) {
        await subscribePageToApp(targetPage.id, rawToken);
      }
    }

    await adminSupabase
      .from('meta_social_config')
      .update({
        facebook_page_id: targetPage.id,
        facebook_page_name: targetPage.name,
        facebook_page_access_token: targetPage.access_token_encrypted,
        facebook_status: 'connected',
        instagram_account_id: targetPage.instagram_id || null,
        instagram_username: targetPage.instagram_username || null,
        instagram_status: targetPage.has_instagram ? 'connected' : 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', profile.account_id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[Meta Social Switch Page Error]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
