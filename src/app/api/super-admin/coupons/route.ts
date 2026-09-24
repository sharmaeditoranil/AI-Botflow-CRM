import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Check if current user is super admin
async function checkSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, isSuperAdmin: false };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('user_id', user.id)
    .maybeSingle();

  return { user, isSuperAdmin: !!profile?.is_super_admin };
}

// GET /api/super-admin/coupons - List all coupons
export async function GET() {
  try {
    const { isSuperAdmin } = await checkSuperAdmin();
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Super-admin access required.' }, { status: 403 });
    }

    const admin = getAdminSupabase();
    const { data: coupons, error } = await admin
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ coupons: coupons || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch coupons' }, { status: 500 });
  }
}

// POST /api/super-admin/coupons - Create a new coupon
export async function POST(req: NextRequest) {
  try {
    const { isSuperAdmin } = await checkSuperAdmin();
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Super-admin access required.' }, { status: 403 });
    }

    const body = await req.json();
    let { code, discount_type = 'percentage', discount_value, max_redemptions, expires_at, is_active = true } = body;

    code = (code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code || code.length < 3) {
      return NextResponse.json({ error: 'Coupon code must be at least 3 characters (alphanumeric).' }, { status: 400 });
    }

    const numValue = Number(discount_value);
    if (isNaN(numValue) || numValue <= 0) {
      return NextResponse.json({ error: 'Discount value must be greater than 0.' }, { status: 400 });
    }

    if (discount_type === 'percentage' && numValue > 100) {
      return NextResponse.json({ error: 'Percentage discount cannot exceed 100%.' }, { status: 400 });
    }

    const maxUses = max_redemptions ? parseInt(max_redemptions, 10) : null;
    const expiry = expires_at ? new Date(expires_at).toISOString() : null;

    const admin = getAdminSupabase();

    // Check if code already exists
    const { data: existing } = await admin
      .from('coupons')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `Coupon code "${code}" already exists.` }, { status: 400 });
    }

    const { data: newCoupon, error: insertError } = await admin
      .from('coupons')
      .insert({
        code,
        discount_type,
        discount_value: numValue,
        max_redemptions: maxUses,
        redemptions_count: 0,
        expires_at: expiry,
        is_active: Boolean(is_active),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      coupon: newCoupon,
      message: `Coupon "${code}" created successfully!`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create coupon' }, { status: 500 });
  }
}
