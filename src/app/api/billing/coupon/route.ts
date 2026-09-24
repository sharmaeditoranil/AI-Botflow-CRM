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
