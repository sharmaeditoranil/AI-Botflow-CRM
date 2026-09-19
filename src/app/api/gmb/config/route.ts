import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";
import { getGooglePlatformCredentials } from "@/lib/google/gbp-api";

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

    const credentials = await getGooglePlatformCredentials();
    const googleAppConfigured = !!(credentials.clientId && credentials.clientSecret);

    const adminDb = getAdminSupabase();

    // Check connected Google account
    const { data: googleAccount } = await adminDb
      .from("google_business_accounts")
      .select("id, email, token_expires_at, updated_at")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    // Check connected locations
    let { data: locations } = await adminDb
      .from("google_business_locations")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("created_at", { ascending: true });

    // If Google account is connected but 0 profiles exist yet, auto-seed the 3 profiles
    if (googleAccount && (!locations || locations.length === 0)) {
      const defaultProfiles = [
        {
          account_id: profile.account_id,
          google_account_id: googleAccount.id,
          location_id: `gmb_loc_1_${Date.now()}`,
          location_name: "Quick Art Photography Academy",
          primary_category: "Photography Studio & Academy",
          phone: "+91 99398 00780",
          address: "Main Market, Bihar / Jharkhand",
          website: "https://quickartphotography.in",
          status: "active",
          is_verified: true,
          metadata: { is_active: true },
        },
        {
          account_id: profile.account_id,
          google_account_id: googleAccount.id,
          location_id: `gmb_loc_2_${Date.now() + 1}`,
          location_name: "Sharma Photo Studio & Color Lab",
          primary_category: "Photo Lab & Digital Studio",
          phone: "+91 99398 00780",
          address: "Station Road, Main Market",
          website: "https://quickartphotography.in",
          status: "active",
          is_verified: true,
          metadata: { is_active: false },
        },
        {
          account_id: profile.account_id,
          google_account_id: googleAccount.id,
          location_id: `gmb_loc_3_${Date.now() + 2}`,
          location_name: "Sharma Digital Print & Press",
          primary_category: "Digital Printing & Photo Album Design",
          phone: "+91 99398 00780",
          address: "Commercial Complex",
          website: "https://quickartphotography.in",
          status: "active",
          is_verified: true,
          metadata: { is_active: false },
        },
      ];

      const { data: seeded } = await adminDb
        .from("google_business_locations")
        .insert(defaultProfiles)
        .select("*");

      if (seeded && seeded.length > 0) {
        locations = seeded;
      }
    }

    const activeLocation =
      locations?.find((l) => (l.metadata as any)?.is_active) ||
      locations?.[0] ||
      null;

    return NextResponse.json({
      googleAppConfigured,
      connected: !!googleAccount,
      account: googleAccount || null,
      locations: locations || [],
      activeLocation,
    });
  } catch (err: any) {
    console.error("[GMB Config API] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
