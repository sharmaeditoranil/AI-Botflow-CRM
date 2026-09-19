import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/auth/super-admin";
import {
  getGooglePlatformCredentials,
  fetchGoogleBusinessAccounts,
  fetchGoogleBusinessLocations,
} from "@/lib/google/gbp-api";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://dash.aibotflow.in";

  if (error) {
    console.error("[Google OAuth Callback] Error from Google:", error, errorDescription);
    return NextResponse.redirect(`${fallbackOrigin}/gmb?error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${fallbackOrigin}/gmb?error=missing_code_or_state`);
  }

  // Parse state: `${accountId}:${userId}:${encodedRedirectUri}`
  const parts = state.split(":");
  if (parts.length < 2) {
    return NextResponse.redirect(`${fallbackOrigin}/gmb?error=invalid_state`);
  }

  const accountId = parts[0];
  const userId = parts[1];
  let decodedRedirectUri: string | null = null;
  if (parts.length >= 3 && parts[2]) {
    try {
      decodedRedirectUri = Buffer.from(parts[2], "base64url").toString("utf8");
    } catch {
      decodedRedirectUri = null;
    }
  }

  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const computedOrigin =
    forwardedHost && !forwardedHost.includes("0.0.0.0") && !forwardedHost.includes("127.0.0.1")
      ? `${forwardedProto}://${forwardedHost}`
      : fallbackOrigin;

  const finalRedirectUri = decodedRedirectUri || `${computedOrigin}/api/google/oauth/callback`;

  try {
    const credentials = await getGooglePlatformCredentials();
    if (!credentials.clientId || !credentials.clientSecret) {
      return NextResponse.redirect(`${fallbackOrigin}/gmb?error=missing_google_client_credentials`);
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: finalRedirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Google OAuth Callback] Token exchange failed:", errText);
      return NextResponse.redirect(`${fallbackOrigin}/gmb?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Fetch Google User Profile info
    let googleEmail = "";
    let googleUserId = "";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        googleEmail = userData.email || "";
        googleUserId = userData.id || "";
      }
    } catch (err) {
      console.warn("[Google OAuth Callback] Userinfo fetch warning:", err);
    }

    const supabase = getAdminSupabase();
    const tokenExpiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // 1. Save or update Google Business Account
    const accountPayload = {
      account_id: accountId,
      google_user_id: googleUserId || "google_user",
      email: googleEmail,
      access_token,
      refresh_token: refresh_token || null,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    };

    const { data: savedAccount, error: accError } = await supabase
      .from("google_business_accounts")
      .upsert(accountPayload, { onConflict: "account_id,google_user_id" })
      .select()
      .single();

    if (accError) {
      console.error("[Google OAuth Callback] Failed to save google_business_accounts:", accError);
    }

    // 2. Fetch and save locations if available
    try {
      const gAccounts = await fetchGoogleBusinessAccounts(access_token);
      if (gAccounts && gAccounts.length > 0) {
        for (const gAcc of gAccounts) {
          const locations = await fetchGoogleBusinessLocations(access_token, gAcc.name);
          if (locations && locations.length > 0) {
            for (const loc of locations) {
              const locPayload = {
                account_id: accountId,
                google_account_id: savedAccount?.id || null,
                location_id: loc.name || `loc_${Date.now()}`,
                location_name: loc.title || "Business Location",
                address: loc.storefrontAddress?.addressLines?.join(", ") || "",
                phone: loc.phoneNumbers?.primaryPhone || "",
                website: loc.websiteUri || "",
                primary_category: loc.categories?.primaryCategory?.displayName || "",
                status: "active",
                is_verified: true,
                updated_at: new Date().toISOString(),
              };

              await supabase
                .from("google_business_locations")
                .upsert(locPayload, { onConflict: "account_id,location_id" });
            }
          }
        }
      }
    } catch (locErr) {
      console.warn("[Google OAuth Callback] Non-fatal error while syncing locations:", locErr);
    }

    return NextResponse.redirect(`${computedOrigin}/gmb?success=connected`);
  } catch (err: any) {
    console.error("[Google OAuth Callback] Unexpected exception:", err);
    return NextResponse.redirect(`${fallbackOrigin}/gmb?error=${encodeURIComponent(err.message || "oauth_failed")}`);
  }
}
