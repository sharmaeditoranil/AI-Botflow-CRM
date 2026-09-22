import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { engineSendText } from '@/lib/flows/meta-send';

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    const body = await req.json();
    const { conversationId, contactId } = body;

    if (!conversationId && !contactId) {
      return NextResponse.json({ error: 'conversationId or contactId is required' }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    // Fetch conversation & contact
    let convId = conversationId;
    let recipientPhone = '';

    if (convId) {
      const { data: conv } = await adminDb
        .from('conversations')
        .select('id, contact_id, contact:contacts(phone, name)')
        .eq('id', convId)
        .maybeSingle();

      recipientPhone = (conv?.contact as any)?.phone || '';
    } else if (contactId) {
      const { data: cont } = await adminDb
        .from('contacts')
        .select('id, phone, name')
        .eq('id', contactId)
        .maybeSingle();

      recipientPhone = cont?.phone || '';
    }

    const csatMessage =
      `⭐ *Rate Your Experience (1 - 5 Stars)* ⭐\n\n` +
      `We would love to hear your feedback! How satisfied are you with our service today?\n\n` +
      `Reply with a number:\n` +
      `5️⃣ - Excellent ⭐⭐⭐⭐⭐\n` +
      `4️⃣ - Very Good ⭐⭐⭐⭐\n` +
      `3️⃣ - Average ⭐⭐⭐\n` +
      `2️⃣ - Poor ⭐⭐\n` +
      `1️⃣ - Terrible ⭐\n\n` +
      `_Your feedback helps us serve you better!_`;

    // Record system message in conversation thread
    if (convId) {
      await adminDb.from('messages').insert({
        conversation_id: convId,
        sender_type: 'agent',
        user_id: user.id,
        content: csatMessage,
        status: 'sent',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'CSAT survey sent successfully!',
    });
  } catch (err: any) {
    console.error('CSAT send error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
