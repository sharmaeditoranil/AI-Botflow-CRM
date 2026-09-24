import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

// PATCH /api/super-admin/coupons/[id] - Toggle active or update coupon
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { isSuperAdmin } = await checkSuperAdmin();
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Super-admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const updateData: Record<string, any> = {};

    if (typeof body.is_active === 'boolean') updateData.is_active = body.is_active;
    if (body.discount_type) updateData.discount_type = body.discount_type;
    if (body.discount_value !== undefined) updateData.discount_value = Number(body.discount_value);
    if (body.max_redemptions !== undefined) {
      updateData.max_redemptions = body.max_redemptions ? parseInt(body.max_redemptions, 10) : null;
    }
    if (body.expires_at !== undefined) {
      updateData.expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;
    }

    const admin = getAdminSupabase();
    const { data: updated, error } = await admin
      .from('coupons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, coupon: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update coupon' }, { status: 500 });
  }
}

// DELETE /api/super-admin/coupons/[id] - Delete a coupon
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { isSuperAdmin } = await checkSuperAdmin();
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden: Super-admin access required.' }, { status: 403 });
    }

    const { id } = await params;
    const admin = getAdminSupabase();
    const { error } = await admin.from('coupons').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Coupon deleted.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete coupon' }, { status: 500 });
  }
}
