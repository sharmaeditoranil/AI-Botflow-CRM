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

    // Query posts from table
    const { data: posts, error } = await adminDb
      .from("google_business_posts")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("created_at", { ascending: false });

    if (error) {
      // Table might not exist yet if migration pending, return empty gracefully
      console.warn("[GMB Posts API] error fetching posts:", error.message);
      return NextResponse.json({ posts: [] });
    }

    return NextResponse.json({ posts: posts || [] });
  } catch (err: any) {
    console.error("[GMB Posts GET] error:", err);
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
      locationId = null,
      topicType = "STANDARD",
      summary = "",
      content = "",
      callToActionType = "NONE",
      callToActionUrl = "",
      mediaUrl = null,
      scheduledAt = null,
      publishImmediately = false,
    } = body;

    if (!content.trim()) {
      return NextResponse.json({ error: "Post content cannot be empty" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();
    const now = new Date().toISOString();
    const status = publishImmediately ? "published" : scheduledAt ? "scheduled" : "draft";

    const payload = {
      account_id: profile.account_id,
      location_id: locationId || null,
      topic_type: topicType,
      summary: summary.trim() || null,
      content: content.trim(),
      call_to_action_type: callToActionType,
      call_to_action_url: callToActionUrl?.trim() || null,
      media_url: mediaUrl || null,
      status,
      scheduled_at: scheduledAt || null,
      published_at: publishImmediately ? now : null,
      metadata: {
        created_by_user_id: user.id,
      },
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error: insErr } = await adminDb
      .from("google_business_posts")
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      console.error("[GMB Posts POST] Database insert error:", insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      post: inserted,
      message: publishImmediately
        ? "Post published successfully!"
        : scheduledAt
        ? `Post scheduled for ${new Date(scheduledAt).toLocaleString()}`
        : "Post saved as draft",
    });
  } catch (err: any) {
    console.error("[GMB Posts POST] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const postId = searchParams.get("id");

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();
    const { error: delErr } = await adminDb
      .from("google_business_posts")
      .delete()
      .eq("account_id", profile.account_id)
      .eq("id", postId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Post deleted" });
  } catch (err: any) {
    console.error("[GMB Posts DELETE] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const { id, action, scheduledAt, content } = body;

    if (!id) {
      return NextResponse.json({ error: "Post ID required" }, { status: 400 });
    }

    const adminDb = getAdminSupabase();
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };

    if (action === "publish_now") {
      updates.status = "published";
      updates.published_at = now;
    } else if (action === "reschedule" && scheduledAt) {
      updates.status = "scheduled";
      updates.scheduled_at = scheduledAt;
    }

    if (content !== undefined) {
      updates.content = content.trim();
    }

    const { data: updated, error: updErr } = await adminDb
      .from("google_business_posts")
      .update(updates)
      .eq("account_id", profile.account_id)
      .eq("id", id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, post: updated });
  } catch (err: any) {
    console.error("[GMB Posts PATCH] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
