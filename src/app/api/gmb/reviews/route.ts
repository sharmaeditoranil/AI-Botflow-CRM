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
    const { data: dbReviews, error: revError } = await adminDb
      .from("google_business_reviews")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("review_timestamp", { ascending: false });

    let reviews = dbReviews;

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

export async function DELETE(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const reviewId = searchParams.get("id");
    const clearDummy = searchParams.get("clearDummy") === "true";
    const clearAll = searchParams.get("clearAll") === "true";

    const adminDb = getAdminSupabase();

    if (clearDummy) {
      // Delete any test/dummy reviews seeded previously
      await adminDb
        .from("google_business_reviews")
        .delete()
        .eq("account_id", profile.account_id)
        .like("google_review_id", "gmb_rev_%");

      return NextResponse.json({ success: true, message: "Cleared dummy seed reviews" });
    }

    if (clearAll) {
      await adminDb
        .from("google_business_reviews")
        .delete()
        .eq("account_id", profile.account_id);

      return NextResponse.json({ success: true, message: "Cleared all reviews" });
    }

    if (reviewId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId);
      let query = adminDb
        .from("google_business_reviews")
        .delete()
        .eq("account_id", profile.account_id);

      if (isUuid) {
        query = query.eq("id", reviewId);
      } else {
        query = query.eq("google_review_id", reviewId);
      }

      await query;
      return NextResponse.json({ success: true, message: "Review deleted" });
    }

    return NextResponse.json({ error: "Missing parameter" }, { status: 400 });
  } catch (err: any) {
    console.error("[GMB Reviews DELETE] error:", err);
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
    const { reviewer_name, star_rating, comment, location_id } = body;

    if (!reviewer_name?.trim() || !comment?.trim()) {
      return NextResponse.json(
        { error: "Reviewer name and comment are required" },
        { status: 400 }
      );
    }

    const adminDb = getAdminSupabase();

    let locUuid = location_id || null;
    if (!locUuid || locUuid === "loc_manual") {
      const { data: loc } = await adminDb
        .from("google_business_locations")
        .select("id")
        .eq("account_id", profile.account_id)
        .limit(1)
        .maybeSingle();
      locUuid = loc?.id || null;
    }

    const newReview = {
      account_id: profile.account_id,
      location_id: locUuid,
      google_review_id: `manual_rev_${Date.now()}`,
      reviewer_name: reviewer_name.trim(),
      reviewer_photo_url: null,
      star_rating: Number(star_rating) || 5,
      comment: comment.trim(),
      reply_text: null,
      review_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: insErr } = await adminDb
      .from("google_business_reviews")
      .insert(newReview)
      .select()
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, review: inserted });
  } catch (err: any) {
    console.error("[GMB Reviews API POST] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
