import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  processIncomingWebhook,
  IncomingWebhookError,
  extractValueByPath,
  safeCompareSecrets,
} from '@/lib/webhooks/incoming-trigger';
import { executeAutomation } from '@/lib/automations/engine';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';

/**
 * GET /api/webhooks/incoming/[id]
 * Helpful diagnostic endpoint for developers checking their webhook URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = supabaseAdmin();

  // Check webhook_triggers table first
  const { data: trigger } = await admin
    .from('webhook_triggers')
    .select('id, name, is_active, template_name, phone_path, created_at')
    .eq('id', id)
    .maybeSingle();

  if (trigger) {
    return NextResponse.json({
      status: 'online',
      type: 'webhook_bot',
      message: 'Send a POST request with JSON payload and secret key to trigger this bot.',
      trigger: {
        id: trigger.id,
        name: trigger.name,
        is_active: trigger.is_active,
        template_name: trigger.template_name,
        expected_phone_path: trigger.phone_path,
      },
      authentication: {
        methods: [
          'Header: x-webhook-secret: <secret_key>',
          'Header: Authorization: Bearer <secret_key>',
          'Query param: ?secret=<secret_key>',
        ],
      },
    });
  }

  // Check automations table
  const { data: automation } = await admin
    .from('automations')
    .select('id, name, is_active, trigger_type, trigger_config, created_at')
    .eq('id', id)
    .maybeSingle();

  if (automation && automation.trigger_type === 'incoming_webhook') {
    const cfg = (automation.trigger_config || {}) as Record<string, any>;
    return NextResponse.json({
      status: 'online',
      type: 'workflow_automation',
      message: 'Send a POST request with JSON payload and secret key to trigger this automation.',
      automation: {
        id: automation.id,
        name: automation.name,
        is_active: automation.is_active,
        expected_phone_path: cfg.phone_path || 'phone',
      },
      authentication: {
        methods: [
          'Header: x-webhook-secret: <secret_key>',
          'Header: Authorization: Bearer <secret_key>',
          'Query param: ?secret=<secret_key>',
        ],
      },
    });
  }

  return NextResponse.json(
    { error: 'Webhook trigger not found' },
    { status: 404 }
  );
}

/**
 * POST /api/webhooks/incoming/[id]
 * Public webhook endpoint for receiving external events and sending WhatsApp templates.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = supabaseAdmin();

  // 1. Extract secret key from headers or query string
  const url = new URL(request.url);
  const secretFromHeader = request.headers.get('x-webhook-secret');
  const authHeader = request.headers.get('authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const secretFromQuery = url.searchParams.get('secret');

  const providedSecret = (
    secretFromHeader ||
    bearerSecret ||
    secretFromQuery ||
    ''
  ).trim();

  // 2. Parse JSON payload
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON payload. The webhook endpoint expects application/json.',
        code: 'bad_request',
      },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      {
        error: 'JSON payload must be an object.',
        code: 'bad_request',
      },
      { status: 400 }
    );
  }

  // 3. Process the incoming webhook
  try {
    const { data: triggerCheck } = await admin
      .from('webhook_triggers')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (triggerCheck) {
      const result = await processIncomingWebhook(admin, id, payload, providedSecret);
      return NextResponse.json(
        {
          success: true,
          message: 'WhatsApp template message triggered successfully.',
          data: result,
        },
        { status: 200 }
      );
    }

    // Check automations table
    const { data: automation } = await admin
      .from('automations')
      .select('*')
      .eq('id', id)
      .eq('trigger_type', 'incoming_webhook')
      .maybeSingle();

    if (!automation) {
      return NextResponse.json(
        {
          error: 'Webhook trigger or automation not found.',
          code: 'not_found',
        },
        { status: 404 }
      );
    }

    if (!automation.is_active) {
      return NextResponse.json(
        {
          error: 'Automation workflow is inactive/paused.',
          code: 'inactive',
        },
        { status: 400 }
      );
    }

    const cfg = (automation.trigger_config || {}) as Record<string, any>;
    if (cfg.secret && !safeCompareSecrets(providedSecret, cfg.secret)) {
      return NextResponse.json(
        {
          error: 'Invalid or missing webhook secret key.',
          code: 'unauthorized',
        },
        { status: 401 }
      );
    }

    const phonePath = cfg.phone_path || 'phone';
    const rawPhone = extractValueByPath(payload, phonePath);
    if (!rawPhone) {
      return NextResponse.json(
        {
          error: `Recipient phone number not found at path "${phonePath}".`,
          code: 'missing_phone',
        },
        { status: 400 }
      );
    }

    const namePath = cfg.name_path || 'name';
    const rawName = extractValueByPath(payload, namePath);
    const contactName = rawName ? String(rawName).trim() : 'Webhook Lead';

    // Resolve or create contact and conversation
    let resolved;
    try {
      resolved = await resolveConversationByPhone(
        admin,
        automation.account_id,
        String(rawPhone),
        contactName
      );
    } catch (e: any) {
      return NextResponse.json(
        {
          error: e.message || 'Failed to resolve contact with provided phone number.',
          code: 'phone_error',
        },
        { status: e.status || 400 }
      );
    }

    // Execute automation workflow
    await executeAutomation(automation as any, {
      accountId: automation.account_id,
      triggerType: 'incoming_webhook',
      contactId: resolved.contactId,
      context: {
        vars: payload as Record<string, unknown>,
        conversation_id: resolved.conversationId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Automation workflow executed successfully via webhook.',
        data: {
          automation_id: automation.id,
          contact_id: resolved.contactId,
          conversation_id: resolved.conversationId,
          phone: String(rawPhone),
        },
      },
      { status: 200 }
    );
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

    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      {
        error: message,
        code: 'internal_error',
      },
      { status: 500 }
    );
  }
}
