import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";
import {
  getGooglePlatformCredentials,
  refreshGoogleAccessToken,
  postReviewReplyToGoogle,
} from "@/lib/google/gbp-api";

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
    const { reviewId, replyText, locationId, googleReviewId } = body;

    if (!reviewId || !replyText?.trim()) {
      return NextResponse.json({ error: "Missing reviewId or replyText" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    // 1. Find the target review row (support either UUID or google_review_id)
    let existingReview: any = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId);

    if (isUuid) {
      const { data } = await adminDb
        .from("google_business_reviews")
        .select("*")
        .eq("account_id", profile.account_id)
        .eq("id", reviewId)
        .maybeSingle();
      existingReview = data;
    }

    if (!existingReview) {
      const targetGid = googleReviewId || reviewId;
      const { data } = await adminDb
        .from("google_business_reviews")
        .select("*")
        .eq("account_id", profile.account_id)
        .eq("google_review_id", targetGid)
        .maybeSingle();
      existingReview = data;
    }

    // 2. Check if we have active Google Business Account tokens
    const { data: googleAccount } = await adminDb
      .from("google_business_accounts")
      .select("*")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    let postedToGoogle = false;
    let googleError: string | null = null;
    const resolvedLocId = locationId || existingReview?.location_id;
    const resolvedReviewId = existingReview?.google_review_id || googleReviewId || reviewId;

    if (googleAccount?.access_token) {
      let accessToken = googleAccount.access_token;
      const isExpired =
        googleAccount.token_expires_at &&
        new Date(googleAccount.token_expires_at).getTime() < Date.now() + 60000;

      if (isExpired && googleAccount.refresh_token) {
        const credentials = await getGooglePlatformCredentials();
        const refreshed = await refreshGoogleAccessToken(googleAccount.refresh_token, credentials);
        if (refreshed) {
          accessToken = refreshed.accessToken;
          const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
          await adminDb
            .from("google_business_accounts")
            .update({
              access_token: accessToken,
              token_expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", googleAccount.id);
        }
      }

      // Try posting to Google API if location is valid
      if (resolvedLocId && resolvedReviewId && !resolvedReviewId.startsWith("manual_") && !resolvedReviewId.startsWith("gmb_rev_")) {
        const gRes = await postReviewReplyToGoogle(accessToken, resolvedLocId, resolvedReviewId, replyText.trim());
        if (gRes.success) {
          postedToGoogle = true;
        } else {
          googleError = gRes.error || "Google GBP API write error";
          console.warn("[GMB Reply API] Google API response notice:", gRes.error);
        }
      }
    }

    // 3. Save reply to database
    const now = new Date().toISOString();
    let updateQuery = adminDb
      .from("google_business_reviews")
      .update({
        reply_text: replyText.trim(),
        reply_timestamp: now,
        is_replied: true,
        updated_at: now,
      })
      .eq("account_id", profile.account_id);

    if (existingReview?.id) {
      updateQuery = updateQuery.eq("id", existingReview.id);
    } else if (isUuid) {
      updateQuery = updateQuery.eq("id", reviewId);
    } else {
      updateQuery = updateQuery.eq("google_review_id", reviewId);
    }

    const { data: updatedData, error: saveErr } = await updateQuery.select().maybeSingle();

    if (saveErr) {
      console.error("[GMB Reply API] Database save error:", saveErr);
      return NextResponse.json({ error: "Failed to save reply in database: " + saveErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      postedToGoogle,
      googleError,
      review: updatedData || existingReview,
      replyText: replyText.trim(),
      replyTimestamp: now,
    });
  } catch (err: any) {
    console.error("[GMB Reply API] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
