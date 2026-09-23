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
  try {
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
    const topupAmount = Number(body.amount);

    if (!topupAmount || isNaN(topupAmount) || topupAmount < 100) {
      return NextResponse.json({ error: 'Minimum recharge amount is ₹100.' }, { status: 400 });
    }

    if (topupAmount > 100000) {
      return NextResponse.json({ error: 'Maximum recharge amount is ₹1,00,000 per order.' }, { status: 400 });
    }

    const { gstNumber = '', businessName = '', billingAddress = '', billingState = '' } = body;

    // 18% GST calculation on recharge
    const taxableAmount = topupAmount;
    const gstRate = 18;
    const gstAmount = Math.round(taxableAmount * (gstRate / 100));
    const totalPayable = taxableAmount + gstAmount;

    const { keyId } = await getRazorpayCredentials();
    if (!keyId) {
      return NextResponse.json(
        { error: 'Razorpay gateway is not configured. Please add keys in Super-Admin.' },
        { status: 500 }
      );
    }

    // Razorpay amount in paise
    const amountInPaise = Math.round(totalPayable * 100);

    const orderRes = await createRazorpayOrder({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `wtop_${profile.account_id.slice(0, 8)}_${Date.now().toString().slice(-4)}`,
      notes: {
        accountId: profile.account_id,
        userId: user.id,
        purpose: 'wallet_topup',
        topupAmount: topupAmount.toString(),
        taxableAmount: taxableAmount.toString(),
        gstAmount: gstAmount.toString(),
        totalPayable: totalPayable.toString(),
        gstNumber: (gstNumber || '').slice(0, 20),
        businessName: (businessName || '').slice(0, 100),
        billingAddress: (billingAddress || '').slice(0, 200),
        billingState: (billingState || '').slice(0, 50),
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
      topupAmount,
      taxableAmount,
      gstAmount,
      totalPayable,
      userEmail: user.email,
    });
  } catch (err: any) {
    console.error('[API /api/wallet/topup/order] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
