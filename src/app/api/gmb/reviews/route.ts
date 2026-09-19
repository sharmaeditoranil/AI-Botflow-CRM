import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";

export async function GET(req: NextRequest) {
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

    // Fetch reviews from database
    const { data: reviews, error: revError } = await adminDb
      .from("google_business_reviews")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("review_timestamp", { ascending: false });

    if (revError) {
      console.warn("[GMB Reviews] Database fetch notice:", revError.message);
    }

    return NextResponse.json({
      reviews: reviews || [],
    });
  } catch (err: any) {
    console.error("[GMB Reviews API] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
