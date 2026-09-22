import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { engineSendText } from '@/lib/flows/meta-send';
import { generateWithAdminAi } from '@/lib/ai/admin-ai';

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.AUTOMATION_CRON_SECRET;
    const incomingSecret = req.headers.get('x-cron-secret');
    const isCron = !!(cronSecret && incomingSecret === cronSecret);

    let authUser: { id: string } | null = null;

    if (!isCron) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      authUser = user;
    }

    const body = await req.json().catch(() => ({}));
    const { dealId } = body;

    const adminDb = supabaseAdmin();
    const todayStr = new Date().toISOString().split('T')[0];

    let query = adminDb
      .from('deals')
      .select(`
        id,
        account_id,
        user_id,
        title,
        value,
        notes,
        expected_close_date,
        ai_followup_enabled,
        followup_instructions,
        conversation_id,
        contact:contacts(id, name, phone, wa_user_id, ai_memory, lead_status),
        stage:pipeline_stages(name)
      `)
      .in('status', ['open', 'active']);

    if (dealId) {
      query = query.eq('id', dealId);
    } else {
      // Automatic runner: deals with AI follow-up enabled, scheduled for today or overdue
      query = query
        .eq('ai_followup_enabled', true)
        .lte('expected_close_date', todayStr);
    }

    const { data: deals, error } = await query.limit(25);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!deals || deals.length === 0) {
      return NextResponse.json({ message: 'No deals pending AI follow-up.', processed: 0 });
    }

    const processedDeals = [];

    for (const deal of deals) {
      const contact = deal.contact as any;
      if (!contact || !deal.account_id) continue;

      const customerName = contact.name || 'there';
      const instructions = deal.followup_instructions || '';
      const memory = contact.ai_memory || '';

      // Personalized AI follow-up message formulation using Admin Master AI key
      let followUpText = '';
      try {
        const aiPrompt = `Write a polite, engaging, personalized WhatsApp follow-up message in natural Hinglish/English for a business lead.
Customer Name: ${customerName}
Lead Title: ${deal.title}
Context: ${memory || 'General inquiry'}
Deal Value: ₹${deal.value || 0}
Special Instruction: ${instructions || 'Follow up politely and ask if they need assistance or want to proceed'}

Keep it concise (2-3 sentences max), warm, professional, with appropriate emojis. Do not include placeholders.`;

        followUpText = await generateWithAdminAi(aiPrompt, {
          systemPrompt: 'You are an intelligent business WhatsApp follow-up assistant.',
          maxTokens: 150,
        });
      } catch (aiErr) {
        console.warn('[ai-followup] generateWithAdminAi notice, using smart fallback:', aiErr);
      }

      if (!followUpText) {
        if (instructions) {
          followUpText = `Namaste ${customerName}! 🙏 Just checking in regarding ${instructions}. Please let us know if you have any questions!`;
        } else if (memory.toLowerCase().includes('fee') || memory.toLowerCase().includes('price') || memory.toLowerCase().includes('cost')) {
          followUpText = `Hi ${customerName}! 👋 Following up on our previous discussion about pricing. We have an exclusive offer valid this week — would you like to explore?`;
        } else if (memory.toLowerCase().includes('demo') || memory.toLowerCase().includes('trial')) {
          followUpText = `Namaste ${customerName}! 🙏 Just checking if you would like a quick 5-minute walkthrough of our features today. Let us know what time suits you!`;
        } else {
          followUpText = `Namaste ${customerName}! 🙏 Hope you're having a great day. Just following up regarding your inquiry to see if you have any questions. We're here to help!`;
        }
      }

      // Ensure conversation exists
      let convId = deal.conversation_id;
      if (!convId && contact.id) {
        const { data: existingConv } = await adminDb
          .from('conversations')
          .select('id')
          .eq('contact_id', contact.id)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        convId = existingConv?.id;
      }

      // Send message to WhatsApp via engineSendText or fallback to message row
      let sentToWhatsApp = false;
      if (convId) {
        try {
          await engineSendText({
            accountId: deal.account_id,
            userId: deal.user_id || authUser?.id,
            conversationId: convId,
            contactId: contact.id,
            text: followUpText,
            aiGenerated: true,
          });
          sentToWhatsApp = true;
        } catch (sendErr) {
          console.warn('[ai-followup] WhatsApp API send fallback to DB message row:', sendErr);
          await adminDb.from('messages').insert({
            conversation_id: convId,
            sender_type: 'bot',
            content: followUpText,
            status: 'sent',
          });
        }
      }

      // Roll next follow-up date by 3 days so agent / AI doesn't spam customer
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 3);
      const nextDateStr = nextDate.toISOString().split('T')[0];

      const noteEntry = `\n[🤖 AI Follow-up sent on ${new Date().toLocaleDateString('en-IN')}]: "${followUpText}"`;
      const updatedNotes = (deal.notes || '') + noteEntry;

      await adminDb
        .from('deals')
        .update({
          notes: updatedNotes,
          expected_close_date: nextDateStr,
        })
        .eq('id', deal.id);

      // Sync to contact_notes
      if (contact.id) {
        await adminDb.from('contact_notes').insert({
          contact_id: contact.id,
          account_id: deal.account_id,
          user_id: deal.user_id || authUser?.id,
          note_text: `🤖 AI Follow-up sent: "${followUpText}"`,
        });
      }

      processedDeals.push({
        dealId: deal.id,
        contactName: customerName,
        phone: contact.phone,
        message: followUpText,
        sentToWhatsApp,
        nextFollowup: nextDateStr,
      });
    }

    return NextResponse.json({
      success: true,
      processed: processedDeals.length,
      deals: processedDeals,
    });
  } catch (err: any) {
    console.error('AI Followup error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
