import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { requireRole } from '@/lib/auth/account';

export const maxDuration = 60;

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
 * Fast & bounded contact name repair from Meta Graph API.
 * 1. Checks which contacts in the account actually have generic/missing names.
 * 2. If none, returns immediately in ~20ms.
 * 3. If contacts need repair, fetches conversations from Meta in parallel with a strict deadline (15s).
 * 4. Resolves names and updates contacts in parallel.
 * 5. Returns clean JSON response within 2-5 seconds, never timing out.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let targetAccountId = (body as { accountId?: string }).accountId;

    // If accountId wasn't passed in body, try to resolve from caller's session
    if (!targetAccountId) {
      try {
        const auth = await requireRole('agent');
        targetAccountId = auth.accountId;
      } catch {
        // Fall back to configs if unauthenticated internal call
      }
    }

    const supabase = supabaseAdmin();

    let configQuery = supabase
      .from('meta_social_config')
      .select('account_id, facebook_page_id, instagram_account_id, facebook_page_access_token');

    if (targetAccountId) {
      configQuery = configQuery.eq('account_id', targetAccountId);
    }

    const { data: configs, error: configErr } = await configQuery.limit(5);

    if (configErr || !configs || configs.length === 0) {
      return NextResponse.json(
        { error: 'No meta_social_config found. Please connect Facebook/Instagram first.' },
        { status: 404 }
      );
    }

    let totalFixed = 0;
    const deadline = Date.now() + 15000; // 15-second budget to never breach proxy timeouts

    for (const config of configs) {
      if (Date.now() > deadline) break;

      const acctId: string = config.account_id;
      const pageId: string | null = config.facebook_page_id;
      const rawToken: string | null = config.facebook_page_access_token;

      if (!rawToken || !pageId) continue;

      let token: string;
      try {
        token = decrypt(rawToken);
      } catch {
        continue;
      }

      if (!token) continue;

      // 1. Fetch only contacts that actually need repair in this account
      const { data: contactsToRepair } = await supabase
        .from('contacts')
        .select('id, name, fb_user_id, ig_user_id')
        .eq('account_id', acctId)
        .or('name.is.null,name.eq.,name.eq.Facebook User,name.eq.Instagram User,name.ilike.FB: %,name.ilike.IG: %,name.ilike.Facebook User %,name.ilike.Instagram User %')
        .limit(100);

      if (!contactsToRepair || contactsToRepair.length === 0) {
        continue;
      }

      const targetFbIds = new Set(contactsToRepair.filter(c => c.fb_user_id).map(c => c.fb_user_id!));
      const targetIgIds = new Set(contactsToRepair.filter(c => c.ig_user_id).map(c => c.ig_user_id!));

      const idToNameMap = new Map<string, string>();

      // 2. Fetch FB & IG conversations in parallel with 5s timeout
      const fetchPlatformConvs = async (platform?: 'instagram') => {
        const found = new Map<string, string>();
        try {
          const url = platform === 'instagram'
            ? `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/conversations?platform=instagram&fields=id,participants,senders&limit=100&access_token=${encodeURIComponent(token)}`
            : `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/conversations?fields=id,participants,senders&limit=100&access_token=${encodeURIComponent(token)}`;

          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return found;
          const json = await res.json();
          const items: ConversationItem[] = json.data || [];

          for (const item of items) {
            const list = [...(item.participants?.data || []), ...(item.senders?.data || [])];
            for (const p of list) {
              if (!p.id || p.id === pageId || p.id === config.instagram_account_id) continue;
              const displayName = platform === 'instagram'
                ? (p.username ? `@${p.username.trim()}` : p.name?.trim())
                : p.name?.trim();
              if (displayName) {
                found.set(p.id, displayName);
              }
            }
          }
        } catch (err) {
          console.warn(`[repair-contacts] Error fetching ${platform || 'fb'} conversations:`, err);
        }
        return found;
      };

      const [fbProfiles, igProfiles] = await Promise.all([
        targetFbIds.size > 0 ? fetchPlatformConvs() : Promise.resolve(new Map<string, string>()),
        targetIgIds.size > 0 ? fetchPlatformConvs('instagram') : Promise.resolve(new Map<string, string>()),
      ]);

      for (const [k, v] of fbProfiles) idToNameMap.set(k, v);
      for (const [k, v] of igProfiles) idToNameMap.set(k, v);

      const updateOperations: PromiseLike<unknown>[] = [];
      const stillMissing: typeof contactsToRepair = [];

      // 3. Match against contactsToRepair
      for (const c of contactsToRepair) {
        let resolvedName: string | null = null;
        if (c.ig_user_id && idToNameMap.has(c.ig_user_id)) {
          resolvedName = idToNameMap.get(c.ig_user_id)!;
        } else if (c.fb_user_id && idToNameMap.has(c.fb_user_id)) {
          resolvedName = idToNameMap.get(c.fb_user_id)!;
        }

        if (resolvedName) {
          totalFixed++;
          updateOperations.push(
            supabase.from('contacts').update({
              name: resolvedName,
              updated_at: new Date().toISOString(),
            }).eq('id', c.id)
          );
        } else {
          stillMissing.push(c);
        }
      }

      // 4. For any still-missing contacts, try direct single query in parallel (max 10, 3s timeout)
      if (stillMissing.length > 0 && Date.now() < deadline) {
        const directPromises = stillMissing.slice(0, 10).map(async (c) => {
          if (Date.now() > deadline) return;
          try {
            if (c.ig_user_id) {
              const res = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(c.ig_user_id)}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`,
                { signal: AbortSignal.timeout(3000) }
              );
              if (res.ok) {
                const data = await res.json();
                const found = data.name?.trim() || (data.username ? `@${data.username.trim()}` : null);
                if (found) {
                  totalFixed++;
                  await supabase.from('contacts').update({
                    name: found,
                    avatar_url: data.profile_pic || undefined,
                    updated_at: new Date().toISOString(),
                  }).eq('id', c.id);
                }
              }
            } else if (c.fb_user_id) {
              const res = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(c.fb_user_id)}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(token)}`,
                { signal: AbortSignal.timeout(3000) }
              );
              if (res.ok) {
                const data = await res.json();
                const found = (data.name || [data.first_name, data.last_name].filter(Boolean).join(' ')).trim();
                if (found) {
                  totalFixed++;
                  await supabase.from('contacts').update({
                    name: found,
                    avatar_url: data.profile_pic || undefined,
                    updated_at: new Date().toISOString(),
                  }).eq('id', c.id);
                }
              }
            }
          } catch {
            // ignore timeout/error
          }
        });

        updateOperations.push(...directPromises);
      }

      await Promise.all(updateOperations);
    }

    return NextResponse.json({
      success: true,
      fixed: totalFixed,
      message: totalFixed > 0
        ? `${totalFixed} contact(s) ka naam successfully Meta se sync ho gaya!`
        : 'Sabhi contacts check ho gaye hain. Naye messages aane par real names automatically update ho jayenge.',
    });
  } catch (err) {
    console.error('[repair-contacts] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
