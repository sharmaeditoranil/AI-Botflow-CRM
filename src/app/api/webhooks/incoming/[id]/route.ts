import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  processIncomingWebhook,
  IncomingWebhookError,
  extractValueByPath,
  safeCompareSecrets,
  findSmartPhone,
  findSmartName,
  isLikelyTestPing,
} from '@/lib/webhooks/incoming-trigger';
import { executeAutomation } from '@/lib/automations/engine';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-secret',
};

/**
 * Universal request body parser for incoming webhooks.
 * Supports n8n, Pabbly, Zapier, Make, Shopify, WooCommerce, Elementor, PHP, and custom forms.
 * Accepts application/json, application/x-www-form-urlencoded, multipart/form-data, raw text, and Arrays.
 */
async function parseIncomingRequestBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  let rawParsed: unknown = null;

  // 1. JSON
  if (contentType.includes('application/json') || !contentType) {
    try {
      rawParsed = await request.json();
    } catch {}
  }

  // 2. Form-data or x-www-form-urlencoded
  if (
    !rawParsed &&
    (contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data'))
  ) {
    try {
      const formData = await request.formData();
      const obj: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
          ) {
            try {
              obj[key] = JSON.parse(trimmed);
              return;
            } catch {}
          }
          obj[key] = value;
        }
      });
      if (Object.keys(obj).length > 0) rawParsed = obj;
    } catch {}
  }

  // 3. Fallback: text body
  if (!rawParsed) {
    try {
      const text = await request.text();
      const trimmed = (text || '').trim();
      if (trimmed) {
        if (
          (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
          try {
            rawParsed = JSON.parse(trimmed);
          } catch {}
        } else if (trimmed.includes('=')) {
          const params = new URLSearchParams(trimmed);
          const obj: Record<string, unknown> = {};
          params.forEach((value, key) => {
            const vTrim = value.trim();
            if (
              (vTrim.startsWith('{') && vTrim.endsWith('}')) ||
              (vTrim.startsWith('[') && vTrim.endsWith(']'))
            ) {
              try {
                obj[key] = JSON.parse(vTrim);
                return;
              } catch {}
            }
            obj[key] = value;
          });
          if (Object.keys(obj).length > 0) rawParsed = obj;
        }
      }
    } catch {}
  }

  // Handle Array (common n8n pattern: [ { ... } ] or [ { json: { ... } } ])
  if (Array.isArray(rawParsed)) {
    rawParsed = rawParsed[0] || {};
  }

  if (!rawParsed || typeof rawParsed !== 'object') {
    return {};
  }

  const payload = rawParsed as Record<string, unknown>;

  // Unpack platform wrappers:
  // n8n: "json", WooCommerce: "billing", Shopify: "customer", Elementor: "form_fields"
  const wrapperKeys = [
    'json',
    'payload',
    'data',
    'lead',
    'fields',
    'form_fields',
    'body',
    'form_data',
    'customer',
    'billing',
    'item',
  ];

  for (const wrapperKey of wrapperKeys) {
    if (
      payload[wrapperKey] &&
      typeof payload[wrapperKey] === 'object' &&
      !Array.isArray(payload[wrapperKey])
    ) {
      const inner = payload[wrapperKey] as Record<string, unknown>;
      for (const [k, v] of Object.entries(inner)) {
        if (!(k in payload)) {
          payload[k] = v;
        }
      }
    }
  }

  return payload;
}

/**
 * OPTIONS /api/webhooks/incoming/[id]
 * CORS preflight support for browser-based fetch, frontend forms, and API testers.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Unified execution handler for incoming webhooks.
 * Supports both POST (JSON, Form-data, URL-encoded) and GET (URL Query Parameters).
 */
async function executeIncomingWebhook(
  request: Request,
  id: string,
  payload: Record<string, unknown>,
  method: 'GET' | 'POST'
) {
  const admin = supabaseAdmin();

  // 1. Unpack single wrapper objects like payload, data, lead, fields if present
  for (const wrapperKey of ['payload', 'data', 'lead', 'fields', 'body', 'form_data']) {
    if (
      payload[wrapperKey] &&
      typeof payload[wrapperKey] === 'object' &&
      !Array.isArray(payload[wrapperKey])
    ) {
      const inner = payload[wrapperKey] as Record<string, unknown>;
      for (const [k, v] of Object.entries(inner)) {
        if (!(k in payload)) {
          payload[k] = v;
        }
      }
    }
  }

  // 2. Extract secret key from headers, query string, or body
  const url = new URL(request.url);
  const secretFromHeader = request.headers.get('x-webhook-secret');
  const authHeader = request.headers.get('authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const secretFromQuery =
    url.searchParams.get('secret') ||
    url.searchParams.get('token') ||
    url.searchParams.get('api_key');
  const secretFromBody =
    payload && typeof payload.secret === 'string'
      ? payload.secret
      : payload && typeof payload.token === 'string'
      ? payload.token
      : null;

  const providedSecret = (
    secretFromHeader ||
    bearerSecret ||
    secretFromQuery ||
    secretFromBody ||
    ''
  ).trim();

  // Merge any query parameters into payload if they aren't already set
  url.searchParams.forEach((value, key) => {
    if (key !== 'secret' && key !== 'token' && key !== 'api_key' && !(key in payload)) {
      payload[key] = value;
    }
  });

  console.log(`[Webhook ${method}] id:`, id, '| payload keys:', Object.keys(payload));

  try {
    const { data: triggerCheck } = await admin
      .from('webhook_triggers')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (triggerCheck) {
      console.log(`[Webhook ${method}] Found webhook_trigger, processing via processIncomingWebhook`);
      const result = await processIncomingWebhook(admin, id, payload, providedSecret);
      return NextResponse.json(
        {
          success: true,
          message: 'WhatsApp template message triggered successfully.',
          data: result,
        },
        { status: 200, headers: CORS_HEADERS }
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
      console.warn(`[Webhook ${method}] No automation found with id:`, id);
      return NextResponse.json(
        {
          error: 'Webhook trigger or automation not found.',
          code: 'not_found',
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    console.log(`[Webhook ${method}] Found automation:`, automation.id, '| is_active:', automation.is_active);

    if (!automation.is_active) {
      console.warn(`[Webhook ${method}] Automation is inactive, skipping execution`);
      return NextResponse.json(
        {
          error: 'Automation workflow is inactive/paused. Please enable it in the Automations dashboard.',
          code: 'inactive',
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const cfg = (automation.trigger_config || {}) as Record<string, any>;
    // If a secret is provided, verify it. Or if require_secret is explicitly enabled, require it.
    // Otherwise allow requests without secret since the unique automation ID is private and unique.
    if (providedSecret || cfg.require_secret) {
      if (!cfg.secret || !safeCompareSecrets(providedSecret, cfg.secret)) {
        console.warn(`[Webhook ${method}] Secret mismatch for automation:`, id);
        return NextResponse.json(
          {
            error: 'Invalid or missing webhook secret key.',
            code: 'unauthorized',
          },
          { status: 401, headers: CORS_HEADERS }
        );
      }
    }

    const phonePath = cfg.phone_path || 'phone';
    const rawPhone = findSmartPhone(payload, phonePath);
    console.log(`[Webhook ${method}] phonePath:`, phonePath, '| rawPhone found:', rawPhone);

    const isTest = isLikelyTestPing(payload) || rawPhone === '+919999999999';

    if (isTest) {
      console.log(`[Webhook ${method}] Test ping detected, returning ping_ok`);
      return NextResponse.json(
        {
          success: true,
          status: 'ping_ok',
          message: 'Automation webhook test received successfully. Ready to receive leads.',
          data: { automation_id: automation.id },
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    if (!rawPhone) {

      console.warn(`[Webhook ${method}] Phone not found in payload. phonePath:`, phonePath, '| payload:', JSON.stringify(payload).slice(0, 300));
      return NextResponse.json(
        {
          error: `Recipient phone number could not be found. Please include a phone field named "${phonePath}" (e.g. ${phonePath}: "919876543210").`,
          code: 'missing_phone',
          debug: { expected_phone_field: phonePath, received_fields: Object.keys(payload) },
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const namePath = cfg.name_path || 'name';
    const contactName = findSmartName(payload, namePath) || 'Webhook Lead';
    console.log(`[Webhook ${method}] contactName:`, contactName, '| phone:', rawPhone);

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
      console.error(`[Webhook ${method}] resolveConversationByPhone failed:`, e.message);
      return NextResponse.json(
        {
          error: e.message || 'Failed to resolve contact with provided phone number.',
          code: 'phone_error',
        },
        { status: e.status || 400, headers: CORS_HEADERS }
      );
    }

    console.log(`[Webhook ${method}] Resolved contact:`, resolved.contactId, '| conversation:', resolved.conversationId);

    // Execute automation workflow
    try {
      await executeAutomation(automation as any, {
        accountId: automation.account_id,
        triggerType: 'incoming_webhook',
        contactId: resolved.contactId,
        context: {
          vars: payload as Record<string, unknown>,
          conversation_id: resolved.conversationId,
        },
      });
      console.log(`[Webhook ${method}] executeAutomation completed for automation:`, automation.id);
    } catch (execErr: any) {
      console.error(`[Webhook ${method}] executeAutomation failed:`, execErr.message || execErr);
      return NextResponse.json(
        {
          error: `Automation executed but failed: ${execErr.message || 'Unknown error'}`,
          code: 'execution_error',
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

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
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    if (err instanceof IncomingWebhookError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
        },
        { status: err.status, headers: CORS_HEADERS }
      );
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      {
        error: message,
        code: 'internal_error',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * GET /api/webhooks/incoming/[id]
 * Supports both:
 * 1. Diagnostic endpoint (when opened in browser with no query params)
 * 2. GET-based webhooks (when parameters like phone/name are passed in query string)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  // If query parameters contain form fields or lead data, process as webhook event!
  const queryKeys = Array.from(url.searchParams.keys()).filter(
    (k) => !['format', 'pretty'].includes(k.toLowerCase())
  );

  if (queryKeys.length > 0) {
    const payload: Record<string, unknown> = {};
    url.searchParams.forEach((value, key) => {
      payload[key] = value;
    });
    return executeIncomingWebhook(request, id, payload, 'GET');
  }

  // Otherwise, return diagnostic / documentation status
  const admin = supabaseAdmin();

  // Check webhook_triggers table first
  const { data: trigger } = await admin
    .from('webhook_triggers')
    .select('id, name, is_active, template_name, phone_path, created_at')
    .eq('id', id)
    .maybeSingle();

  if (trigger) {
    return NextResponse.json(
      {
        status: 'online',
        type: 'webhook_bot',
        message: 'Webhook trigger is active. Accepts POST (JSON, Form-data) or GET (Query parameters).',
        trigger: {
          id: trigger.id,
          name: trigger.name,
          is_active: trigger.is_active,
          template_name: trigger.template_name,
          expected_phone_path: trigger.phone_path,
        },
        accepted_formats: [
          'GET query parameters (?phone=...&name=...)',
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
        ],
        authentication: {
          note: 'Secret key is optional when using the unique bot URL.',
          methods: [
            'Header: x-webhook-secret: <secret_key>',
            'Header: Authorization: Bearer <secret_key>',
            'Query param: ?secret=<secret_key>',
          ],
        },
      },
      { headers: CORS_HEADERS }
    );
  }

  // Check automations table
  const { data: automation } = await admin
    .from('automations')
    .select('id, name, is_active, trigger_type, trigger_config, created_at')
    .eq('id', id)
    .maybeSingle();

  if (automation && automation.trigger_type === 'incoming_webhook') {
    const cfg = (automation.trigger_config || {}) as Record<string, any>;
    return NextResponse.json(
      {
        status: 'online',
        type: 'workflow_automation',
        message: 'Automation webhook is active. Accepts POST (JSON, Form-data) or GET (Query parameters).',
        automation: {
          id: automation.id,
          name: automation.name,
          is_active: automation.is_active,
          expected_phone_path: cfg.phone_path || 'phone',
        },
        accepted_formats: [
          'GET query parameters (?phone=...&name=...)',
          'application/json',
          'application/x-www-form-urlencoded',
          'multipart/form-data',
        ],
        authentication: {
          methods: [
            'Header: x-webhook-secret: <secret_key>',
            'Header: Authorization: Bearer <secret_key>',
            'Query param: ?secret=<secret_key>',
          ],
        },
      },
      { headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    { error: 'Webhook trigger not found' },
    { status: 404, headers: CORS_HEADERS }
  );
}

/**
 * POST /api/webhooks/incoming/[id]
 * Public webhook endpoint for receiving external events and sending WhatsApp templates.
 * Accepts JSON, Form URL-encoded, or Multipart data from any website or backend.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const payload = await parseIncomingRequestBody(request);
  return executeIncomingWebhook(request, id, payload, 'POST');
}

