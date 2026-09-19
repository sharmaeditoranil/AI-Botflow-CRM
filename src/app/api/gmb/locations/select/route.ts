import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";

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
    const { locationId } = body;

    if (!locationId) {
      return NextResponse.json({ error: "Missing locationId" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    const { data: locations, error: listErr } = await adminDb
      .from("google_business_locations")
      .select("id, metadata")
      .eq("account_id", profile.account_id);

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    // Set target location active, others inactive
    for (const loc of locations || []) {
      const isTarget = loc.id === locationId;
      await adminDb
        .from("google_business_locations")
        .update({
          metadata: { ...(loc.metadata || {}), is_active: isTarget },
          updated_at: new Date().toISOString(),
        })
        .eq("id", loc.id);
    }

    return NextResponse.json({ success: true, activeLocationId: locationId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
