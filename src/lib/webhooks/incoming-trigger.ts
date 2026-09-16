// ============================================================
// Incoming Webhook Triggers — payload path extraction, variable
// mapping, secret verification, and automated template delivery.
// ============================================================

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebhookTrigger } from '@/types';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';

export const INCOMING_WEBHOOK_SECRET_PREFIX = 'whsec_';

/** Generate a secure random webhook secret for a bot. */
export function generateIncomingWebhookSecret(): string {
  return `${INCOMING_WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString('base64url')}`;
}

/** Error class with HTTP status code for incoming webhook handling. */
export class IncomingWebhookError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'IncomingWebhookError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Compare two secret strings in constant time to prevent timing attacks.
 */
export function safeCompareSecrets(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Tokenize a path string supporting dot-notation and brackets,
 * e.g., 'customer.billing_address.phone' or 'items[0].recipient.mobile'
 */
function tokenizePath(path: string): string[] {
  if (!path) return [];
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  return normalized
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract a scalar value (stringified) from an arbitrary JSON object using
 * a path string like "customer.phone", "order.recipient.mobile", etc.
 */
export function extractValueByPath(payload: unknown, path: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const cleanPath = (path || '').trim();
  if (!cleanPath) return null;

  const tokens = tokenizePath(cleanPath);
  if (tokens.length === 0) return null;

  let current: unknown = payload;

  for (let i = 0; i < tokens.length; i++) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return null;
    }

    const token = tokens[i];
    const isLast = i === tokens.length - 1;
    const record = current as Record<string, unknown>;

    if (token in record) {
      current = record[token];
    } else if (isLast) {
      // Case-insensitive fallback on the final property
      const lowerToken = token.toLowerCase();
      const matchedKey = Object.keys(record).find(
        (k) => k.toLowerCase() === lowerToken
      );
      if (matchedKey !== undefined) {
        current = record[matchedKey];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  if (current === null || current === undefined) {
    return null;
  }

  if (typeof current === 'string') {
    const trimmed = current.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }

  return null;
}

/**
 * Extract template variables based on configured index mappings.
 * Mapping shape: { "1": "customer.name", "2": "order.id", "3": "static:Welcome" }
 */
export function extractTemplateVariables(
  payload: unknown,
  mappings: Record<string, string> = {}
): { params: string[]; mappedValues: Record<string, string> } {
  const mappedValues: Record<string, string> = {};

  // Find all numeric keys (e.g. "1", "2", "3")
  const indices = Object.keys(mappings)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  const maxIndex = indices.length > 0 ? Math.max(...indices) : 0;
  const params: string[] = [];

  for (let idx = 1; idx <= maxIndex; idx++) {
    const mappingKey = String(idx);
    const pathOrStatic = mappings[mappingKey];

    let val = '';
    if (typeof pathOrStatic === 'string') {
      if (pathOrStatic.startsWith('static:')) {
        val = pathOrStatic.slice(7).trim();
      } else {
        val = extractValueByPath(payload, pathOrStatic) ?? '';
      }
    }

    mappedValues[mappingKey] = val;
    params.push(val);
  }

  return { params, mappedValues };
}

export interface ProcessIncomingWebhookOptions {
  isTest?: boolean;
  overrideRecipientPhone?: string;
  overrideRecipientName?: string;
}

export interface ProcessIncomingWebhookResult {
  success: boolean;
  messageId: string;
  whatsappMessageId: string;
  recipient: string;
  recipientName?: string | null;
  template: string;
  language: string;
  mappedParams: string[];
  executionTimeMs: number;
}

/**
 * Main execution handler: validates trigger, extracts mapped data, resolves
 * conversation and sends the template message via existing WhatsApp integration.
 */
export async function processIncomingWebhook(
  supabase: SupabaseClient,
  triggerId: string,
  payload: unknown,
  providedSecret: string,
  options: ProcessIncomingWebhookOptions = {}
): Promise<ProcessIncomingWebhookResult> {
  const startTime = Date.now();

  // 1. Fetch trigger
  const { data: trigger, error: triggerErr } = await supabase
    .from('webhook_triggers')
    .select('*')
    .eq('id', triggerId)
    .maybeSingle();

  if (triggerErr || !trigger) {
    throw new IncomingWebhookError('not_found', 'Webhook trigger not found', 404);
  }

  const typedTrigger = trigger as WebhookTrigger;

  // 2. Secret authentication (bypassed only during dry tests that explicitly specify isTest with valid session)
  if (!options.isTest) {
    if (!providedSecret || !safeCompareSecrets(providedSecret, typedTrigger.secret_key)) {
      // Record failed authentication log
      await supabase.from('webhook_trigger_logs').insert({
        trigger_id: typedTrigger.id,
        account_id: typedTrigger.account_id,
        status: 'failed',
        http_status: 401,
        request_payload: typeof payload === 'object' && payload !== null ? payload : {},
        mapped_variables: {},
        error_message: 'Invalid or missing secret key',
        execution_time_ms: Date.now() - startTime,
      });

      throw new IncomingWebhookError(
        'unauthorized',
        'Invalid or missing secret key. Provide it in x-webhook-secret header or ?secret= query parameter.',
        401
      );
    }

    // 3. Active check
    if (!typedTrigger.is_active) {
      throw new IncomingWebhookError(
        'trigger_inactive',
        'This webhook trigger is currently paused or inactive.',
        403
      );
    }
  }

  // 4. Extract recipient phone
  let phone = options.overrideRecipientPhone;
  if (!phone) {
    phone = extractValueByPath(payload, typedTrigger.phone_path) || undefined;
  }

  // Optional Name extraction
  const name =
    options.overrideRecipientName ||
    (typedTrigger.name_path
      ? extractValueByPath(payload, typedTrigger.name_path) || undefined
      : undefined);

  // 5. Extract template variables
  const { params: templateParams, mappedValues } = extractTemplateVariables(
    payload,
    typedTrigger.variable_mappings || {}
  );

  if (!phone) {
    const errorMsg = `Recipient phone number could not be extracted using path "${typedTrigger.phone_path}".`;
    await supabase.from('webhook_trigger_logs').insert({
      trigger_id: typedTrigger.id,
      account_id: typedTrigger.account_id,
      status: 'failed',
      http_status: 400,
      recipient_name: name ?? null,
      request_payload: typeof payload === 'object' && payload !== null ? payload : {},
      mapped_variables: mappedValues,
      error_message: errorMsg,
      execution_time_ms: Date.now() - startTime,
    });

    throw new IncomingWebhookError('phone_missing', errorMsg, 400);
  }

  try {
    // 6. Find or create contact and conversation under the trigger's account
    const resolved = await resolveConversationByPhone(
      supabase,
      typedTrigger.account_id,
      phone,
      name
    );

    // 7. Send the WhatsApp template message using the existing send core
    const sendResult = await sendMessageToConversation(
      supabase,
      typedTrigger.account_id,
      {
        conversationId: resolved.conversationId,
        messageType: 'template',
        templateName: typedTrigger.template_name,
        templateLanguage: typedTrigger.template_language || 'en',
        templateParams: templateParams.length > 0 ? templateParams : undefined,
      }
    );

    const executionTimeMs = Date.now() - startTime;

    // 8. Record success in delivery logs
    await supabase.from('webhook_trigger_logs').insert({
      trigger_id: typedTrigger.id,
      account_id: typedTrigger.account_id,
      status: 'success',
      http_status: 200,
      recipient_phone: phone,
      recipient_name: name ?? null,
      request_payload: typeof payload === 'object' && payload !== null ? payload : {},
      mapped_variables: mappedValues,
      whatsapp_message_id: sendResult.whatsappMessageId,
      execution_time_ms: executionTimeMs,
    });

    // 9. Increment trigger stats
    await supabase
      .from('webhook_triggers')
      .update({
        execution_count: (typedTrigger.execution_count || 0) + 1,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', typedTrigger.id);

    return {
      success: true,
      messageId: sendResult.messageId,
      whatsappMessageId: sendResult.whatsappMessageId,
      recipient: phone,
      recipientName: name,
      template: typedTrigger.template_name,
      language: typedTrigger.template_language,
      mappedParams: templateParams,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const status = err instanceof SendMessageError ? err.status : 500;

    await supabase.from('webhook_trigger_logs').insert({
      trigger_id: typedTrigger.id,
      account_id: typedTrigger.account_id,
      status: 'failed',
      http_status: status,
      recipient_phone: phone,
      recipient_name: name ?? null,
      request_payload: typeof payload === 'object' && payload !== null ? payload : {},
      mapped_variables: mappedValues,
      error_message: errorMessage,
      execution_time_ms: executionTimeMs,
    });

    throw new IncomingWebhookError('delivery_failed', errorMessage, status);
  }
}
