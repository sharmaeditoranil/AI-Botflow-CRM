import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  getRazorpayCredentials,
  verifyRazorpayPaymentSignature,
} from '@/lib/billing/razorpay';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.account_id) {
    return NextResponse.json({ error: 'No account associated with user.' }, { status: 400 });
  }

  const body = await req.json();
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planId,
    billingCycle = 'monthly',
    amount,
  } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !planId) {
    return NextResponse.json({ error: 'Missing required payment verification parameters.' }, { status: 400 });
  }

  const { keySecret } = await getRazorpayCredentials();

  if (!keySecret) {
    return NextResponse.json({ error: 'Gateway configuration error.' }, { status: 500 });
  }

  // Verify signature
  const isValid = verifyRazorpayPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    secret: keySecret,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
  }

  const adminSupabase = getAdminSupabase();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + (billingCycle === 'yearly' ? 365 : 30));

  // 1. Update account
  await adminSupabase
    .from('accounts')
    .update({
      plan_id: planId,
      subscription_status: 'active',
      current_period_end: periodEnd.toISOString(),
      trial_ends_at: null,
      gateway_subscription_id: razorpay_payment_id,
    })
    .eq('id', profile.account_id);

  // 2. Record subscription
  const { data: sub } = await adminSupabase
    .from('subscriptions')
    .insert({
      account_id: profile.account_id,
      plan_id: planId,
      gateway: 'razorpay',
      gateway_subscription_id: razorpay_payment_id,
      status: 'active',
      billing_cycle: billingCycle,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .select('id')
    .single();

  // 3. Create invoice record
  await adminSupabase.from('invoices').insert({
    account_id: profile.account_id,
    subscription_id: sub?.id || null,
    amount: amount ? amount / 100 : 0,
    currency: 'INR',
    status: 'paid',
    gateway_payment_id: razorpay_payment_id,
    gateway_invoice_id: razorpay_order_id,
  });

  return NextResponse.json({
    success: true,
    message: 'Payment verified and plan activated successfully!',
  });
}
