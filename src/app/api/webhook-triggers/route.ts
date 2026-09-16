import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { generateIncomingWebhookSecret } from '@/lib/webhooks/incoming-trigger';
import type { CreateWebhookTriggerInput } from '@/types';

export async function GET() {
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const admin = supabaseAdmin();
  const { data: triggers, error } = await admin
    .from('webhook_triggers')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ triggers: triggers ?? [] });
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as CreateWebhookTriggerInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const templateName =
    typeof body.template_name === 'string' ? body.template_name.trim() : '';
  const phonePath =
    typeof body.phone_path === 'string' ? body.phone_path.trim() : 'phone';

  if (!name) {
    return NextResponse.json({ error: 'Bot name is required' }, { status: 400 });
  }
  if (!templateName) {
    return NextResponse.json(
      { error: 'WhatsApp template is required' },
      { status: 400 }
    );
  }
  if (!phonePath) {
    return NextResponse.json(
      { error: 'Recipient phone number path is required' },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();
  const secretKey = generateIncomingWebhookSecret();

  const { data: trigger, error } = await admin
    .from('webhook_triggers')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      name,
      description: body.description?.trim() || null,
      secret_key: secretKey,
      is_active: body.is_active !== false,
      template_name: templateName,
      template_language: body.template_language?.trim() || 'en',
      phone_path: phonePath,
      name_path: body.name_path?.trim() || null,
      variable_mappings: body.variable_mappings || {},
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trigger }, { status: 201 });
}
