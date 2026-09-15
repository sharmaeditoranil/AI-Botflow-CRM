import crypto from 'crypto';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getRazorpayCredentials(): Promise<{
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
}> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from('platform_settings')
    .select('razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret')
    .eq('id', 'default')
    .maybeSingle();

  return {
    keyId: data?.razorpay_key_id || process.env.RAZORPAY_KEY_ID || null,
    keySecret: data?.razorpay_key_secret || process.env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: data?.razorpay_webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET || null,
  };
}

/**
 * Creates a Razorpay payment order via REST API.
 */
export async function createRazorpayOrder(params: {
  amount: number; // in smallest currency unit (paise for INR)
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string } | { error: string }> {
  const { keyId, keySecret } = await getRazorpayCredentials();

  if (!keyId || !keySecret) {
    return { error: 'Razorpay payment gateway is not configured. Please add keys in Super-Admin.' };
  }

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(params.amount),
        currency: params.currency || 'INR',
        receipt: params.receipt,
        notes: params.notes || {},
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[Razorpay] Order creation failed:', data);
      return { error: data.error?.description || 'Failed to create payment order.' };
    }

    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
    };
  } catch (err: any) {
    console.error('[Razorpay] Network error:', err);
    return { error: err.message || 'Payment service unreachable.' };
  }
}

/**
 * Verifies Razorpay client payment signature using HMAC SHA256.
 */
export function verifyRazorpayPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  const generatedSignature = crypto
    .createHmac('sha256', params.secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  return generatedSignature === params.signature;
}

/**
 * Verifies Razorpay webhook event signature.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  return expectedSignature === signature;
}
