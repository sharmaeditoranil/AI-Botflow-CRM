import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const url = new URL(request.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(rawLimit || '50', 10) || 50, 1), 200);

  const admin = supabaseAdmin();
  const { data: logs, error } = await admin
    .from('webhook_trigger_logs')
    .select('*')
    .eq('trigger_id', id)
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: logs ?? [] });
}
