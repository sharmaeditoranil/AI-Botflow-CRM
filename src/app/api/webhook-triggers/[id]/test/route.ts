import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  extractValueByPath,
  extractTemplateVariables,
  processIncomingWebhook,
  IncomingWebhookError,
} from '@/lib/webhooks/incoming-trigger';
import type { WebhookTrigger } from '@/types';

export async function POST(
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const samplePayload = body.payload ?? {};
  const mode = body.mode === 'send' ? 'send' : 'extract';
  const overridePhone =
    typeof body.override_phone === 'string' ? body.override_phone.trim() : undefined;
  const overrideName =
    typeof body.override_name === 'string' ? body.override_name.trim() : undefined;

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
    return NextResponse.json({ error: 'Trigger not found' }, { status: 404 });
  }

  const typedTrigger = trigger as WebhookTrigger;

  // 1. Dry extraction preview mode
  if (mode === 'extract') {
    const extractedPhone =
      overridePhone ||
      extractValueByPath(samplePayload, typedTrigger.phone_path);

    const extractedName =
      overrideName ||
      (typedTrigger.name_path
        ? extractValueByPath(samplePayload, typedTrigger.name_path)
        : null);

    const { params: extractedParams, mappedValues } = extractTemplateVariables(
      samplePayload,
      typedTrigger.variable_mappings || {}
    );

    return NextResponse.json({
      mode: 'extract',
      extracted: {
        phone: extractedPhone,
        name: extractedName,
        phonePath: typedTrigger.phone_path,
        namePath: typedTrigger.name_path,
        template: typedTrigger.template_name,
        params: extractedParams,
        mappedValues,
      },
    });
  }

  // 2. Live test send mode
  try {
    const result = await processIncomingWebhook(
      admin,
      typedTrigger.id,
      samplePayload,
      typedTrigger.secret_key,
      {
        isTest: true,
        overrideRecipientPhone: overridePhone,
        overrideRecipientName: overrideName,
      }
    );

    return NextResponse.json({
      mode: 'send',
      success: true,
      message: 'Test message sent successfully via WhatsApp.',
      data: result,
    });
  } catch (err) {
    if (err instanceof IncomingWebhookError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
        },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : 'Send failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
