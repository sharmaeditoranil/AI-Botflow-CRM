import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    const { data: qrConfig, error } = await adminDb
      .from("google_business_magic_qr")
      .select("id, slug, business_name, google_review_url, min_star_for_google, heading, subheading, thank_you_title, thank_you_message, qr_scans_count")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !qrConfig) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
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
