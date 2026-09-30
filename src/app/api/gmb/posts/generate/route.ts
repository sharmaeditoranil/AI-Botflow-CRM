import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWithAdminAi } from "@/lib/ai/admin-ai";

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

    const body = await req.json();
    const {
      businessName = "Our Business",
      businessCategory = "Local Business",
      topicType = "OFFER", // 'OFFER' | 'UPDATE' | 'EVENT' | 'FESTIVAL'
      topic = "",
      offerDetails = "",
      callToAction = "LEARN_MORE", // 'CALL' | 'BOOK' | 'ORDER' | 'LEARN_MORE' | 'SIGN_UP'
      language = "hinglish", // 'english' | 'hindi' | 'hinglish'
      tone = "engaging", // 'engaging' | 'professional' | 'festive' | 'urgent'
    } = body;

    const systemPrompt = `You are a world-class Google My Business (GBP/GMB) local SEO marketing expert and copywriter.
Your goal is to write a high-converting, engaging, and localized Google Business Profile post that boosts local search visibility and drives real customer actions (calls, visits, website clicks).`;

    const userPrompt = `Create a Google Business Profile (GMB) post with the following specifications:
Business Name: ${businessName}
Business Category: ${businessCategory}
Post Type: ${topicType}
Topic / Focus: ${topic || "Special announcement & customer update"}
Special Offer / Discount: ${offerDetails || "Exclusive benefit for our customers"}
Call-to-Action (CTA): ${callToAction}
Preferred Language: ${language} (if Hinglish, write natural Indian conversational Hindi in English letters with Hindi punchlines; if Hindi, write clean Devanagari Hindi; if English, write fluent engaging English)
Tone: ${tone}

Output format: Return ONLY a valid JSON object without markdown fences, with these exact keys:
{
  "headline": "A short, catchy headline with 1 relevant emoji (max 8 words)",
  "content": "Compelling 3 to 4 paragraphs GMB post text (around 100-150 words) with emojis, clear benefits, bullet points if helpful, and strong call to action.",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"],
  "suggestedCtaText": "Short button label text like 'Call Now' or 'Book Appointment' or 'Order Online'",
  "imageIdeaPrompt": "A 1-sentence prompt describing the ideal banner image to accompany this post."
}`;

    const rawResponse = await generateWithAdminAi(userPrompt, {
      systemPrompt,
      maxTokens: 600,
    });

    // Parse JSON safely
    let cleanJson = rawResponse.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
    }

    try {
      const parsed = JSON.parse(cleanJson);
      return NextResponse.json({
        success: true,
        data: parsed,
      });
    } catch {
      // Fallback if AI returned non-json string
      return NextResponse.json({
        success: true,
        data: {
          headline: `Special Update from ${businessName}!`,
          content: rawResponse,
          hashtags: ["#GoogleBusiness", "#SpecialOffer", "#LocalBusiness"],
          suggestedCtaText: callToAction,
          imageIdeaPrompt: `Promotional banner for ${businessName} showcasing ${topic || "latest offers"}`,
        },
      });
    }
  } catch (err: any) {
    console.error("[GMB AI Post Generator API] error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate post" }, { status: 500 });
  }
}
