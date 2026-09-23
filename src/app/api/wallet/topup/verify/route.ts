import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  getRazorpayCredentials,
  verifyRazorpayPaymentSignature,
} from '@/lib/billing/razorpay';
import { creditWalletBalance } from '@/lib/billing/wallet';

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

    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      topupAmount,
      taxableAmount,
      gstAmount,
      businessName = '',
      gstNumber = '',
      billingAddress = '',
      billingState = '',
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !topupAmount) {
      return NextResponse.json({ error: 'Missing payment verification details.' }, { status: 400 });
    }

    const { keySecret } = await getRazorpayCredentials();
    if (!keySecret) {
      return NextResponse.json({ error: 'Gateway configuration error.' }, { status: 500 });
    }

    const isValid = verifyRazorpayPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      secret: keySecret,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
    }

    const creditAmount = Number(topupAmount);
    const accountId = profile.account_id;

    // 1. Credit wallet balance
    const creditResult = await creditWalletBalance({
      accountId,
      amount: creditAmount,
      referenceType: 'razorpay_recharge',
      referenceId: razorpay_payment_id,
      description: `Wallet recharge via Razorpay (${razorpay_payment_id})`,
      metadata: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        taxableAmount,
        gstAmount,
      },
    });

    if (!creditResult.success) {
      return NextResponse.json(
        { error: creditResult.error || 'Failed to update wallet balance.' },
        { status: 500 }
      );
    }

    // 2. Create GST Invoice Record
    const adminSupabase = getAdminSupabase();
    const now = new Date();
    const invoiceNumber = `WAL-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const totalPaid = (taxableAmount || creditAmount) + (gstAmount || Math.round(creditAmount * 0.18));

    try {
      await adminSupabase.from('invoices').insert({
        account_id: accountId,
        subscription_id: null,
        amount: totalPaid,
        currency: 'INR',
        status: 'paid',
        gateway_payment_id: razorpay_payment_id,
        gateway_invoice_id: razorpay_order_id,
        invoice_number: invoiceNumber,
        taxable_amount: taxableAmount || creditAmount,
        gst_rate: 18,
        gst_amount: gstAmount || Math.round(creditAmount * 0.18),
        business_name: businessName || null,
        gst_number: gstNumber || null,
        billing_address: billingAddress || null,
        billing_state: billingState || null,
      });
    } catch (invErr) {
      console.warn('[Wallet] Could not insert invoice:', invErr);
    }

    return NextResponse.json({
      success: true,
      newBalance: creditResult.newBalance,
      invoiceNumber,
      message: `₹${creditAmount.toLocaleString()} added to your wallet successfully!`,
    });
  } catch (err: any) {
    console.error('[API /api/wallet/topup/verify] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
