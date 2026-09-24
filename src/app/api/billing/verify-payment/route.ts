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

  const {
    businessName = '',
    gstNumber = '',
    billingAddress = '',
    billingState = '',
    taxableAmount,
    gstAmount,
    gstRate = 18,
    couponCode = '',
  } = body;

  const totalPaid = amount ? amount / 100 : 0;
  const calculatedTaxable = taxableAmount !== undefined ? taxableAmount : Math.round((totalPaid / 1.18) * 100) / 100;
  const calculatedGst = gstAmount !== undefined ? gstAmount : Math.round((totalPaid - calculatedTaxable) * 100) / 100;

  const invoiceNumber = `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

  // If a coupon code was used, increment redemptions_count
  if (couponCode && typeof couponCode === 'string') {
    try {
      const { data: cp } = await adminSupabase
        .from('coupons')
        .select('id, redemptions_count')
        .eq('code', couponCode.trim().toUpperCase())
        .maybeSingle();

      if (cp) {
        await adminSupabase
          .from('coupons')
          .update({ redemptions_count: (cp.redemptions_count || 0) + 1 })
          .eq('id', cp.id);
      }
    } catch (cpErr) {
      console.warn('Could not increment coupon redemptions:', cpErr);
    }
  }

  // 1. Update account (including GST details if provided)
  const accountUpdate: Record<string, any> = {
    plan_id: planId,
    subscription_status: 'active',
    current_period_end: periodEnd.toISOString(),
    trial_ends_at: null,
    gateway_subscription_id: razorpay_payment_id,
  };

  if (businessName) accountUpdate.business_name = businessName;
  if (gstNumber) accountUpdate.gst_number = gstNumber;
  if (billingAddress) accountUpdate.billing_address = billingAddress;
  if (billingState) accountUpdate.billing_state = billingState;

  await adminSupabase
    .from('accounts')
    .update(accountUpdate)
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

  // 3. Create invoice record with full GST details
  const invoiceData: Record<string, any> = {
    account_id: profile.account_id,
    subscription_id: sub?.id || null,
    amount: totalPaid,
    currency: 'INR',
    status: 'paid',
    gateway_payment_id: razorpay_payment_id,
    gateway_invoice_id: razorpay_order_id,
    invoice_number: invoiceNumber,
    taxable_amount: calculatedTaxable,
    gst_rate: gstRate,
    gst_amount: calculatedGst,
    business_name: businessName || null,
    gst_number: gstNumber || null,
    billing_address: billingAddress || null,
    billing_state: billingState || null,
  };

  // Safe insert in case columns are not yet migrated
  try {
    await adminSupabase.from('invoices').insert(invoiceData);
  } catch (invErr) {
    console.warn('Fallback invoice insert without extended columns:', invErr);
    await adminSupabase.from('invoices').insert({
      account_id: profile.account_id,
      subscription_id: sub?.id || null,
      amount: totalPaid,
      currency: 'INR',
      status: 'paid',
      gateway_payment_id: razorpay_payment_id,
      gateway_invoice_id: razorpay_order_id,
    });
  }

  return NextResponse.json({
    success: true,
    invoiceNumber,
    message: 'Payment verified and plan activated successfully!',
  });
}
