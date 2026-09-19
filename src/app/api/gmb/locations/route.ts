import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No active account" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    const { data: locations, error: locError } = await adminDb
      .from("google_business_locations")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("created_at", { ascending: false });

    if (locError) {
      return NextResponse.json({ error: locError.message }, { status: 500 });
    }

    return NextResponse.json({ locations: locations || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No active account" }, { status: 400 });
    }

    const body = await req.json();
    const {
      id,
      location_name,
      address,
      phone,
      website,
      primary_category,
      is_active = true,
    } = body;

    if (!location_name?.trim()) {
      return NextResponse.json(
        { error: "Business/Location name is required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminSupabase();

    // Get linked Google Account
    const { data: gAccount } = await adminDb
      .from("google_business_accounts")
      .select("id")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    const locationId = id || `loc_${Date.now()}`;

    // If this profile should be active, set other profiles to inactive
    if (is_active) {
      const { data: existingLocs } = await adminDb
        .from("google_business_locations")
        .select("id, metadata")
        .eq("account_id", profile.account_id);

      if (existingLocs && existingLocs.length > 0) {
        for (const loc of existingLocs) {
          if (loc.id !== id) {
            await adminDb
              .from("google_business_locations")
              .update({
                metadata: { ...(loc.metadata || {}), is_active: false },
                updated_at: new Date().toISOString(),
              })
              .eq("id", loc.id);
          }
        }
      }
    }

    const payload = {
      account_id: profile.account_id,
      google_account_id: gAccount?.id || null,
      location_id: locationId,
      location_name: location_name.trim(),
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      primary_category: primary_category?.trim() || null,
      is_verified: true,
      status: "active",
      metadata: { is_active: !!is_active },
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      result = await adminDb
        .from("google_business_locations")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await adminDb
        .from("google_business_locations")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, location: result.data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
