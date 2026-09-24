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
 * Clean and format phone number into E.164 (+CountryCodeDigits) format.
 * Intelligently handles 10-digit Indian numbers, spaces, brackets, hyphens.
 */
export function cleanPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // Remove spaces, hyphens, brackets, dots
  let digits = str.replace(/[\s\-\(\)\.]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  // Remove single leading trunk 0 if present (e.g. 09939800780 -> 9939800780)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // If 10 digits starting with 6, 7, 8, 9, default to India country code 91
  if (/^[6-9]\d{9}$/.test(digits)) {
    digits = `91${digits}`;
  }

  // Check valid international length (7 to 15 digits)
  if (/^[1-9]\d{6,14}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Smart recipient phone extraction for ANY external website, form, or webhook.
 * Checks configured path, common field names, nested objects, and regex scanning.
 */
export function findSmartPhone(payload: unknown, configuredPath?: string | null): string | null {
  if (!payload || typeof payload !== 'object') return null;

  // 1. Try configured path first
  if (configuredPath) {
    const val = extractValueByPath(payload, configuredPath);
    if (val) {
      const cleaned = cleanPhone(val);
      if (cleaned) return cleaned;
    }
  }

  // 2. Try common phone keys (case-insensitive supported by extractValueByPath)
  const commonPhoneKeys = [
    'phone',
    'mobile',
    'mobile_number',
    'phone_number',
    'phonenumber',
    'mobilenumber',
    'whatsapp',
    'whatsapp_number',
    'team_whatsapp',
    'team_whatsapp_number',
    'contact',
    'contact_number',
    'contactnumber',
    'tel',
    'telephone',
    'user_phone',
    'customer_phone',
    'lead_phone',
    'number',
    'recipient',
    'recipient_phone',
    'to',
  ];

  for (const key of commonPhoneKeys) {
    const val = extractValueByPath(payload, key);
    if (val) {
      const cleaned = cleanPhone(val);
      if (cleaned) return cleaned;
    }
  }

  // 3. Try nested common objects: lead.phone, customer.mobile, data.phone, contact.phone, fields.phone, Razorpay payload
  const nestedPrefixes = [
    'lead',
    'customer',
    'data',
    'contact',
    'user',
    'fields',
    'body',
    'form_data',
    'payload.payment.entity',
    'payload.order.entity',
    'payment.entity',
    'payment',
    'order',
  ];
  for (const prefix of nestedPrefixes) {
    for (const key of ['phone', 'mobile', 'whatsapp', 'phone_number', 'contact', 'number', 'notes.phone', 'notes.contact']) {
      const val = extractValueByPath(payload, `${prefix}.${key}`);
      if (val) {
        const cleaned = cleanPhone(val);
        if (cleaned) return cleaned;
      }
    }
  }

  // 4. Scan all top-level values for a valid phone number pattern
  const record = payload as Record<string, unknown>;
  for (const [, v] of Object.entries(record)) {
    if (typeof v === 'string' || typeof v === 'number') {
      const cleaned = cleanPhone(v);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

/**
 * Smart recipient name extraction for ANY external website, form, or webhook.
 */
export function findSmartName(payload: unknown, configuredPath?: string | null): string | null {
  if (!payload || typeof payload !== 'object') return null;

  // 1. Try configured path first
  if (configuredPath) {
    const val = extractValueByPath(payload, configuredPath);
    if (val && String(val).trim()) return String(val).trim();
  }

  // 2. Try common name keys
  const commonNameKeys = [
    'name',
    'full_name',
    'fullname',
    'first_name',
    'firstname',
    'customer_name',
    'customer name',
    'client_name',
    'lead_name',
    'user_name',
    'username',
    'contact_name',
    'sender_name',
  ];

  for (const key of commonNameKeys) {
    const val = extractValueByPath(payload, key);
    if (val && String(val).trim()) return String(val).trim();
  }

  // 3. Try combining first_name + last_name
  const firstName = extractValueByPath(payload, 'first_name') || extractValueByPath(payload, 'firstname');
  const lastName = extractValueByPath(payload, 'last_name') || extractValueByPath(payload, 'lastname');
  if (firstName || lastName) {
    const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (combined) return combined;
  }

  // 4. Nested prefixes
  const nestedPrefixes = [
    'lead',
    'customer',
    'data',
    'contact',
    'user',
    'fields',
    'payload.payment.entity.notes',
    'payload.payment.entity.card',
    'payload.payment.entity',
    'payload.order.entity.notes',
    'payload.order.entity',
    'payment.entity.notes',
    'payment.entity.card',
    'payment.entity',
    'payment.notes',
    'payment.card',
    'payment',
    'order',
    'card',
  ];
  for (const prefix of nestedPrefixes) {
    for (const key of ['name', 'full_name', 'first_name', 'customer_name', 'cardholder_name', 'billing_name']) {
      const val = extractValueByPath(payload, `${prefix}.${key}`);
      if (val && String(val).trim()) return String(val).trim();
    }
  }

  // 5. Direct card name fallback
  const cardName = extractValueByPath(payload, 'card.name') || extractValueByPath(payload, 'payload.payment.entity.card.name');
  if (cardName && String(cardName).trim()) {
    return String(cardName).trim();
  }

  return null;
}

/**
 * Determines if a webhook payload looks like a test ping, connection verification,
 * or healthcheck without actual lead data.
 */
export function isLikelyTestPing(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p.test === true || p.test === 'true' || p.is_test === true || p.is_test === 'true') return true;
  if (p.type === 'test' || p.type === 'ping' || p.action === 'test' || p.event === 'ping') return true;
  if (p.source === 'admin-test' || (typeof p.source === 'string' && p.source.toLowerCase().includes('test'))) return true;
  if (typeof p.lead_id === 'string' && p.lead_id.toLowerCase().startsWith('test-')) return true;
  if (typeof p.message === 'string' && p.message.toLowerCase().includes('test')) return true;
  if (typeof p.phone === 'string' && p.phone.includes('9999999999')) return true;
  if (typeof p.phone_number === 'string' && p.phone_number.includes('9999999999')) return true;
  const keys = Object.keys(p);
  if (keys.length === 0) return true;
  if (keys.every((k) => ['timestamp', 'token', 'time', 'date', 'source', 'format'].includes(k.toLowerCase()))) return true;
  return false;
}

/**
 * Extract template variables based on configured index mappings.
 * Mapping shape: { "1": "Customer Name", "2": "order.id", "3": "static:Welcome" }
 */
export function extractTemplateVariables(
  payload: unknown,
  mappings: Record<string, string> = {},
  fallbackName?: string | null
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

        // If not found by direct path, try variations or fallback to name
        if (!val && fallbackName) {
          const lower = pathOrStatic.toLowerCase().replace(/[\s\-_]/g, '');
          if (lower.includes('name') || lower.includes('customer')) {
            val = fallbackName;
          }
        }
      }
    }

    // If fallback name is provided and val is empty, apply it
    if (fallbackName && (!val || val.trim().length === 0)) {
      val = fallbackName;
    }

    // Ensure non-empty string so Meta template send never fails on missing/empty parameter
    if (!val || val.trim().length === 0) {
      val = fallbackName || 'Customer';
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

  // 2. Secret authentication:
  // If a secret is provided, it MUST match the trigger's secret_key.
  // If no secret is provided, allow it because the trigger ID (UUIDv4) is already private and unguessable.
  if (!options.isTest && providedSecret) {
    if (!safeCompareSecrets(providedSecret, typedTrigger.secret_key)) {
      // Record failed authentication log
      await supabase.from('webhook_trigger_logs').insert({
        trigger_id: typedTrigger.id,
        account_id: typedTrigger.account_id,
        status: 'failed',
        http_status: 401,
        request_payload: typeof payload === 'object' && payload !== null ? payload : {},
        mapped_variables: {},
        error_message: 'Invalid secret key provided in webhook request',
        execution_time_ms: Date.now() - startTime,
      });

      throw new IncomingWebhookError(
        'unauthorized',
        'Invalid webhook secret key. Check your secret key or omit it to use the secure webhook URL directly.',
        401
      );
    }
  }

  // 3. Active check
  if (!options.isTest && !typedTrigger.is_active) {
    throw new IncomingWebhookError(
      'trigger_inactive',
      'This webhook trigger is currently paused or inactive. Enable it in CRM Automations.',
      403
    );
  }

  // 4. Extract recipient phone with smart fallbacks
  let phone = options.overrideRecipientPhone;
  if (!phone) {
    phone = findSmartPhone(payload, typedTrigger.phone_path) || undefined;
  }

  // 5. Extract contact name with smart fallbacks
  const name =
    options.overrideRecipientName ||
    findSmartName(payload, typedTrigger.name_path) ||
    undefined;

  // 6. Extract template variables (with fallback name support for empty fields)
  const { params: templateParams, mappedValues } = extractTemplateVariables(
    payload,
    typedTrigger.variable_mappings || {},
    name
  );

  // 7. If test ping detected: verify connection without sending real message
  const isTest = isLikelyTestPing(payload) || phone === '+919999999999' || options.isTest;
  if (isTest) {
    const executionTimeMs = Date.now() - startTime;
    await supabase.from('webhook_trigger_logs').insert({
      trigger_id: typedTrigger.id,
      account_id: typedTrigger.account_id,
      status: 'success',
      http_status: 200,
      recipient_name: 'Test Ping',
      request_payload: typeof payload === 'object' && payload !== null ? payload : {},
      mapped_variables: mappedValues,
      error_message: 'Test ping verified successfully.',
      execution_time_ms: executionTimeMs,
    });

    return {
      success: true,
      messageId: 'test_ping_ok',
      whatsappMessageId: 'test_ping_ok',
      recipient: phone || 'test_ping',
      recipientName: name || 'Test Ping',
      template: typedTrigger.template_name,
      language: typedTrigger.template_language,
      mappedParams: templateParams,
      executionTimeMs,
    };
  }

  // 8. If no phone found: return phone missing error
  if (!phone) {
    const errorMsg = `Recipient phone number could not be found. Please include a phone field (e.g. "phone", "mobile", "whatsapp", or "team_whatsapp").`;
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
