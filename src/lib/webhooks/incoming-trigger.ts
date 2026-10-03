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
 * Recursively flattens an arbitrary nested JSON object/array into dot-notation paths.
 * E.g. { customer: { name: "Anil" }, payment: { id: "pay_123", amount: 500 } }
 * => { "customer.name": "Anil", "payment.id": "pay_123", "payment.amount": 500 }
 */
export function flattenPayload(
  payload: unknown,
  prefix = '',
  maxDepth = 6,
  result: Record<string, unknown> = {},
  seen = new WeakSet<object>()
): Record<string, unknown> {
  if (payload === null || payload === undefined || maxDepth < 0) {
    return result;
  }

  if (typeof payload !== 'object') {
    if (prefix) result[prefix] = payload;
    return result;
  }

  // Circular reference guard
  if (seen.has(payload as object)) {
    return result;
  }
  seen.add(payload as object);

  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => {
      const arrKey = prefix ? `${prefix}.${idx}` : String(idx);
      if (typeof item === 'object' && item !== null) {
        flattenPayload(item, arrKey, maxDepth - 1, result, seen);
      } else if (item !== undefined && item !== null) {
        result[arrKey] = item;
      }
    });
    return result;
  }

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object') {
      flattenPayload(value, fullPath, maxDepth - 1, result, seen);
    } else if (value !== undefined && value !== null) {
      result[fullPath] = value;
    }
  }

  return result;
}

/**
 * Filter out sensitive, technical, or internal keys from detected fields list.
 */
export function isSensitiveFieldKey(key: string): boolean {
  const lower = key.toLowerCase();
  const sensitiveTokens = [
    'secret',
    'token',
    'password',
    'api_key',
    'apikey',
    'auth',
    'authorization',
    'bearer',
    'passcode',
    '_nonce',
    'signature',
    'hash',
  ];
  return sensitiveTokens.some((tok) => lower.includes(tok));
}

/**
 * Format a Unix timestamp (seconds or milliseconds) into Indian standard date string DD/MM/YYYY
 */
export function formatTimestampToDate(val: unknown): string {
  if (val === null || val === undefined) return '';
  const num = typeof val === 'number' ? val : Number(String(val).trim());
  if (!Number.isFinite(num) || num <= 0) return String(val || '');
  // 10 digits = seconds (e.g. 1790958356), 13 digits = ms
  const ms = num < 10000000000 ? num * 1000 : num;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Check if a payload originated from Razorpay (standard event or webhook payload)
 */
export function isRazorpayPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const rec = payload as Record<string, unknown>;
  // Razorpay standard webhook signature: entity: 'event', account_id: 'acc_...'
  if (
    rec.entity === 'event' &&
    typeof rec.account_id === 'string' &&
    rec.account_id.startsWith('acc_')
  ) {
    return true;
  }
  if (
    rec.payload &&
    typeof rec.payload === 'object' &&
    ('payment' in (rec.payload as Record<string, unknown>) || 'order' in (rec.payload as Record<string, unknown>))
  ) {
    const p = rec.payload as Record<string, any>;
    if (p.payment?.entity || p.order?.entity) {
      return true;
    }
  }
  return false;
}

/**
 * Detects and formats all available variable fields from an incoming webhook payload.
 * Returns clean dot-notation field keys sorted with high-priority keys first.
 */
export function detectWebhookFields(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const flattened = flattenPayload(payload);
  const rawKeys = Object.keys(flattened).filter((k) => !isSensitiveFieldKey(k) && k.trim().length > 0);

  // High priority clean aliases
  const friendlyKeys = [
    'name',
    'amount',
    'course',
    'title',
    'order.id',
    'payment.id',
    'date',
    'phone',
    'email',
    'created_at',
  ];

  // Also include simplified suffix keys for deeply nested paths
  const suffixKeys: string[] = [];
  for (const k of rawKeys) {
    const parts = k.split('.');
    if (parts.length > 1) {
      const leaf = parts[parts.length - 1];
      if (leaf && !suffixKeys.includes(leaf) && !isSensitiveFieldKey(leaf)) {
        suffixKeys.push(leaf);
      }
      if (parts.length > 2) {
        const lastTwo = `${parts[parts.length - 2]}.${leaf}`;
        if (!suffixKeys.includes(lastTwo) && !isSensitiveFieldKey(lastTwo)) {
          suffixKeys.push(lastTwo);
        }
      }
    }
  }

  const allKeys = Array.from(new Set([...friendlyKeys, ...suffixKeys, ...rawKeys]));

  const priorityOrder = [
    'name',
    'amount',
    'course',
    'title',
    'order.id',
    'order_id',
    'payment.id',
    'payment_id',
    'date',
    'phone',
    'email',
    'created_at',
    'status',
    'message',
    'city',
  ];

  return allKeys.sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.toLowerCase());
    const bIdx = priorityOrder.indexOf(b.toLowerCase());
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
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
 * a path string like "customer.phone", "order.recipient.mobile", "webhook.name", etc.
 * Supports dot notation, array indices, bracket notation, flattened objects,
 * suffix matching across nested keys, and optional "webhook." or "{{webhook. ... }}" prefixes.
 */
export function extractValueByPath(payload: unknown, path: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const rawClean = (path || '').trim();
  if (!rawClean) return null;

  // Normalize: remove {{ and }} if wrapped
  let cleanPath = rawClean;
  if (cleanPath.startsWith('{{') && cleanPath.endsWith('}}')) {
    cleanPath = cleanPath.slice(2, -2).trim();
  }

  // If path starts with webhook., strip it
  if (cleanPath.startsWith('webhook.')) {
    cleanPath = cleanPath.slice(8).trim();
  }
  if (!cleanPath) return null;

  const record = payload as Record<string, unknown>;

  // Check direct property match on root (supports flattened keys like "payment.id" or "webhook.payment.id")
  if (cleanPath in record && record[cleanPath] !== undefined && record[cleanPath] !== null) {
    const val = record[cleanPath];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.length > 0) return trimmed;
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
  }

  // Also check if cleanPath with "webhook." prefix exists in record
  const webhookKey = `webhook.${cleanPath}`;
  if (webhookKey in record && record[webhookKey] !== undefined && record[webhookKey] !== null) {
    const val = record[webhookKey];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.length > 0) return trimmed;
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
  }

  // Tokenize and drill down for nested objects
  const tokens = tokenizePath(cleanPath);
  let tokenDrillResult: unknown = null;
  if (tokens.length > 0) {
    let current: unknown = payload;
    let drillFailed = false;
    for (let i = 0; i < tokens.length; i++) {
      if (current === null || current === undefined || typeof current !== 'object') {
        drillFailed = true;
        break;
      }
      const token = tokens[i];
      const isLast = i === tokens.length - 1;
      const curRecord = current as Record<string, unknown>;

      if (token in curRecord) {
        current = curRecord[token];
      } else if (isLast) {
        const lowerToken = token.toLowerCase();
        const matchedKey = Object.keys(curRecord).find(
          (k) => k.toLowerCase() === lowerToken
        );
        if (matchedKey !== undefined) {
          current = curRecord[matchedKey];
        } else {
          drillFailed = true;
          break;
        }
      } else {
        drillFailed = true;
        break;
      }
    }
    if (!drillFailed && current !== null && current !== undefined && typeof current !== 'object') {
      tokenDrillResult = current;
    }
  }

  const isRzp = isRazorpayPayload(payload);

  if (tokenDrillResult !== null && tokenDrillResult !== undefined) {
    if (typeof tokenDrillResult === 'string') {
      const trimmed = tokenDrillResult.trim();
      if (trimmed.length > 0) return trimmed;
    } else if (typeof tokenDrillResult === 'number') {
      if (isRzp && (cleanPath.endsWith('amount') || cleanPath === 'amount') && tokenDrillResult >= 100) {
        const rupees = tokenDrillResult / 100;
        return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
      }
      return String(tokenDrillResult);
    } else if (typeof tokenDrillResult === 'boolean') {
      return String(tokenDrillResult);
    }
  }

  // Suffix, alias, and leaf matching across flattened payload keys
  const flattened = flattenPayload(payload);
  const flatEntries = Object.entries(flattened);
  if (flatEntries.length === 0) return null;

  const lowerPath = cleanPath.toLowerCase();
  const underPath = lowerPath.replace(/\./g, '_');
  const dotPath = lowerPath.replace(/_/g, '.');

  // Helper to extract formatted scalar from a flattened entry
  const formatEntryValue = (val: unknown, key: string): string | null => {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    if (!str) return null;

    // Razorpay amount conversion: paise -> rupees
    if (
      isRzp &&
      typeof val === 'number' &&
      (key.endsWith('.amount') || key === 'amount' || key.endsWith('.base_amount')) &&
      val >= 100
    ) {
      const rupees = val / 100;
      return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
    }

    // Unix timestamp conversion for date keys
    if (
      (lowerPath === 'date' || lowerPath === 'payment_date' || lowerPath === 'datetime') &&
      typeof val === 'number' &&
      val > 1000000000 &&
      val < 2500000000
    ) {
      return formatTimestampToDate(val);
    }

    return str;
  };

  // 1. Direct exact or case-insensitive match on flattened keys
  for (const [k, v] of flatEntries) {
    const kLower = k.toLowerCase();
    if (kLower === lowerPath || kLower === underPath || kLower === dotPath) {
      const res = formatEntryValue(v, k);
      if (res) return res;
    }
  }

  // 2. Suffix match: key ends with `.${lowerPath}` or `.${underPath}` or `.${dotPath}`
  // e.g. "payload.payment.entity.amount" ends with ".amount"
  // e.g. "payload.payment.entity.order_id" ends with ".order_id" (matching "order.id")
  for (const [k, v] of flatEntries) {
    const kLower = k.toLowerCase();
    if (
      kLower.endsWith(`.${lowerPath}`) ||
      kLower.endsWith(`.${underPath}`) ||
      kLower.endsWith(`.${dotPath}`)
    ) {
      const res = formatEntryValue(v, k);
      if (res) return res;
    }
  }

  // 3. Semantic keyword matching
  // A) Amount
  if (lowerPath === 'amount' || lowerPath === 'total' || lowerPath === 'price') {
    for (const [k, v] of flatEntries) {
      const kLower = k.toLowerCase();
      if (kLower.endsWith('.amount') || kLower.endsWith('.base_amount') || kLower.endsWith('.total')) {
        const res = formatEntryValue(v, k);
        if (res) return res;
      }
    }
  }

  // B) Order ID
  if (lowerPath === 'order.id' || lowerPath === 'order_id' || lowerPath === 'orderid') {
    for (const [k, v] of flatEntries) {
      const kLower = k.toLowerCase();
      if (kLower.endsWith('.order_id') || kLower.endsWith('.order.id') || kLower.endsWith('.orderid')) {
        const res = formatEntryValue(v, k);
        if (res) return res;
      }
    }
  }

  // C) Payment ID / Transaction ID
  if (
    lowerPath === 'payment.id' ||
    lowerPath === 'payment_id' ||
    lowerPath === 'transaction_id' ||
    lowerPath === 'txid' ||
    lowerPath === 'tx_id' ||
    lowerPath === 'transaction'
  ) {
    for (const [k, v] of flatEntries) {
      const kLower = k.toLowerCase();
      if (
        kLower.endsWith('.payment.entity.id') ||
        kLower.endsWith('.payment.id') ||
        kLower.endsWith('.payment_id') ||
        kLower.endsWith('.transaction_id') ||
        kLower.endsWith('.acquirer_data.rrn')
      ) {
        const res = formatEntryValue(v, k);
        if (res) return res;
      }
    }
  }

  // D) Course / Title / Product
  if (
    lowerPath === 'course' ||
    lowerPath === 'title' ||
    lowerPath === 'product' ||
    lowerPath === 'service'
  ) {
    for (const [k, v] of flatEntries) {
      const kLower = k.toLowerCase();
      if (
        kLower.endsWith('.notes.title') ||
        kLower.endsWith('.notes.course') ||
        kLower.endsWith('.title') ||
        kLower.endsWith('.course') ||
        kLower.endsWith('.description') ||
        kLower.endsWith('.item_name')
      ) {
        const res = formatEntryValue(v, k);
        if (res) return res;
      }
    }
  }

  // E) Student / Name
  if (lowerPath === 'student' || lowerPath === 'customer' || lowerPath === 'name' || lowerPath === 'customer.name') {
    for (const [k, v] of flatEntries) {
      const kLower = k.toLowerCase();
      if (
        kLower.endsWith('.notes.student') ||
        kLower.endsWith('.student') ||
        kLower.endsWith('.customer_name') ||
        kLower.endsWith('.full_name')
      ) {
        const res = formatEntryValue(v, k);
        if (res) return res;
      }
    }
  }

  // F) Date / Created At
  if (lowerPath === 'date' || lowerPath === 'payment_date' || lowerPath === 'created_at') {
    for (const [k, v] of flatEntries) {
      const kLower = k.toLowerCase();
      if (kLower.endsWith('.created_at') || kLower === 'created_at' || kLower.endsWith('.date')) {
        const res = formatEntryValue(v, k);
        if (res) return res;
      }
    }
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
 * Smart service/product/requirement extraction from incoming webhook or form payload.
 */
export function findSmartService(payload: unknown, configuredPath?: string | null): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (configuredPath) {
    const val = extractValueByPath(payload, configuredPath);
    if (val && String(val).trim()) return String(val).trim();
  }

  const commonKeys = [
    'service',
    'services',
    'service_name',
    'servicename',
    'service_type',
    'servicetype',
    'service_required',
    'service_requested',
    'service_needed',
    'interested_in',
    'interestedin',
    'interest',
    'requirement',
    'requirements',
    'product',
    'product_name',
    'productname',
    'product_service',
    'course',
    'course_name',
    'coursename',
    'program',
    'package',
    'package_name',
    'plan',
    'plan_name',
    'subject',
    'category',
    'inquiry_type',
    'treatment',
    'specialty',
    'item_name',
    'item',
  ];

  for (const key of commonKeys) {
    const val = extractValueByPath(payload, key);
    if (val && String(val).trim()) return String(val).trim();
  }

  const nestedPrefixes = [
    'lead',
    'customer',
    'data',
    'contact',
    'user',
    'fields',
    'form_fields',
    'body',
    'form_data',
    'notes',
  ];
  for (const prefix of nestedPrefixes) {
    for (const key of ['service', 'service_name', 'product', 'requirement', 'course', 'package', 'plan', 'category']) {
      const val = extractValueByPath(payload, `${prefix}.${key}`);
      if (val && String(val).trim()) return String(val).trim();
    }
  }

  return null;
}

/**
 * Smart city/location extraction from incoming webhook or form payload.
 */
export function findSmartCity(payload: unknown, configuredPath?: string | null): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (configuredPath) {
    const val = extractValueByPath(payload, configuredPath);
    if (val && String(val).trim()) return String(val).trim();
  }

  const commonKeys = [
    'city',
    'city_name',
    'cityname',
    'town',
    'location',
    'location_name',
    'address',
    'city_town',
    'district',
    'state',
    'place',
    'area',
    'region',
    'billing_city',
    'shipping_city',
    'user_city',
  ];

  for (const key of commonKeys) {
    const val = extractValueByPath(payload, key);
    if (val && String(val).trim()) return String(val).trim();
  }

  const nestedPrefixes = [
    'lead',
    'customer',
    'data',
    'contact',
    'user',
    'fields',
    'form_fields',
    'body',
    'form_data',
    'notes',
  ];
  for (const prefix of nestedPrefixes) {
    for (const key of ['city', 'location', 'town', 'address', 'state', 'district', 'area']) {
      const val = extractValueByPath(payload, `${prefix}.${key}`);
      if (val && String(val).trim()) return String(val).trim();
    }
  }

  return null;
}

/**
 * Smart message / extra comments extraction from incoming webhook or form payload.
 */
export function findSmartMessage(payload: unknown, configuredPath?: string | null): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (configuredPath) {
    const val = extractValueByPath(payload, configuredPath);
    if (val && String(val).trim()) return String(val).trim();
  }

  const commonKeys = [
    'extra_message',
    'extramessage',
    'extra_msg',
    'message',
    'notes',
    'note',
    'msg',
    'comment',
    'comments',
    'remark',
    'remarks',
    'description',
    'details',
    'query',
    'inquiry',
    'inquiry_details',
    'feedback',
    'requirement_details',
    'user_message',
    'customer_message',
    'client_message',
  ];

  for (const key of commonKeys) {
    const val = extractValueByPath(payload, key);
    if (val && String(val).trim()) return String(val).trim();
  }

  const nestedPrefixes = [
    'lead',
    'customer',
    'data',
    'contact',
    'user',
    'fields',
    'form_fields',
    'body',
    'form_data',
    'notes',
  ];
  for (const prefix of nestedPrefixes) {
    for (const key of ['extra_message', 'message', 'notes', 'comments', 'remark', 'query', 'description']) {
      const val = extractValueByPath(payload, `${prefix}.${key}`);
      if (val && String(val).trim()) return String(val).trim();
    }
  }

  return null;
}

/**
 * Smart email extraction from incoming webhook or form payload.
 */
export function findSmartEmail(payload: unknown, configuredPath?: string | null): string | null {
  if (!payload || typeof payload !== 'object') return null;

  if (configuredPath) {
    const val = extractValueByPath(payload, configuredPath);
    if (val && String(val).trim()) return String(val).trim();
  }

  const commonKeys = [
    'email',
    'e-mail',
    'email_address',
    'emailaddress',
    'user_email',
    'customer_email',
    'lead_email',
    'billing_email',
  ];
  for (const key of commonKeys) {
    const val = extractValueByPath(payload, key);
    if (val && String(val).trim()) return String(val).trim();
  }

  const nestedPrefixes = [
    'lead',
    'customer',
    'data',
    'contact',
    'user',
    'fields',
    'form_fields',
    'body',
    'form_data',
  ];
  for (const prefix of nestedPrefixes) {
    for (const key of ['email', 'email_address']) {
      const val = extractValueByPath(payload, `${prefix}.${key}`);
      if (val && String(val).trim()) return String(val).trim();
    }
  }

  return null;
}

/**
 * Collect all relevant lead form fields as human-readable key-value pairs,
 * ignoring internal technical tokens (secret, token, api_key, etc.).
 */
export function extractLeadSummary(payload: unknown): {
  service: string | null;
  city: string | null;
  message: string | null;
  email: string | null;
  extraFields: Record<string, string>;
  formattedNote: string;
} {
  if (!payload || typeof payload !== 'object') {
    return {
      service: null,
      city: null,
      message: null,
      email: null,
      extraFields: {},
      formattedNote: '',
    };
  }

  const p = payload as Record<string, unknown>;
  const service = findSmartService(p);
  const city = findSmartCity(p);
  const message = findSmartMessage(p);
  const email = findSmartEmail(p);

  const ignoredKeys = new Set([
    'secret',
    'token',
    'api_key',
    'apikey',
    'auth',
    'authorization',
    'account_id',
    'automation_id',
    'id',
    'user_id',
    'pipeline_id',
    'stage_id',
    'is_active',
    'trigger_type',
    'format',
    'pretty',
    'password',
    '_nonce',
    'action',
    'form_id',
    'lead_summary',
    'name',
    'full_name',
    'fullname',
    'first_name',
    'firstname',
    'last_name',
    'lastname',
    'phone',
    'mobile',
    'contact',
    'whatsapp',
    'vars',
  ]);

  const lines: string[] = [];
  if (service) lines.push(`• Service: ${service}`);
  if (city) lines.push(`• City: ${city}`);
  if (message) lines.push(`• Extra Message: ${message}`);
  if (email) lines.push(`• Email: ${email}`);

  const extraFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(p)) {
    const lKey = key.toLowerCase();
    if (ignoredKeys.has(lKey)) continue;

    // Skip if already captured in service, city, message, email
    if (service && (lKey === 'service' || lKey === 'service_name' || lKey === 'services' || lKey === 'product' || lKey === 'requirement')) continue;
    if (city && (lKey === 'city' || lKey === 'location' || lKey === 'town' || lKey === 'address')) continue;
    if (message && (lKey === 'message' || lKey === 'extra_message' || lKey === 'notes' || lKey === 'comments' || lKey === 'query' || lKey === 'msg')) continue;
    if (email && (lKey === 'email' || lKey === 'e-mail' || lKey === 'email_address')) continue;

    if (typeof value === 'string' && value.trim()) {
      extraFields[key] = value.trim();
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`• ${label}: ${value.trim()}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      extraFields[key] = String(value);
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`• ${label}: ${value}`);
    }
  }

  return {
    service,
    city,
    message,
    email,
    extraFields,
    formattedNote: lines.join('\n'),
  };
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
