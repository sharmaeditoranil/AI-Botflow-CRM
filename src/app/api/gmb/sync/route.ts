import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";
import {
  getGooglePlatformCredentials,
  refreshGoogleAccessToken,
  fetchGoogleBusinessAccounts,
  fetchGoogleBusinessLocations,
  fetchGoogleBusinessReviews,
} from "@/lib/google/gbp-api";

export async function POST() {
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

    // 1. Get Google account linked to this tenant
    const { data: gAccount, error: accErr } = await adminDb
      .from("google_business_accounts")
      .select("*")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    if (accErr || !gAccount) {
      return NextResponse.json(
        { error: "No Google account connected. Please connect with Google first." },
        { status: 400 }
      );
    }

    // 2. Check if access token needs refreshing
    let accessToken = gAccount.access_token;
    const expiresAt = gAccount.token_expires_at ? new Date(gAccount.token_expires_at).getTime() : 0;
    const isExpired = Date.now() > expiresAt - 60000; // 1 min buffer

    if (isExpired && gAccount.refresh_token) {
      const credentials = await getGooglePlatformCredentials();
      const refreshed = await refreshGoogleAccessToken(gAccount.refresh_token, credentials);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        const newExpiry = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
        await adminDb
          .from("google_business_accounts")
          .update({
            access_token: accessToken,
            token_expires_at: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", gAccount.id);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "Access token unavailable. Please reconnect Google account." },
        { status: 400 }
      );
    }

    // 3. Query Google Business API
    const gAccounts = await fetchGoogleBusinessAccounts(accessToken);

    if (!gAccounts || gAccounts.length === 0) {
      return NextResponse.json({
        success: false,
        pendingApproval: true,
        message:
          "Google Business Profile API access application is currently pending with Google. Once Google grants approval for your project, this sync will automatically import all 3 profiles and customer reviews.",
      });
    }

    let syncedLocationsCount = 0;
    let syncedReviewsCount = 0;

    for (const gAcc of gAccounts) {
      const locations = await fetchGoogleBusinessLocations(accessToken, gAcc.name);
      if (locations && locations.length > 0) {
        for (const loc of locations) {
          const locPayload = {
            account_id: profile.account_id,
            google_account_id: gAccount.id,
            location_id: loc.name || `loc_${Date.now()}`,
            location_name: loc.title || "Business Location",
            address: loc.storefrontAddress?.addressLines?.join(", ") || "",
            phone: loc.phoneNumbers?.primaryPhone || "",
            website: loc.websiteUri || "",
            primary_category: loc.categories?.primaryCategory?.displayName || "",
            status: "active",
            is_verified: true,
            updated_at: new Date().toISOString(),
          };

          const { data: savedLoc } = await adminDb
            .from("google_business_locations")
            .upsert(locPayload, { onConflict: "account_id,location_id" })
            .select()
            .single();

          syncedLocationsCount++;

          // Fetch reviews for this location
          if (loc.name) {
            const reviews = await fetchGoogleBusinessReviews(accessToken, loc.name);
            if (reviews && reviews.length > 0) {
              for (const rev of reviews) {
                const starMap: Record<string, number> = {
                  FIVE: 5,
                  FOUR: 4,
                  THREE: 3,
                  TWO: 2,
                  ONE: 1,
                };
                const ratingNum = starMap[rev.starRating] || 5;

                await adminDb
                  .from("google_business_reviews")
                  .upsert(
                    {
                      account_id: profile.account_id,
                      location_id: savedLoc?.id || loc.name,
                      review_id: rev.reviewId || `rev_${Date.now()}`,
                      reviewer_name: rev.reviewer?.displayName || "Google User",
                      reviewer_photo_url: rev.reviewer?.profilePhotoUrl || null,
                      star_rating: ratingNum,
                      comment: rev.comment || "",
                      review_reply: rev.reviewReply?.comment || null,
                      reply_timestamp: rev.reviewReply?.updateTime || null,
                      review_timestamp: rev.createTime || new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    { onConflict: "account_id,review_id" }
                  );
                syncedReviewsCount++;
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      pendingApproval: false,
      locationsSynced: syncedLocationsCount,
      reviewsSynced: syncedReviewsCount,
      message: `Successfully synced ${syncedLocationsCount} profiles and ${syncedReviewsCount} reviews from Google!`,
    });
  } catch (err: any) {
    console.error("[GMB Sync API] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
