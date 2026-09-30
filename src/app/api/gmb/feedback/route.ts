import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      slug,
      starRating,
      feedbackText,
      customerName,
      customerPhone,
      customerEmail,
    } = body;

    if (!slug) {
      return NextResponse.json({ error: "Missing business slug" }, { status: 400 });
    }

    if (!feedbackText?.trim()) {
      return NextResponse.json({ error: "Please enter your feedback" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();

    // 1. Look up the Magic QR business by slug
    const { data: qrConfig, error: qrErr } = await adminDb
      .from("google_business_magic_qr")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (qrErr || !qrConfig) {
      return NextResponse.json({ error: "Business review link not found" }, { status: 404 });
    }

    // 2. Insert private feedback
    const feedbackPayload = {
      account_id: qrConfig.account_id,
      magic_qr_id: qrConfig.id,
      customer_name: customerName?.trim() || "Anonymous Customer",
      customer_phone: customerPhone?.trim() || null,
      customer_email: customerEmail?.trim() || null,
      star_rating: Number(starRating) || 3,
      feedback_text: feedbackText.trim(),
      status: "new",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: savedFeedback, error: fbErr } = await adminDb
      .from("google_business_feedbacks")
      .insert(feedbackPayload)
      .select()
      .single();

    if (fbErr) {
      console.error("[GMB Feedback POST] insert error:", fbErr);
    }

    // 3. Increment negative_feedbacks_count on Magic QR
    await adminDb
      .from("google_business_magic_qr")
      .update({
        negative_feedbacks_count: (qrConfig.negative_feedbacks_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", qrConfig.id);

    return NextResponse.json({
      success: true,
      message: "Thank you for sharing your feedback with us directly.",
    });
  } catch (err: any) {
    console.error("[GMB Feedback API] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET for dashboard feedback management (status update, delete, etc.)
export async function PATCH(req: NextRequest) {
  try {
    const adminDb = getAdminSupabase();
    const body = await req.json();
    const { feedbackId, status, resolutionNotes } = body;

    if (!feedbackId) {
      return NextResponse.json({ error: "Missing feedbackId" }, { status: 400 });
    }

    const { data: updated, error } = await adminDb
      .from("google_business_feedbacks")
      .update({
        status: status || "resolved",
        resolution_notes: resolutionNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", feedbackId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedback: updated });
  } catch (err: any) {
    console.error("[GMB Feedback PATCH] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
