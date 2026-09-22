import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
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

    const adminDb = getAdminSupabase();
    const { data: account } = await adminDb
      .from('accounts')
      .select('csat_enabled, google_review_url')
      .eq('id', profile.account_id)
      .maybeSingle();

    // Fetch recent CSAT responses
    const { data: recentResponses } = await adminDb
      .from('csat_responses')
      .select('*')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      csat_enabled: account?.csat_enabled ?? false,
      google_review_url: account?.google_review_url ?? '',
      responses: recentResponses || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
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
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    const body = await req.json();
    const { csat_enabled, google_review_url } = body;

    const adminDb = getAdminSupabase();
    const { error } = await adminDb
      .from('accounts')
      .update({
        csat_enabled: !!csat_enabled,
        google_review_url: google_review_url || null,
      })
      .eq('id', profile.account_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, csat_enabled, google_review_url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
