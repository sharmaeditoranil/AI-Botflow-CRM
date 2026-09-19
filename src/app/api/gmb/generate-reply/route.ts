import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { reviewerName, rating, reviewText, tone = "friendly" } = body;

    if (!reviewerName || !reviewText) {
      return NextResponse.json({ error: "Missing reviewer name or review text" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured in server environment" }, { status: 500 });
    }

    const toneInstructions =
      tone === "grateful"
        ? "Express deep, genuine gratitude and highlight how honored we are to support their business."
        : tone === "professional"
        ? "Maintain an executive, polished, and courteous business tone acknowledging their feedback."
        : "Be warm, friendly, appreciative, and welcoming with a modern conversational SaaS voice.";

    const prompt = `You are the lead customer experience manager for Aibotflow CRM (official WhatsApp CRM, AI agents & marketing automation platform).
Write a single concise, authentic, and high-impact Google Maps review reply to this customer review.

Reviewer: ${reviewerName}
Rating: ${rating} out of 5 stars
Customer Review: "${reviewText}"
Tone instruction: ${toneInstructions}

Rules:
- Respond in the same language as the customer review (if English, reply in English; if Hindi/Hinglish, reply in warm polite Hindi/Hinglish).
- Keep the response between 2 to 4 sentences.
- Do NOT include quotes, placeholders, or multiple options. Output ONLY the ready-to-publish response text.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[GMB Gemini Generate Reply] Error from Gemini API:", errText);
      return NextResponse.json({ error: "Failed to generate reply from Google Gemini" }, { status: 500 });
    }

    const data = await res.json();
    const generatedText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return NextResponse.json({
      success: true,
      reply: generatedText,
      model: "gemini-2.5-flash",
    });
  } catch (err: any) {
    console.error("[GMB Gemini Generate Reply] Exception:", err);
    return NextResponse.json({ error: err.message || "Failed to generate reply" }, { status: 500 });
  }
}
