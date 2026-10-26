import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { findOrCreateNumberConversation } from '@/lib/conversations/number-conversation';
import { findExistingContact } from '@/lib/contacts/dedupe';
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply';
import { resolveWahaPhoneNumber } from '@/lib/waha/client';

// Simple in-memory dedup cache for rapidly repeating webhook delivery
const seenMessages = new Map<string, number>();

function isDuplicate(id: string): boolean {
  const now = Date.now();
  // Clean entries older than 5 minutes
  if (seenMessages.size > 2000) {
    for (const [k, v] of seenMessages.entries()) {
      if (now - v > 300000) seenMessages.delete(k);
    }
  }
  if (seenMessages.has(id)) return true;
  seenMessages.set(id, now);
  return false;
}

/**
 * WAHA Webhook Handler
 * Receives incoming messages and session events from WhatsApp Web (WAHA).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = body.event;
    const session = body.session;
    const payload = body.payload;

    if (!session || !event) {
      return NextResponse.json({ status: 'ignored_missing_fields' });
    }

    const db = supabaseAdmin();

    // 1. Handle session status updates
    if (event === 'session.status') {
      const status = payload?.status; // e.g. 'WORKING', 'SCAN_QR_CODE', 'STOPPED'
      const me = payload?.me;

      let phoneDisplay: string | null = null;
      if (me?.id) {
        const clean = me.id.replace('@c.us', '').replace('@s.whatsapp.net', '');
        phoneDisplay = `+${clean}`;
      }

      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (status === 'WORKING') {
        updateData.status = 'connected';
        updateData.connected_at = new Date().toISOString();
        if (phoneDisplay) updateData.display_phone_number = phoneDisplay;
      } else if (status === 'STOPPED' || status === 'FAILED') {
        updateData.status = 'disconnected';
      }

      await db
        .from('whatsapp_config')
        .update(updateData)
        .eq('phone_number_id', session)
        .eq('waba_id', 'waha');

      return NextResponse.json({ status: 'ok', event: 'session.status' });
    }

    // 2. Handle incoming and outgoing message events
    if (event === 'message' || event === 'message.any') {
      const messageId = payload?.id || `waha_${Date.now()}`;

      // Avoid double-processing since WAHA sends both 'message' and 'message.any'
      if (isDuplicate(messageId)) {
        return NextResponse.json({ status: 'duplicate_skipped' });
      }

      const isFromMe = Boolean(payload?.fromMe);
      const rawFrom = payload?.from || '';
      const rawTo = payload?.to || '';

      // Find the whatsapp_config matching this session
      const { data: config } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('phone_number_id', session)
        .eq('waba_id', 'waha')
        .maybeSingle();

      if (!config) {
        console.warn(`[waha-webhook] No whatsapp_config found for session: ${session}`);
        return NextResponse.json({ status: 'no_config_found' });
      }

      const accountId = config.account_id;
      const configOwnerUserId = config.user_id;

      // Extract and resolve customer phone (handles multi-device LIDs properly)
      const targetJid = isFromMe ? rawTo : rawFrom;
      const { phone: formattedPhone, name: resolvedName } = await resolveWahaPhoneNumber(
        session,
        targetJid,
        payload
      );

      const customerDigits = formattedPhone.replace(/\D/g, '');
      if (!customerDigits || targetJid.includes('@g.us') || customerDigits.length < 8) {
        // Skip group messages or invalid formats
        return NextResponse.json({ status: 'skipped_group_or_invalid' });
      }

      const contentText = payload?.body || (payload?.hasMedia ? '[Media]' : '');
      const createdAtIso = payload?.timestamp
        ? new Date(payload.timestamp * 1000).toISOString()
        : new Date().toISOString();

      // Find or create Contact
      let contact = await findExistingContact(db, accountId, formattedPhone);

      if (!contact && !isFromMe) {
        const pushName = payload?._data?.notifyName || payload?.pushname || resolvedName || null;
        const displayName = pushName || formattedPhone;

        const { data: newContact, error: contactErr } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: configOwnerUserId,
            phone: formattedPhone,
            name: displayName,
          })
          .select()
          .maybeSingle();

        if (newContact) {
          contact = newContact;
        } else if (contactErr) {
          // If race condition on phone unique constraint, re-fetch
          contact = await findExistingContact(db, accountId, formattedPhone);
        }
      }

      if (!contact) {
        return NextResponse.json({ status: 'no_contact' });
      }

      // If contact name was just a raw phone number but we now have a pushName, update it
      const newNameCandidate = resolvedName || payload?._data?.notifyName || payload?.pushname;
      if (newNameCandidate && contact.name && (contact.name.startsWith('+') || contact.name.startsWith('91'))) {
        await db
          .from('contacts')
          .update({ name: newNameCandidate })
          .eq('id', contact.id);
        contact.name = newNameCandidate;
      }

      // Find or create conversation for this WhatsApp Web number
      const { conversation } = await findOrCreateNumberConversation<{ id: string; unread_count: number }>(
        db,
        {
          accountId,
          contactId: contact.id,
          numberId: config.id,
          userId: configOwnerUserId,
        },
        'id, unread_count'
      );

      if (!conversation) {
        return NextResponse.json({ status: 'no_conversation' });
      }

      const mediaUrl = payload?.mediaUrl || null;
      const contentType = payload?.hasMedia ? 'image' : 'text';

      // Insert message into messages table (valid sender_types: 'customer', 'agent', 'bot')
      const { error: msgErr } = await db
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_type: isFromMe ? 'agent' : 'customer',
          content_type: contentType,
          content_text: contentText,
          media_url: mediaUrl,
          message_id: messageId,
          status: isFromMe ? 'sent' : 'delivered',
          created_at: createdAtIso,
        });

      if (msgErr) {
        console.warn('[waha-webhook] Message insert notice:', msgErr.message);
      }

      // Update conversation last message & unread count
      const newUnread = isFromMe ? Number(conversation.unread_count || 0) : Number(conversation.unread_count || 0) + 1;
      await db
        .from('conversations')
        .update({
          last_message_text: contentText,
          last_message_at: createdAtIso,
          unread_count: newUnread,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);

      // Trigger AI Auto-Reply if message is inbound from customer
      if (!isFromMe && contentText.trim()) {
        void dispatchInboundToAiReply({
          accountId,
          conversationId: conversation.id,
          contactId: contact.id,
          configOwnerUserId,
          inboundMessageId: messageId,
        }).catch((err) => console.error('[waha-ai-reply] error:', err));
      }

      return NextResponse.json({ status: 'ok', messageId });
    }

    return NextResponse.json({ status: 'ignored_unhandled_event' });
  } catch (err: any) {
    console.error('[waha-webhook] Internal error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
