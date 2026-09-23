import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  getFacebookUserProfile,
  getInstagramUserProfile,
} from '@/lib/social/meta-social';

export const maxDuration = 60;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/meta/social/repair-contacts
 *
 * Batch-repairs contacts that have generic names ("Facebook User", "Instagram User",
 * or IG:/FB: prefixed IDs) by fetching their real profile from the Meta Graph API
 * and updating the contacts table.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { accountId } = body as { accountId?: string };

    const supabase = supabaseAdmin();

    // Fetch the social config (per account if provided, else first available)
    let configQuery = supabase
      .from('meta_social_config')
      .select('account_id, facebook_page_access_token');

    if (accountId) {
      configQuery = configQuery.eq('account_id', accountId);
    }

    const { data: configs, error: configErr } = await configQuery.limit(10);

    if (configErr || !configs || configs.length === 0) {
      return NextResponse.json(
        { error: 'No meta_social_config found. Please connect Facebook/Instagram first.' },
        { status: 404 }
      );
    }

    let totalFixed = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    for (const config of configs) {
      const acctId: string = config.account_id;
      const rawToken: string | null = config.facebook_page_access_token;
      if (!rawToken) {
        errors.push(`Account ${acctId}: no access token stored`);
        continue;
      }

      let pageAccessToken: string;
      try {
        pageAccessToken = decrypt(rawToken);
      } catch {
        errors.push(`Account ${acctId}: token decryption failed`);
        continue;
      }

      if (!pageAccessToken) {
        errors.push(`Account ${acctId}: empty token after decryption`);
        continue;
      }

      // Find all contacts with generic/fallback names for this account
      const { data: genericContacts, error: contactsErr } = await supabase
        .from('contacts')
        .select('id, name, ig_user_id, fb_user_id')
        .eq('account_id', acctId)
        .or(
          [
            "name.eq.Facebook User",
            "name.eq.Instagram User",
            "name.like.Facebook User%",
            "name.like.Instagram User%",
            "name.like.FB: %",
            "name.like.IG: %",
            "name.is.null",
          ].join(',')
        );

      if (contactsErr) {
        errors.push(`Account ${acctId}: DB query error - ${contactsErr.message}`);
        continue;
      }

      if (!genericContacts || genericContacts.length === 0) {
        continue;
      }

      // Process each generic contact
      for (const contact of genericContacts) {
        const igUserId: string | null = contact.ig_user_id ?? null;
        const fbUserId: string | null = contact.fb_user_id ?? null;

        let profile: { name: string; username?: string; avatarUrl?: string } | null = null;

        try {
          if (igUserId) {
            profile = await getInstagramUserProfile(igUserId, pageAccessToken);
          } else if (fbUserId) {
            profile = await getFacebookUserProfile(fbUserId, pageAccessToken);
          }
        } catch (err) {
          console.warn(`[repair-contacts] Profile fetch failed for contact ${contact.id}:`, err);
        }

        if (profile && profile.name) {
          const { error: updateErr } = await supabase
            .from('contacts')
            .update({
              name: profile.name,
              ...(profile.avatarUrl ? { avatar_url: profile.avatarUrl } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', contact.id);

          if (updateErr) {
            totalFailed++;
            errors.push(`Contact ${contact.id}: update failed - ${updateErr.message}`);
          } else {
            totalFixed++;
          }
        } else {
          // Could not get real name — leave as is (already has a non-null fallback)
          totalFailed++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      fixed: totalFixed,
      failed: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
      message: `${totalFixed} contact(s) naam update ho gaye. ${totalFailed > 0 ? `${totalFailed} update nahi ho sake (Meta API permission ya token issue).` : ''}`,
    });
  } catch (err) {
    console.error('[repair-contacts] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
