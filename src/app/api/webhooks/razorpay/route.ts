import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  getRazorpayCredentials,
  verifyRazorpayWebhookSignature,
} from '@/lib/billing/razorpay';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
  }

  const rawBody = await req.text();
  const { webhookSecret } = await getRazorpayCredentials();

  if (webhookSecret) {
    const isValid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('[Razorpay Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventType = event.event;
  const payload = event.payload;
  const adminSupabase = getAdminSupabase();

  console.log(`[Razorpay Webhook] Processing event: ${eventType}`);

  // Handle payment captured or subscription charged
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const payment = payload.payment?.entity;
    const notes = payment?.notes || {};
    const accountId = notes.accountId;
    const planId = notes.planId;
    const billingCycle = notes.billingCycle || 'monthly';

    if (accountId && planId) {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + (billingCycle === 'yearly' ? 365 : 30));

      await adminSupabase
        .from('accounts')
        .update({
          plan_id: planId,
          subscription_status: 'active',
          current_period_end: periodEnd.toISOString(),
          is_suspended: false,
        })
        .eq('id', accountId);

      await adminSupabase.from('invoices').insert({
        account_id: accountId,
        amount: (payment.amount || 0) / 100,
        currency: payment.currency || 'INR',
        status: 'paid',
        gateway_payment_id: payment.id,
        gateway_invoice_id: payment.order_id,
      });
    }
  } else if (eventType === 'payment.failed') {
    const payment = payload.payment?.entity;
    const notes = payment?.notes || {};
    const accountId = notes.accountId;

    if (accountId) {
      await adminSupabase.from('invoices').insert({
        account_id: accountId,
        amount: (payment.amount || 0) / 100,
        currency: payment.currency || 'INR',
        status: 'failed',
        gateway_payment_id: payment.id,
        gateway_invoice_id: payment.order_id,
      });
    }
  }

  return NextResponse.json({ received: true });
}
