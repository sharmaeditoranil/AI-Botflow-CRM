import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { dealId } = body;

    const adminDb = getAdminSupabase();
    const todayStr = new Date().toISOString().split('T')[0];

    let query = adminDb
      .from('deals')
      .select(`
        id,
        title,
        value,
        notes,
        expected_close_date,
        ai_followup_enabled,
        followup_instructions,
        conversation_id,
        contact:contacts(id, name, phone, ai_memory, lead_status),
        stage:pipeline_stages(name)
      `)
      .eq('status', 'active');

    if (dealId) {
      query = query.eq('id', dealId);
    } else {
      // Automatic date runner: deals scheduled for today or overdue
      query = query.lte('expected_close_date', todayStr);
    }

    const { data: deals, error } = await query.limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!deals || deals.length === 0) {
      return NextResponse.json({ message: 'No deals pending AI follow-up.', processed: 0 });
    }

    const processedDeals = [];

    for (const deal of deals) {
      const contact = deal.contact as any;
      if (!contact) continue;

      const customerName = contact.name || 'there';
      const instructions = deal.followup_instructions || '';
      const memory = contact.ai_memory || '';

      // Personalized AI follow-up message formulation
      let followUpText = '';
      if (instructions) {
        followUpText = `Namaste ${customerName}! 🙏 Just checking in regarding ${instructions}. Please let me know if you have any questions or how we can help!`;
      } else if (memory.includes('fee') || memory.includes('price') || memory.includes('cost')) {
        followUpText = `Hi ${customerName}! 👋 Following up on the pricing details we discussed. We have a special discount valid this week — would you like more details?`;
      } else {
        followUpText = `Namaste ${customerName}! 🙏 Hope you're doing well. Just following up to see if you had a chance to review the details we shared earlier. Let us know if you'd like to proceed!`;
      }

      // If conversation exists, send message to conversation thread
      let convId = deal.conversation_id;
      if (!convId && contact.id) {
        const { data: existingConv } = await adminDb
          .from('conversations')
          .select('id')
          .eq('contact_id', contact.id)
          .maybeSingle();
        convId = existingConv?.id;
      }

      if (convId) {
        // Record AI follow-up message in conversation
        await adminDb.from('messages').insert({
          conversation_id: convId,
          sender_type: 'bot',
          content: followUpText,
          status: 'sent',
        });
      }

      // Record note in deal & advance next follow-up date by 3 days
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

      // Also sync to contact_notes
      if (contact.id) {
        await adminDb.from('contact_notes').insert({
          contact_id: contact.id,
          user_id: user.id,
          note_text: `🤖 AI Follow-up sent: "${followUpText}"`,
        });
      }

      processedDeals.push({
        dealId: deal.id,
        contactName: customerName,
        message: followUpText,
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
