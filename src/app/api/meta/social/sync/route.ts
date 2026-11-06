import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { subscribePageToApp } from '@/lib/social/meta-social';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com/v21.0';

interface GraphParticipant {
  id: string;
  name?: string;
  username?: string;
  email?: string;
}

interface GraphAttachment {
  id?: string;
  mime_type?: string;
  name?: string;
  file_url?: string;
  image_data?: { url?: string };
  video_data?: { url?: string };
}

interface GraphMessage {
  id: string;
  message?: string;
  from?: GraphParticipant;
  created_time?: string;
  attachments?: { data?: GraphAttachment[] };
}

interface GraphThread {
  id: string;
  updated_time?: string;
  participants?: { data?: GraphParticipant[] };
  messages?: { data?: GraphMessage[] };
}

export async function syncAccountSocialConversations(accountId: string) {
  const db = supabaseAdmin();
  const { data: config } = await db
    .from('meta_social_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config || !config.facebook_page_id || !config.facebook_page_access_token) {
    return { syncedThreads: 0, syncedMessages: 0 };
  }

  const pageId = String(config.facebook_page_id);
  const igAccountId = config.instagram_account_id ? String(config.instagram_account_id) : null;
  const userId = config.user_id || accountId;
  let pageAccessToken = '';
  try {
    pageAccessToken = decrypt(config.facebook_page_access_token);
  } catch (err) {
    console.warn('[social-sync] Failed to decrypt page access token:', err);
    return { syncedThreads: 0, syncedMessages: 0 };
  }

  // Ensure page is subscribed to webhooks including standby
  void subscribePageToApp(pageId, pageAccessToken).catch(() => {});

  const platforms: Array<{ platform: 'messenger' | 'instagram'; channel: 'facebook' | 'instagram' }> = [
    { platform: 'messenger', channel: 'facebook' },
  ];
  if (igAccountId && config.instagram_status === 'connected') {
    platforms.push({ platform: 'instagram', channel: 'instagram' });
  }

  let syncedThreads = 0;
  let syncedMessages = 0;

  for (const { platform, channel } of platforms) {
    const isInstagram = channel === 'instagram';
    const userColumn = isInstagram ? 'ig_user_id' : 'fb_user_id';

    try {
      const fields =
        'id,updated_time,participants,messages.limit(10){id,message,from,created_time,attachments{id,mime_type,name,file_url,image_data,video_data}}';
      const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/conversations?platform=${platform}&fields=${encodeURIComponent(fields)}&limit=25&access_token=${encodeURIComponent(pageAccessToken)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;

      const json = (await res.json()) as { data?: GraphThread[] };
      const threads = json.data || [];

      for (const thread of threads) {
        const participants = thread.participants?.data || [];
        const rawMessages = thread.messages?.data || [];
        if (rawMessages.length === 0) continue;

        // Identify customer participant
        let customer = participants.find(
          (p) => p.id && p.id !== pageId && p.id !== igAccountId
        );
        if (!customer) {
          const fromCustomer = rawMessages.find(
            (m) => m.from?.id && m.from.id !== pageId && m.from.id !== igAccountId
          )?.from;
          if (fromCustomer) customer = fromCustomer;
        }
        if (!customer?.id) continue;

        const senderId = customer.id;
        const resolvedName =
          (isInstagram && customer.username
            ? `@${customer.username.trim()}`
            : customer.name?.trim()) ||
          (isInstagram ? `IG: ${senderId.slice(-6)}` : `FB: ${senderId.slice(-6)}`);

        // 1. Find or create Contact
        let contactId: string | null = null;
        const { data: existingContacts } = await db
          .from('contacts')
          .select('id, name')
          .eq('account_id', accountId)
          .eq(userColumn, senderId)
          .limit(1);

        if (existingContacts && existingContacts.length > 0) {
          contactId = existingContacts[0].id;
          const curName = existingContacts[0].name || '';
          if (
            (!curName ||
              curName.startsWith('Facebook User') ||
              curName.startsWith('Instagram User') ||
              curName.startsWith('FB:') ||
              curName.startsWith('IG:')) &&
            resolvedName &&
            !resolvedName.startsWith('FB:') &&
            !resolvedName.startsWith('IG:')
          ) {
            await db
              .from('contacts')
              .update({ name: resolvedName, updated_at: new Date().toISOString() })
              .eq('id', contactId);
          }
        } else {
          const { data: newContact } = await db
            .from('contacts')
            .insert({
              account_id: accountId,
              user_id: userId,
              name: resolvedName,
              phone: '',
              [userColumn]: senderId,
            })
            .select('id')
            .single();
          contactId = newContact?.id || null;
        }

        if (!contactId) continue;

        // Sort messages oldest -> newest
        const orderedMessages = [...rawMessages].sort((a, b) => {
          const ta = a.created_time ? new Date(a.created_time).getTime() : 0;
          const tb = b.created_time ? new Date(b.created_time).getTime() : 0;
          return ta - tb;
        });

        const latestMsg = orderedMessages[orderedMessages.length - 1];
        const latestTime =
          latestMsg?.created_time || thread.updated_time || new Date().toISOString();
        const latestText =
          latestMsg?.message?.trim() ||
          (latestMsg?.attachments?.data?.length ? 'Sent an attachment' : 'Message');

        // 2. Find or create Conversation
        let conversationId: string | null = null;
        const { data: existingConvs } = await db
          .from('conversations')
          .select('id, last_message_at, channel')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .limit(1);

        if (existingConvs && existingConvs.length > 0) {
          conversationId = existingConvs[0].id;
          const existingTime = existingConvs[0].last_message_at
            ? new Date(existingConvs[0].last_message_at).getTime()
            : 0;
          const threadTime = new Date(latestTime).getTime();

          if (threadTime >= existingTime || existingConvs[0].channel !== channel) {
            await db
              .from('conversations')
              .update({
                channel,
                last_message_text: latestText,
                last_message_at: new Date(latestTime).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversationId);
          }
        } else {
          const { data: newConv } = await db
            .from('conversations')
            .insert({
              account_id: accountId,
              user_id: userId,
              contact_id: contactId,
              channel,
              status: 'open',
              unread_count: 1,
              last_message_text: latestText,
              last_message_at: new Date(latestTime).toISOString(),
            })
            .select('id')
            .single();
          conversationId = newConv?.id || null;
          if (conversationId) syncedThreads++;
        }

        if (!conversationId) continue;

        // 3. Batch check existing message_ids in this thread
        const msgIds = orderedMessages.map((m) => m.id).filter(Boolean);
        const { data: existingMsgs } = await db
          .from('messages')
          .select('message_id')
          .eq('conversation_id', conversationId)
          .in('message_id', msgIds);

        const existingSet = new Set((existingMsgs || []).map((m: { message_id: string }) => m.message_id));

        for (const msg of orderedMessages) {
          if (!msg.id || existingSet.has(msg.id)) continue;

          const isFromPage = msg.from?.id === pageId || msg.from?.id === igAccountId;
          let contentText = msg.message?.trim() || '';
          let mediaUrl: string | undefined = undefined;
          let contentType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';

          const firstAtt = msg.attachments?.data?.[0];
          if (firstAtt) {
            mediaUrl =
              firstAtt.image_data?.url ||
              firstAtt.video_data?.url ||
              firstAtt.file_url;
            const mime = firstAtt.mime_type || '';
            if (mime.startsWith('image/') || firstAtt.image_data) contentType = 'image';
            else if (mime.startsWith('video/') || firstAtt.video_data) contentType = 'video';
            else if (mime.startsWith('audio/')) contentType = 'audio';
            else if (firstAtt.file_url) contentType = 'document';

            if (!contentText) {
              contentText = firstAtt.name || `Sent a ${contentType}`;
            }
          }

          if (!contentText && !mediaUrl) continue;

          const { error: msgErr } = await db.from('messages').insert({
            conversation_id: conversationId,
            channel,
            sender_type: isFromPage ? 'agent' : 'customer',
            content_type: contentType,
            content_text: contentText,
            media_url: mediaUrl,
            message_id: msg.id,
            status: 'delivered',
            created_at: msg.created_time
              ? new Date(msg.created_time).toISOString()
              : new Date().toISOString(),
          });

          if (!msgErr) {
            syncedMessages++;
          }
        }
      }
    } catch (err) {
      console.warn(`[social-sync] Error syncing ${platform}:`, err);
    }
  }

  return { syncedThreads, syncedMessages };
}

export async function POST() {
  try {
    const { accountId } = await getCurrentAccount();
    const result = await syncAccountSocialConversations(accountId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
