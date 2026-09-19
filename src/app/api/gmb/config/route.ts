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
    const { data: locations } = await adminDb
      .from("google_business_locations")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("created_at", { ascending: false });

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
