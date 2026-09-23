import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';
import { unsubscribePageFromApp } from '@/lib/social/meta-social';

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');

    let channel: 'all' | 'facebook' | 'instagram' = 'all';
    try {
      const body = await request.json();
      if (body?.channel && ['all', 'facebook', 'instagram'].includes(body.channel)) {
        channel = body.channel;
      }
    } catch {
      // Body may be empty, defaults to 'all'
    }

    // Fetch existing social config
    const { data: config } = await supabase
      .from('meta_social_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!config) {
      return NextResponse.json({ success: true, message: 'Already disconnected.' });
    }

    // If disconnecting all or facebook, attempt to unsubscribe webhook from Meta App
    if (channel === 'all' || channel === 'facebook') {
      if (config.facebook_page_id && config.facebook_page_access_token) {
        try {
          const plainToken = decrypt(config.facebook_page_access_token);
          if (plainToken) {
            await unsubscribePageFromApp(config.facebook_page_id, plainToken);
          }
        } catch (unsubErr) {
          console.warn('[meta-social] Best-effort unsubscribe error:', unsubErr);
        }
      }
    }

    let updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (channel === 'all') {
      updatePayload = {
        ...updatePayload,
        facebook_page_id: null,
        facebook_page_name: null,
        facebook_page_access_token: null,
        facebook_status: 'disconnected',
        instagram_account_id: null,
        instagram_username: null,
        instagram_status: 'disconnected',
        metadata: {},
      };
    } else if (channel === 'facebook') {
      // Disconnecting Facebook also disconnects Instagram (since IG relies on FB Page token)
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

    const { error: updateError } = await supabase
      .from('meta_social_config')
      .update(updatePayload)
      .eq('account_id', accountId);

    if (updateError) {
      console.error('[meta-social] Disconnect update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message:
        channel === 'instagram'
          ? 'Instagram disconnected successfully.'
          : channel === 'facebook'
            ? 'Facebook Page disconnected successfully.'
            : 'Social channels disconnected successfully.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
