import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRazorpayCredentials } from '@/lib/billing/razorpay';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { amount, description, customerName, customerPhone } = body;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Valid amount is required' }, { status: 400 });
    }

    const { keyId, keySecret } = await getRazorpayCredentials();

    if (keyId && keySecret) {
      try {
        const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/payment_links', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: Math.round(Number(amount) * 100),
            currency: 'INR',
            description: description || 'Payment Request',
            customer: {
              name: customerName || 'Customer',
              contact: customerPhone || undefined,
            },
            notify: {
              sms: false,
              email: false,
            },
            reminder_enable: true,
          }),
        });

        if (rzpRes.ok) {
          const rzpData = await rzpRes.json();
          return NextResponse.json({
            paymentLink: rzpData.short_url,
            id: rzpData.id,
            amount: Number(amount),
            description,
          });
        }
      } catch (e) {
        console.warn('Razorpay payment link creation fallback:', e);
      }
    }

    // Fallback: Generate a standard UPI payment URI or checkout link
    const sanitizedPhone = (customerPhone || '').replace(/\D/g, '');
    const upiLink = `upi://pay?pa=payments@aibotflow&pn=Aibotflow&am=${amount}&cu=INR&tn=${encodeURIComponent(description || 'Payment')}`;
    const webPayLink = `https://dash.aibotflow.in/pay?amt=${amount}&desc=${encodeURIComponent(description || 'Payment')}`;

    return NextResponse.json({
      paymentLink: webPayLink,
      upiLink,
      amount: Number(amount),
      description,
    });
  } catch (err: any) {
    console.error('Create payment link error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
