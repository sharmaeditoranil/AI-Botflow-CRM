import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";
import { fetchGoogleBusinessAccounts, fetchGoogleBusinessReviews } from "@/lib/google/gbp-api";

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
      .select("*")
      .eq("account_id", profile.account_id);

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    // Find target location by internal UUID or Google location_id
    const target = (locations || []).find(
      (loc) => loc.id === locationId || loc.location_id === locationId
    );

    if (!target) {
      return NextResponse.json({ error: "Selected business profile not found" }, { status: 404 });
    }

    // Set target location active, all other locations inactive
    for (const loc of locations || []) {
      const isTarget = loc.id === target.id;
      await adminDb
        .from("google_business_locations")
        .update({
          metadata: { ...(loc.metadata || {}), is_active: isTarget },
          updated_at: new Date().toISOString(),
        })
        .eq("id", loc.id);
    }

    // Synchronize Magic QR with the selected profile
    const targetPlaceId =
      target.metadata?.placeId ||
      (target.location_id?.startsWith("ChIJ") ? target.location_id : null);

    const targetReviewUrl =
      target.metadata?.newReviewUri ||
      (targetPlaceId ? `https://search.google.com/local/writereview?placeid=${targetPlaceId}` : null) ||
      target.metadata?.mapsUri ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        target.location_name + " " + (target.address || "")
      )}`;

    const { data: existingQr } = await adminDb
      .from("google_business_magic_qr")
      .select("id")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    if (existingQr) {
      await adminDb
        .from("google_business_magic_qr")
        .update({
          business_name: target.location_name,
          location_id: target.id,
          place_id: targetPlaceId || target.location_id,
          google_review_url: targetReviewUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingQr.id);
    }

    // Auto-sync reviews for this newly selected profile
    try {
      const { data: gAccount } = await adminDb
        .from("google_business_accounts")
        .select("*")
        .eq("account_id", profile.account_id)
        .maybeSingle();

      if (gAccount?.access_token && target.location_id) {
        const gAccounts = await fetchGoogleBusinessAccounts(gAccount.access_token);
        const accountName = gAccounts?.[0]?.name;
        if (accountName) {
          const reviews = await fetchGoogleBusinessReviews(
            gAccount.access_token,
            target.location_id,
            accountName
          );

          if (reviews && reviews.length > 0) {
            const starMap: Record<string, number> = {
              FIVE: 5,
              FOUR: 4,
              THREE: 3,
              TWO: 2,
              ONE: 1,
            };

            for (const rev of reviews) {
              const ratingNum = starMap[rev.starRating] || 5;
              await adminDb.from("google_business_reviews").upsert(
                {
                  account_id: profile.account_id,
                  location_id: target.id,
                  google_review_id: rev.reviewId || `rev_${Date.now()}`,
                  reviewer_name: rev.reviewer?.displayName || "Google User",
                  reviewer_photo_url: rev.reviewer?.profilePhotoUrl || null,
                  star_rating: ratingNum,
                  comment: rev.comment || "",
                  reply_text: rev.reviewReply?.comment || null,
                  reply_timestamp: rev.reviewReply?.updateTime || null,
                  is_replied: !!rev.reviewReply?.comment,
                  sentiment: ratingNum >= 4 ? "positive" : ratingNum === 3 ? "neutral" : "negative",
                  review_timestamp: rev.createTime || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "account_id,google_review_id" }
              );
            }
          }
        }
      }
    } catch (syncErr) {
      console.warn("[GMB Select Location] Non-fatal review sync error:", syncErr);
    }

    return NextResponse.json({
      success: true,
      activeLocationId: target.id,
      location: { ...target, metadata: { ...(target.metadata || {}), is_active: true } },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

