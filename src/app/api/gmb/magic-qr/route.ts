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

    // 1. Check existing Magic QR configuration
    const { data: qrConfig, error: qrErr } = await adminDb
      .from("google_business_magic_qr")
      .select("*")
      .eq("account_id", profile.account_id)
      .maybeSingle();

    // 2. Fetch active business location
    const { data: locations } = await adminDb
      .from("google_business_locations")
      .select("*")
      .eq("account_id", profile.account_id);

    const activeLoc =
      locations?.find((l) => (l.metadata as any)?.is_active) ||
      locations?.[0] ||
      null;

    // 3. Fetch negative feedback list
    const { data: feedbacks } = await adminDb
      .from("google_business_feedbacks")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("created_at", { ascending: false })
      .limit(50);

    const defaultBizName = activeLoc?.location_name || "My Business";
    const defaultSlug = defaultBizName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30) || `biz-${profile.account_id.slice(0, 6)}`;

    const isGoogleReviewUrl = (url?: string | null) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return (
        lower.includes("google.com") ||
        lower.includes("g.page") ||
        lower.includes("goo.gl") ||
        lower.includes("maps.app")
      );
    };

    const buildGoogleMapsReviewUrl = (name: string, placeId?: string | null) => {
      if (placeId && !placeId.startsWith("loc_") && !placeId.startsWith("locations/")) {
        return `https://search.google.com/local/writereview?placeid=${placeId}`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    };

    let effectiveConfig = qrConfig;

    // If no config saved yet, auto-persist sensible defaults to DB so public slug works immediately
    if (!effectiveConfig) {
      const initialPayload = {
        account_id: profile.account_id,
        location_id: activeLoc?.id || null,
        business_name: defaultBizName,
        slug: defaultSlug,
        google_review_url: buildGoogleMapsReviewUrl(defaultBizName, activeLoc?.location_id),
        place_id: activeLoc?.location_id || "",
        min_star_for_google: 4,
        whatsapp_alert_number: activeLoc?.phone || "",
        heading: "Rate Your Experience with " + defaultBizName,
        subheading: "Your honest feedback helps us serve you better.",
        thank_you_title: "Thank you for your valuable feedback!",
        thank_you_message: "Our team will review your feedback and get back to you shortly if needed.",
        qr_scans_count: 0,
        positive_redirects_count: 0,
        negative_feedbacks_count: feedbacks?.length || 0,
        is_active: true,
      };

      try {
        const { data: created } = await adminDb
          .from("google_business_magic_qr")
          .upsert(initialPayload, { onConflict: "account_id,slug" })
          .select()
          .maybeSingle();

        effectiveConfig = created || initialPayload;
      } catch {
        effectiveConfig = initialPayload;
      }
    } else if (!isGoogleReviewUrl(effectiveConfig.google_review_url)) {
      // Fix existing record if it was pointing to an external website
      const correctedGoogleUrl = buildGoogleMapsReviewUrl(
        effectiveConfig.business_name || defaultBizName,
        effectiveConfig.place_id || activeLoc?.location_id
      );
      effectiveConfig = {
        ...effectiveConfig,
        google_review_url: correctedGoogleUrl,
      };

      // Update in background
      adminDb
        .from("google_business_magic_qr")
        .update({ google_review_url: correctedGoogleUrl, updated_at: new Date().toISOString() })
        .eq("id", effectiveConfig.id)
        .then(() => {});
    }

    return NextResponse.json({
      config: effectiveConfig,
      locations: locations || [],
      feedbacks: feedbacks || [],
    });
  } catch (err: any) {
    console.error("[GMB Magic QR GET] error:", err);
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
      business_name,
      slug,
      google_review_url,
      place_id,
      min_star_for_google = 4,
      whatsapp_alert_number,
      heading,
      subheading,
      thank_you_title,
      thank_you_message,
    } = body;

    if (!business_name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "Business name and slug are required" }, { status: 400 });
    }

    const sanitizedSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");

    const adminDb = getAdminSupabase();

    const payload = {
      account_id: profile.account_id,
      business_name: business_name.trim(),
      slug: sanitizedSlug,
      google_review_url: google_review_url?.trim() || "",
      place_id: place_id?.trim() || "",
      min_star_for_google: Number(min_star_for_google) || 4,
      whatsapp_alert_number: whatsapp_alert_number?.trim() || "",
      heading: heading?.trim() || "How was your experience with us?",
      subheading: subheading?.trim() || "Your feedback helps us continuously improve.",
      thank_you_title: thank_you_title?.trim() || "Thank you for your feedback!",
      thank_you_message: thank_you_message?.trim() || "We truly value your input.",
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upsertErr } = await adminDb
      .from("google_business_magic_qr")
      .upsert(payload, { onConflict: "account_id,slug" })
      .select()
      .single();

    if (upsertErr) {
      // Check if slug collision with another account
      if (upsertErr.message.includes("unique") || upsertErr.message.includes("slug")) {
        return NextResponse.json(
          { error: "This URL slug is already taken. Please choose a slightly different slug." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: saved,
      message: "Magic QR configuration saved successfully!",
    });
  } catch (err: any) {
    console.error("[GMB Magic QR POST] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
