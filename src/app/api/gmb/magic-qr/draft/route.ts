import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";
import { generateWithAdminAi } from "@/lib/ai/admin-ai";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  buildReviewPrompt,
  chooseKeywords,
  cleanDraft,
  fallbackReview,
  parseKeywords,
  pickStyle,
} from "@/lib/gmb/review-draft";

const RECENT_KEEP = 15;

/**
 * POST /api/gmb/magic-qr/draft  { slug, rating, liked?: string[] }
 *
 * Public (the Magic QR review page): a fresh review draft for a 4–5 star
 * customer, different from the business's recent drafts and mentioning
 * its own keywords. Rate-limited per visitor and per business.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = typeof body.slug === "string" ? body.slug.trim().slice(0, 80) : "";
    const rating = Math.max(1, Math.min(5, Number(body.rating) || 5));
    const liked = Array.isArray(body.liked) ? body.liked.map(String).slice(0, 5) : [];
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const ip =
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const perVisitor = checkRateLimit(`gmb-draft:ip:${ip}`, { limit: 12, windowMs: 60_000 });
    if (!perVisitor.success) return rateLimitResponse(perVisitor);
    const perBusiness = checkRateLimit(`gmb-draft:slug:${slug}`, { limit: 300, windowMs: 3_600_000 });
    if (!perBusiness.success) return rateLimitResponse(perBusiness);

    const db = getAdminSupabase();
    const { data: qr } = await db
      .from("google_business_magic_qr")
      .select("id, account_id, location_id, business_name, metadata")
      .eq("slug", slug)
      .maybeSingle();
    if (!qr) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: loc } = qr.location_id
      ? await db
          .from("google_business_locations")
          .select("primary_category, metadata")
          .eq("id", qr.location_id)
          .eq("account_id", qr.account_id)
          .maybeSingle()
      : { data: null };

    const qrMeta = (qr.metadata || {}) as Record<string, unknown>;
    const locMeta = (loc?.metadata || {}) as Record<string, unknown>;
    // Owner's keywords first, then what the Google profile says it offers.
    const keywords = parseKeywords([
      ...parseKeywords(qrMeta.keywords),
      ...parseKeywords(locMeta.services),
      ...parseKeywords(locMeta.additional_categories),
      ...(loc?.primary_category ? [loc.primary_category] : []),
    ]);
    const recent = Array.isArray(qrMeta.recent_drafts) ? (qrMeta.recent_drafts as string[]) : [];

    const input = {
      businessName: qr.business_name,
      category: loc?.primary_category ?? null,
      keywords,
      liked,
      rating,
      style: pickStyle(),
      avoid: recent,
    };
    const focus = chooseKeywords(input);

    let text = "";
    try {
      text = cleanDraft(
        await generateWithAdminAi(buildReviewPrompt(input, focus), {
          systemPrompt:
            "You draft short, natural customer reviews. Every draft must be worded differently. Never invent specific facts.",
          maxTokens: 220,
        }),
      );
    } catch (aiErr) {
      console.warn("[gmb draft] AI unavailable, using fallback:", aiErr);
    }
    if (!text || recent.includes(text)) text = fallbackReview(input, focus);

    // Remember it so the next customer's draft reads differently.
    await db
      .from("google_business_magic_qr")
      .update({ metadata: { ...qrMeta, recent_drafts: [text, ...recent].slice(0, RECENT_KEEP) } })
      .eq("id", qr.id);

    return NextResponse.json({ text, keywords });
  } catch (err) {
    console.error("[gmb draft] error:", err);
    return NextResponse.json({ error: "Could not write a draft" }, { status: 500 });
  }
}
