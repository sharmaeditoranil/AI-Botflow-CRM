import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { generateWithAdminAi } from '@/lib/ai/admin-ai';

/**
 * POST /api/crm/ai-summarize
 * Generates an AI-powered Follow-up summary note by analyzing the contact's WhatsApp conversation history.
 * Uses the Super Admin platform AI key so it doesn't drain user tokens.
 */
export async function POST(req: Request) {
  try {
    const { accountId } = await getCurrentAccount();
    const admin = supabaseAdmin();

    const body = await req.json().catch(() => ({}));
    const { contactId, conversationId, dealId } = body;

    let targetConversationId = conversationId;
    let targetContactId = contactId;

    // If dealId provided, resolve contact and conversation
    if (dealId && (!targetConversationId || !targetContactId)) {
      const { data: deal } = await admin
        .from('deals')
        .select('id, contact_id, conversation_id')
        .eq('id', dealId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (deal) {
        if (!targetContactId) targetContactId = deal.contact_id;
        if (!targetConversationId) targetConversationId = deal.conversation_id;
      }
    }

    // If conversationId not known, find the most recent conversation for this contact
    if (!targetConversationId && targetContactId) {
      const { data: conv } = await admin
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', targetContactId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conv) {
        targetConversationId = conv.id;
      }
    }

    // Fetch contact details
    let contactName = 'Customer';
    let contactPhone = '';
    if (targetContactId) {
      const { data: contact } = await admin
        .from('contacts')
        .select('name, phone')
        .eq('id', targetContactId)
        .maybeSingle();
      if (contact?.name) contactName = contact.name;
      if (contact?.phone) contactPhone = contact.phone;
    }

    // If still no conversation, return friendly empty state
    if (!targetConversationId) {
      return NextResponse.json({
        summary: `No WhatsApp conversation history found for ${contactName}. Add a manual follow-up note below.`,
        messageCount: 0,
      });
    }

    // Fetch last 15 messages from the conversation
    const { data: messages } = await admin
      .from('messages')
      .select('sender_type, content_text, created_at')
      .eq('conversation_id', targetConversationId)
      .order('created_at', { ascending: false })
      .limit(15);

    if (!messages || messages.length === 0) {
      return NextResponse.json({
        summary: `No messages exchanged with ${contactName} yet. Ready for first follow-up.`,
        messageCount: 0,
      });
    }

    // Build chronological chat context
    const transcript = messages
      .slice()
      .reverse()
      .map((m: any) => `${m.sender_type === 'customer' ? 'Customer' : 'Agent/Bot'}: ${m.content_text || ''}`)
      .join('\n');

    const prompt = `You are a professional CRM Assistant. Analyze the following WhatsApp conversation between ${contactName} (${contactPhone || 'Prospect'}) and the business.

Chat Transcript:
${transcript}

Task:
Write a concise, high-value CRM follow-up note (max 2-3 sentences).
Highlight:
1. What the customer asked or required.
2. Current status / objections / sentiment.
3. Recommended next follow-up action for the sales team.

Tone: Crisp, professional, actionable. Avoid unnecessary pleasantries or filler. Write directly for sales notes.`;

    let summary = '';
    try {
      summary = await generateWithAdminAi(prompt, {
        systemPrompt: 'You are an intelligent CRM sales analyst who writes crisp, actionable follow-up notes.',
        maxTokens: 150,
      });
    } catch (err: any) {
      console.warn('[crm-ai-summarize] Admin AI call failed:', err);
      summary = `Recent conversation has ${messages.length} messages. Last message from ${messages[0].sender_type}: "${messages[0].content_text?.slice(0, 100)}"`;
    }

    return NextResponse.json({
      success: true,
      summary: summary.trim(),
      messageCount: messages.length,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
