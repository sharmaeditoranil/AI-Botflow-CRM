import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import type { UpdateWebhookTriggerInput } from '@/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireRole('viewer');
  } catch (err) {
    return toErrorResponse(err);
  }

  const admin = supabaseAdmin();
  const { data: trigger, error } = await admin
    .from('webhook_triggers')
    .select('*')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!trigger) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ trigger });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = (await request.json().catch(() => null)) as UpdateWebhookTriggerInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Bot name cannot be empty' }, { status: 400 });
    }
    patch.name = trimmed;
  }
  if (typeof body.description !== 'undefined') {
    patch.description = body.description ? body.description.trim() : null;
  }
  if (typeof body.template_name === 'string') {
    const trimmed = body.template_name.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Template name cannot be empty' },
        { status: 400 }
      );
    }
    patch.template_name = trimmed;
  }
  if (typeof body.template_language === 'string') {
    patch.template_language = body.template_language.trim() || 'en';
  }
  if (typeof body.phone_path === 'string') {
    const trimmed = body.phone_path.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'Recipient phone path cannot be empty' },
        { status: 400 }
      );
    }
    patch.phone_path = trimmed;
  }
  if (typeof body.name_path !== 'undefined') {
    patch.name_path = body.name_path ? body.name_path.trim() : null;
  }
  if (typeof body.variable_mappings === 'object' && body.variable_mappings !== null) {
    patch.variable_mappings = body.variable_mappings;
  }
  if (typeof body.is_active === 'boolean') {
    patch.is_active = body.is_active;
  }

  const admin = supabaseAdmin();
  const { data: trigger, error } = await admin
    .from('webhook_triggers')
    .update(patch)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!trigger) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ trigger });
}

export async function DELETE(
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
  const { error } = await admin
    .from('webhook_triggers')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
