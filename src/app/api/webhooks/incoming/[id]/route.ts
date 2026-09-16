import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  processIncomingWebhook,
  IncomingWebhookError,
} from '@/lib/webhooks/incoming-trigger';

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

  const { data: trigger } = await admin
    .from('webhook_triggers')
    .select('id, name, is_active, template_name, phone_path, created_at')
    .eq('id', id)
    .maybeSingle();

  if (!trigger) {
    return NextResponse.json(
      { error: 'Webhook trigger not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    status: 'online',
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
    const result = await processIncomingWebhook(admin, id, payload, providedSecret);
    return NextResponse.json(
      {
        success: true,
        message: 'WhatsApp template message triggered successfully.',
        data: result,
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
