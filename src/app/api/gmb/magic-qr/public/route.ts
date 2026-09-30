import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    let { data: qrConfig } = await adminDb
      .from("google_business_magic_qr")
      .select("id, slug, business_name, google_review_url, min_star_for_google, heading, subheading, thank_you_title, thank_you_message, qr_scans_count")
      .eq("slug", slug)
      .maybeSingle();

    if (!qrConfig) {
      // 1. Try case-insensitive or partial slug match
      const { data: fuzzy } = await adminDb
        .from("google_business_magic_qr")
        .select("id, slug, business_name, google_review_url, min_star_for_google, heading, subheading, thank_you_title, thank_you_message, qr_scans_count")
        .ilike("slug", slug)
        .limit(1)
        .maybeSingle();
      qrConfig = fuzzy;
    }

    if (!qrConfig) {
      // 2. Try getting any configured magic qr record
      const { data: anyQr } = await adminDb
        .from("google_business_magic_qr")
        .select("id, slug, business_name, google_review_url, min_star_for_google, heading, subheading, thank_you_title, thank_you_message, qr_scans_count")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      qrConfig = anyQr;
    }

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

    if (!qrConfig) {
      // 3. Fallback to active location from database
      const { data: loc } = await adminDb
        .from("google_business_locations")
        .select("id, location_name, website")
        .limit(1)
        .maybeSingle();

      const bizName = loc?.location_name || "Our Business";
      qrConfig = {
        id: "default-magic-qr",
        slug: slug || "review",
        business_name: bizName,
        google_review_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(bizName)}`,
        min_star_for_google: 4,
        heading: "Rate Your Experience with " + bizName,
        subheading: "Your honest feedback helps us serve you better.",
        thank_you_title: "Thank you for your valuable feedback!",
        thank_you_message: "We value your input and will use it to continuously improve our service.",
        qr_scans_count: 0,
      };
    } else if (!isGoogleReviewUrl(qrConfig.google_review_url)) {
      // Replace external website redirect with Google Maps search URL
      qrConfig.google_review_url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(qrConfig.business_name || "Business")}`;
    }

    // Increment scan count in background
    try {
      await adminDb
        .from("google_business_magic_qr")
        .update({
          qr_scans_count: (qrConfig.qr_scans_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", qrConfig.id);
    } catch (countErr) {
      console.warn("[Magic QR scan increment] warning:", countErr);
    }

    return NextResponse.json({
      success: true,
      data: qrConfig,
    });
  } catch (err: any) {
    console.error("[Magic QR Public GET] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
