import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGooglePlatformCredentials } from "@/lib/google/gbp-api";

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
      return NextResponse.json({ error: "No active account found" }, { status: 400 });
    }

    const { clientId, clientSecret } = await getGooglePlatformCredentials();
    if (!clientId || !clientSecret) {
      return NextResponse.json({
        configured: false,
        error: "Google Client ID and Secret are not configured in Super Admin platform settings.",
      });
    }

    const requestedRedirectUri = req.nextUrl.searchParams.get("redirectUri");
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    const computedOrigin =
      forwardedHost && !forwardedHost.includes("0.0.0.0") && !forwardedHost.includes("127.0.0.1")
        ? `${forwardedProto}://${forwardedHost}`
        : (process.env.NEXT_PUBLIC_SITE_URL || "https://dash.aibotflow.in");

    const redirectUri = requestedRedirectUri || `${computedOrigin}/api/google/oauth/callback`;
    const encodedRedirectUri = Buffer.from(redirectUri).toString("base64url");
    const state = `${profile.account_id}:${user.id}:${encodedRedirectUri}`;

    const scope = [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" ");

    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", scope);
    oauthUrl.searchParams.set("access_type", "offline");
    oauthUrl.searchParams.set("prompt", "consent select_account");
    oauthUrl.searchParams.set("include_granted_scopes", "true");
    oauthUrl.searchParams.set("state", state);

    return NextResponse.json({
      configured: true,
      url: oauthUrl.toString(),
    });
  } catch (err: any) {
    console.error("[Google OAuth URL] error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate Google auth URL" }, { status: 500 });
  }
}
