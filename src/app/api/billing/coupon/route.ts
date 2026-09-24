import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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

    const body = await req.json();
    const code = (body.code || '').trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: 'Please enter a coupon code.' }, { status: 400 });
    }

    const adminSupabase = getAdminSupabase();
    const { data: coupon, error } = await adminSupabase
      .from('coupons')
      .select('id, code, discount_type, discount_value, expires_at, max_redemptions, redemptions_count')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !coupon) {
      return NextResponse.json({ error: 'Invalid or inactive coupon code.' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const accountId = profile?.account_id;

    if (accountId) {
      // 1. Check coupon_redemptions table
      try {
        const { data: directRedemption } = await adminSupabase
          .from('coupon_redemptions')
          .select('id')
          .eq('coupon_id', coupon.id)
          .eq('account_id', accountId)
          .limit(1)
          .maybeSingle();

        if (directRedemption) {
          return NextResponse.json(
            { error: 'You have already redeemed this coupon code once on your account.' },
            { status: 400 }
          );
        }
      } catch {
        // Fallback to audit_logs check below
      }

      // 2. Check audit_logs for coupon_redeemed
      const { data: auditRedemption } = await adminSupabase
        .from('audit_logs')
        .select('id')
        .eq('action', 'coupon_redeemed')
        .eq('target_id', coupon.id)
        .contains('details', { account_id: accountId })
        .limit(1)
        .maybeSingle();

      if (auditRedemption) {
        return NextResponse.json(
          { error: 'You have already redeemed this coupon code once on your account.' },
          { status: 400 }
        );
      }
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This coupon code has expired.' }, { status: 400 });
    }

    if (coupon.max_redemptions && coupon.redemptions_count >= coupon.max_redemptions) {
      return NextResponse.json({ error: 'This coupon has reached its maximum usage limit.' }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      description:
        coupon.discount_type === 'percentage'
          ? `${coupon.discount_value}% OFF`
          : `₹${coupon.discount_value} OFF`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error validating coupon.' }, { status: 500 });
  }
}
