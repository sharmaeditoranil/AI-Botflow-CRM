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
    const { reviewId, replyText, locationId } = body;

    if (!reviewId || !replyText?.trim()) {
      return NextResponse.json({ error: "Missing reviewId or replyText" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    // Check if we have active Google Business Account tokens
    const { data: googleAccount } = await adminDb
      .from("google_business_accounts")
      .select("*")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    let postedToGoogle = false;

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
      if (locationId) {
        const gRes = await postReviewReplyToGoogle(accessToken, locationId, reviewId, replyText);
        if (gRes.success) {
          postedToGoogle = true;
        } else {
          console.warn("[GMB Reply API] Google API response notice:", gRes.error);
        }
      }
    }

    // Save reply to database
    const now = new Date().toISOString();
    await adminDb
      .from("google_business_reviews")
      .update({
        reply_text: replyText,
        reply_timestamp: now,
        is_replied: true,
        updated_at: now,
      })
      .eq("account_id", profile.account_id)
      .eq("google_review_id", reviewId);

    return NextResponse.json({
      success: true,
      postedToGoogle,
      replyText,
      replyTimestamp: now,
    });
  } catch (err: any) {
    console.error("[GMB Reply API] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
