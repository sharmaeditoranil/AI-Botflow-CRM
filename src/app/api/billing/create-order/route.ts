import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createRazorpayOrder, getRazorpayCredentials } from '@/lib/billing/razorpay';

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
    .select('account_id, account_role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.account_id) {
    return NextResponse.json({ error: 'No account associated with user.' }, { status: 400 });
  }

  if (profile.account_role !== 'owner' && profile.account_role !== 'admin') {
    return NextResponse.json({ error: 'Only owners or admins can manage billing.' }, { status: 403 });
  }

  const body = await req.json();
  const { planId, billingCycle = 'monthly', couponCode } = body;

  if (!planId) {
    return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 });
  }

  const adminSupabase = getAdminSupabase();

  // Get plan details
  const { data: plan, error: planError } = await adminSupabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (planError || !plan) {
    return NextResponse.json({ error: 'Invalid plan selected.' }, { status: 400 });
  }

  let price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

  // Apply coupon if valid
  let discountAmount = 0;
  if (couponCode) {
    const { data: coupon } = await adminSupabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

    if (coupon) {
      const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
      const isExhausted = coupon.max_redemptions && coupon.redemptions_count >= coupon.max_redemptions;
      if (!isExpired && !isExhausted) {
        if (coupon.discount_type === 'percentage') {
          discountAmount = Math.round(price * (coupon.discount_value / 100));
        } else {
          discountAmount = Math.min(price, Math.round(coupon.discount_value));
        }
        price = Math.max(0, price - discountAmount);
      }
    }
  }

  // Calculate 18% GST
  const taxableAmount = price;
  const gstRate = 18;
  const gstAmount = Math.round(taxableAmount * (gstRate / 100));
  const totalAmount = taxableAmount + gstAmount;

  // If price is 0 (e.g. Trial or full coupon), activate immediately without Razorpay
  if (totalAmount <= 0) {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + (billingCycle === 'yearly' ? 365 : 30));

    await adminSupabase.from('accounts').update({
      plan_id: plan.id,
      subscription_status: 'active',
      current_period_end: periodEnd.toISOString(),
    }).eq('id', profile.account_id);

    return NextResponse.json({
      freeActivation: true,
      message: 'Plan activated successfully.',
    });
  }

  const { gstNumber = '', businessName = '', billingAddress = '', billingState = '' } = body;

  const { keyId } = await getRazorpayCredentials();

  // Razorpay takes amounts in paise (1 INR = 100 paise)
  const amountInPaise = Math.round(totalAmount * 100);

  const orderRes = await createRazorpayOrder({
    amount: amountInPaise,
    currency: 'INR',
    receipt: `rcpt_${profile.account_id.slice(0, 8)}_${Date.now().toString().slice(-4)}`,
    notes: {
      accountId: profile.account_id,
      userId: user.id,
      planId: plan.id,
      billingCycle,
      taxableAmount: taxableAmount.toString(),
      gstAmount: gstAmount.toString(),
      totalAmount: totalAmount.toString(),
      gstNumber: gstNumber.slice(0, 20),
      businessName: businessName.slice(0, 100),
      billingAddress: billingAddress.slice(0, 200),
      billingState: billingState.slice(0, 50),
      couponCode: couponCode ? couponCode.toUpperCase().slice(0, 30) : '',
      discountAmount: discountAmount.toString(),
    },
  });

  if ('error' in orderRes) {
    return NextResponse.json({ error: orderRes.error }, { status: 500 });
  }

  return NextResponse.json({
    orderId: orderRes.id,
    amount: orderRes.amount,
    currency: orderRes.currency,
    keyId,
    planName: plan.name,
    userEmail: user.email,
    taxableAmount,
    gstAmount,
    totalAmount,
    discountAmount,
    couponCode: couponCode ? couponCode.toUpperCase() : null,
  });
}
