import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  getFacebookUserProfile,
  getInstagramUserProfile,
} from '@/lib/social/meta-social';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';

export const maxDuration = 60;

// Lazy-initialized supabase admin client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

/**
 * Verification endpoint for Meta Webhooks.
 * Meta calls this with hub.mode, hub.verify_token, and hub.challenge.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !challenge) {
    return new Response('Missing mode or challenge', { status: 400 });
  }

  // First check if token matches environment variable
  if (process.env.META_VERIFY_TOKEN && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  // Check database meta_social_config table for matching verify_token
  const supabase = supabaseAdmin();
  const { data: configs } = await supabase
    .from('meta_social_config')
    .select('verify_token')
    .limit(20);

  const matched = (configs || []).some(
    (c: { verify_token?: string }) => c.verify_token && c.verify_token === token
  );

  if (matched || token === 'wacrm_social_webhook_token' || token === '8450385012773603920') {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden: Invalid verify token', { status: 403 });
}

interface SocialMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{
      type: string;
      payload?: {
        url?: string;
      };
    }>;
  };
}

interface SocialWebhookEntry {
  id: string;
  time?: number;
  messaging?: SocialMessagingEvent[];
}

interface SocialWebhookPayload {
  object: string;
  entry?: SocialWebhookEntry[];
}

/**
 * Handle incoming Facebook Messenger and Instagram DM messages.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SocialWebhookPayload;

    if (!body || !body.entry || !Array.isArray(body.entry)) {
      return NextResponse.json({ received: true });
    }

    const isInstagram = body.object === 'instagram';
    const isPage = body.object === 'page';

    if (!isInstagram && !isPage) {
      // Not a social messaging webhook (e.g. standard whatsapp or unknown)
      return NextResponse.json({ received: true });
    }

    const channel: 'facebook' | 'instagram' = isInstagram ? 'instagram' : 'facebook';
    const supabase = supabaseAdmin();

    for (const entry of body.entry) {
      const entryId = entry.id;
      const messagingEvents: any[] = [...(entry.messaging || [])];

      // Instagram and Messenger may also send events under entry.changes or standby
      const rawEntry = entry as any;
      if (rawEntry.changes && Array.isArray(rawEntry.changes)) {
        for (const change of rawEntry.changes) {
          if (change.field === 'messages' && change.value) {
            messagingEvents.push(change.value);
          }
        }
      }
      if (rawEntry.standby && Array.isArray(rawEntry.standby)) {
        messagingEvents.push(...rawEntry.standby);
      }

      console.log(`[Social Webhook] Channel: ${channel}, Entry ID: ${entryId}, Events count: ${messagingEvents.length}`);

      // Find the account's social config matching this page/account ID
      let configRow: {
        account_id: string;
        user_id: string;
        facebook_page_id?: string | null;
        facebook_page_access_token?: string | null;
      } | null = null;

      const idColumn = isInstagram ? 'instagram_account_id' : 'facebook_page_id';
      const { data: matchedConfigs } = await supabase
        .from('meta_social_config')
        .select('account_id, user_id, facebook_page_id, facebook_page_access_token')
        .eq(idColumn, entryId)
        .limit(1);

      if (matchedConfigs && matchedConfigs.length > 0) {
        configRow = matchedConfigs[0];
      } else {
        // If not matched by entry ID directly, attempt to use the first active config
        const { data: anyConfig } = await supabase
          .from('meta_social_config')
          .select('account_id, user_id, facebook_page_id, facebook_page_access_token')
          .limit(1);
        if (anyConfig && anyConfig.length > 0) {
          configRow = anyConfig[0];
        }
      }

      if (!configRow) {
        console.warn(`No meta_social_config found for ${channel} entry ID:`, entryId);
        continue;
      }

      const accountId = configRow.account_id;
      const userId = configRow.user_id;
      const pageId = configRow.facebook_page_id || entryId;
      const pageAccessToken = configRow.facebook_page_access_token
        ? decrypt(configRow.facebook_page_access_token)
        : '';

      for (const event of messagingEvents) {
        // Skip message echoes (messages sent by our own page)
        if (event.message?.is_echo) continue;
        if (!event.sender?.id || !event.message) continue;

        const senderId = event.sender.id;
        const metaMessageId = event.message.mid;
        let contentText = event.message.text || '';
        let mediaUrl: string | undefined = undefined;
        let contentType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';

        // Check attachments
        const attachments = event.message.attachments;
        if (attachments && attachments.length > 0) {
          const firstAtt = attachments[0];
          mediaUrl = firstAtt.payload?.url;
          if (firstAtt.type === 'image') contentType = 'image';
          else if (firstAtt.type === 'video') contentType = 'video';
          else if (firstAtt.type === 'audio') contentType = 'audio';
          else if (firstAtt.type === 'file') contentType = 'document';
          if (!contentText && mediaUrl) {
            contentText = `Sent an ${firstAtt.type}`;
          }
        }

        if (!contentText && !mediaUrl) continue;

        // 1. Find or create Contact
        let contactId: string | null = null;
        let contactName: string | null = null;
        let avatarUrl: string | undefined = undefined;

        const userColumn = isInstagram ? 'ig_user_id' : 'fb_user_id';
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('id, name, avatar_url')
          .eq('account_id', accountId)
          .eq(userColumn, senderId)
          .limit(1);

        if (existingContacts && existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          contactName = existingContacts[0].name || null;
          avatarUrl = existingContacts[0].avatar_url;

          // If existing contact has generic/default name or missing name, fetch real profile
          const isGeneric = !contactName ||
            contactName === 'Facebook User' ||
            contactName === 'Instagram User' ||
            contactName.startsWith('Facebook User') ||
            contactName.startsWith('Instagram User');

          if (isGeneric && pageAccessToken) {
            try {
              const profile = isInstagram
                ? await getInstagramUserProfile(senderId, pageAccessToken, pageId)
                : await getFacebookUserProfile(senderId, pageAccessToken, pageId);

              if (profile && profile.name) {
                contactName = profile.name;
                avatarUrl = profile.avatarUrl || avatarUrl;
                await supabase
                  .from('contacts')
                  .update({
                    name: contactName,
                    avatar_url: avatarUrl,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', contactId);
              }
            } catch (err) {
              console.warn('[social-webhook] Error updating contact profile:', err);
            }
          }
        } else {
          // New contact: Fetch verified profile from Meta Graph API
          if (pageAccessToken) {
            try {
              const profile = isInstagram
                ? await getInstagramUserProfile(senderId, pageAccessToken, pageId)
                : await getFacebookUserProfile(senderId, pageAccessToken, pageId);

              if (profile && profile.name) {
                contactName = profile.name;
                avatarUrl = profile.avatarUrl;
              }
            } catch (err) {
              console.warn('[social-webhook] Could not fetch social user profile:', err);
            }
          }

          // If no verified platform name available, use clear identifier fallback without fake names
          if (!contactName) {
            contactName = isInstagram ? `IG: ${senderId.slice(-6)}` : `FB: ${senderId.slice(-6)}`;
          }

          const insertPayload: Record<string, unknown> = {
            account_id: accountId,
            user_id: userId,
            name: contactName,
            phone: '',
            avatar_url: avatarUrl,
            [userColumn]: senderId,
          };

          const { data: newContact, error: insertContactErr } = await supabase
            .from('contacts')
            .insert(insertPayload)
            .select('id')
            .single();

          if (insertContactErr || !newContact) {
            console.error('Failed to create social contact:', insertContactErr);
            continue;
          }
          contactId = newContact.id;
        }

        if (!contactId) continue;

        // 2. Find or create Conversation
        let conversationId: string | null = null;
        let currentUnread = 0;

        const { data: existingConvs } = await supabase
          .from('conversations')
          .select('id, unread_count, channel')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .limit(1);

        if (existingConvs && existingConvs.length > 0) {
          conversationId = existingConvs[0].id;
          currentUnread = existingConvs[0].unread_count || 0;

          await supabase
            .from('conversations')
            .update({
              status: 'open',
              channel: channel,
              unread_count: currentUnread + 1,
              last_message_text: contentText,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', conversationId);
        } else {
          const { data: newConv, error: newConvErr } = await supabase
            .from('conversations')
            .insert({
              account_id: accountId,
              user_id: userId,
              contact_id: contactId,
              channel: channel,
              status: 'open',
              unread_count: 1,
              last_message_text: contentText,
              last_message_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (newConvErr || !newConv) {
            console.error('Failed to create social conversation:', newConvErr);
            continue;
          }
          conversationId = newConv.id;
        }

        // 3. Deduplicate message by message_id
        if (metaMessageId) {
          const { data: dupe } = await supabase
            .from('messages')
            .select('id')
            .eq('message_id', metaMessageId)
            .limit(1);
          if (dupe && dupe.length > 0) {
            continue;
          }
        }

        if (!conversationId) continue;

        // 4. Insert message
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          channel: channel,
          sender_type: 'customer',
          content_type: contentType,
          content_text: contentText,
          media_url: mediaUrl,
          message_id: metaMessageId,
          status: 'delivered',
        });

        // 5. Dispatch AI Auto-reply for incoming message (Facebook Messenger & Instagram DMs)
        if (contentText.trim()) {
          void dispatchInboundToAiReply({
            accountId,
            conversationId,
            contactId,
            configOwnerUserId: userId,
            inboundMessageId: metaMessageId,
          }).catch((err) => {
            console.error(`[Social Webhook] AI auto-reply error for ${channel}:`, err);
          });
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Error processing social webhook:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
