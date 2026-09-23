import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';

export const maxDuration = 120;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface Participant {
  id: string;
  name?: string;
  username?: string;
  email?: string;
}

interface ConversationItem {
  id: string;
  participants?: { data: Participant[] };
  senders?: { data: Participant[] };
}

/**
 * POST /api/meta/social/repair-contacts
 *
 * Uses Meta Page Conversations API (both Messenger & Instagram) to fetch all
 * conversation participants with their verified Facebook names and Instagram usernames,
 * and updates any generic/empty contact names in the database.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { accountId } = body as { accountId?: string };

    const supabase = supabaseAdmin();

    let configQuery = supabase
      .from('meta_social_config')
      .select('account_id, facebook_page_id, instagram_account_id, facebook_page_access_token');

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
    const errors: string[] = [];

    for (const config of configs) {
      const acctId: string = config.account_id;
      const pageId: string | null = config.facebook_page_id;
      const rawToken: string | null = config.facebook_page_access_token;

      if (!rawToken || !pageId) {
        errors.push(`Account ${acctId}: missing token or page ID`);
        continue;
      }

      let token: string;
      try {
        token = decrypt(rawToken);
      } catch {
        errors.push(`Account ${acctId}: token decryption failed`);
        continue;
      }

      if (!token) continue;

      // Map to hold sender_id -> displayName
      const idToNameMap = new Map<string, string>();

      // 1. Fetch Facebook Messenger conversations
      try {
        let fbUrl: string | null = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,participants,senders&limit=100&access_token=${encodeURIComponent(token)}`;
        let pagesCount = 0;

        while (fbUrl && pagesCount < 5) {
          pagesCount++;
          const currentFbUrl: string = fbUrl;
          const fbRes: Response = await fetch(currentFbUrl);
          if (!fbRes.ok) break;
          const fbJson: any = await fbRes.json();
          const items: ConversationItem[] = fbJson.data || [];

          for (const item of items) {
            const list = [...(item.participants?.data || []), ...(item.senders?.data || [])];
            for (const p of list) {
              if (p.id && p.id !== pageId && p.name) {
                idToNameMap.set(p.id, p.name.trim());
              }
            }
          }

          fbUrl = fbJson.paging?.next || null;
        }
      } catch (err) {
        console.warn(`[repair-contacts] Error fetching FB conversations for account ${acctId}:`, err);
      }

      // 2. Fetch Instagram conversations via Page (platform=instagram)
      try {
        let igUrl: string | null = `https://graph.facebook.com/v21.0/${pageId}/conversations?platform=instagram&fields=id,participants,senders&limit=100&access_token=${encodeURIComponent(token)}`;
        let igPagesCount = 0;

        while (igUrl && igPagesCount < 5) {
          igPagesCount++;
          const currentIgUrl: string = igUrl;
          const igRes: Response = await fetch(currentIgUrl);
          if (!igRes.ok) break;
          const igJson: any = await igRes.json();
          const items: ConversationItem[] = igJson.data || [];

          for (const item of items) {
            const list = [...(item.participants?.data || []), ...(item.senders?.data || [])];
            for (const p of list) {
              if (p.id && p.id !== pageId && p.id !== config.instagram_account_id) {
                const displayName = p.username ? `@${p.username.trim()}` : p.name?.trim();
                if (displayName) {
                  idToNameMap.set(p.id, displayName);
                }
              }
            }
          }

          igUrl = igJson.paging?.next || null;
        }
      } catch (err) {
        console.warn(`[repair-contacts] Error fetching IG conversations for account ${acctId}:`, err);
      }

      console.log(`[repair-contacts] Discovered ${idToNameMap.size} user profiles from Meta conversations`);

      // 3. Update database contacts matching these IDs
      for (const [userId, realName] of idToNameMap.entries()) {
        // Check FB user match
        const { data: fbMatch } = await supabase
          .from('contacts')
          .select('id, name')
          .eq('account_id', acctId)
          .eq('fb_user_id', userId)
          .limit(1);

        if (fbMatch && fbMatch.length > 0) {
          const c = fbMatch[0];
          if (!c.name || c.name === 'Facebook User' || c.name.startsWith('Facebook User') || c.name.startsWith('FB: ')) {
            await supabase.from('contacts').update({ name: realName, updated_at: new Date().toISOString() }).eq('id', c.id);
            totalFixed++;
            continue;
          }
        }

        // Check IG user match
        const { data: igMatch } = await supabase
          .from('contacts')
          .select('id, name')
          .eq('account_id', acctId)
          .eq('ig_user_id', userId)
          .limit(1);

        if (igMatch && igMatch.length > 0) {
          const c = igMatch[0];
          if (!c.name || c.name === 'Instagram User' || c.name.startsWith('Instagram User') || c.name.startsWith('IG: ')) {
            await supabase.from('contacts').update({ name: realName, updated_at: new Date().toISOString() }).eq('id', c.id);
            totalFixed++;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      fixed: totalFixed,
      message: `${totalFixed} contact(s) ka naam successfully Meta se sync ho gaya!`,
    });
  } catch (err) {
    console.error('[repair-contacts] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
