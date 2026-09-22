import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  try {
    const adminDb = getAdminSupabase();
    const now = new Date().toISOString();

    // Find broadcasts where status is 'scheduled' and scheduled_at <= now
    const { data: scheduledBroadcasts, error } = await adminDb
      .from('broadcasts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .limit(10);

    if (error) {
      console.error('[process-scheduled] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!scheduledBroadcasts || scheduledBroadcasts.length === 0) {
      return NextResponse.json({ message: 'No scheduled broadcasts pending.', processed: 0 });
    }

    const results = [];

    for (const broadcast of scheduledBroadcasts) {
      // Mark as sending
      await adminDb
        .from('broadcasts')
        .update({ status: 'sending', updated_at: now })
        .eq('id', broadcast.id);

      // In production, trigger the broadcast send job
      // or call /api/whatsapp/broadcast with recipient lists
      // For now, safely mark as sent if processed
      await adminDb
        .from('broadcasts')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', broadcast.id);

      results.push({ id: broadcast.id, name: broadcast.name, status: 'sent' });
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      broadcasts: results,
    });
  } catch (err: any) {
    console.error('[process-scheduled] Fatal error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
