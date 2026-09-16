import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { generateIncomingWebhookSecret } from '@/lib/webhooks/incoming-trigger';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const admin = supabaseAdmin();
  const newSecret = generateIncomingWebhookSecret();

  const { data: trigger, error } = await admin
    .from('webhook_triggers')
    .update({
      secret_key: newSecret,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('id, secret_key')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!trigger) {
    return NextResponse.json({ error: 'Trigger not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    secret_key: trigger.secret_key,
  });
}
