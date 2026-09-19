import { getAdminSupabase } from "@/lib/auth/super-admin";

export interface GooglePlatformCredentials {
  clientId: string | null;
  clientSecret: string | null;
}

/**
 * Fetch Google Cloud OAuth credentials from platform_settings table or env.
 */
export async function getGooglePlatformCredentials(): Promise<GooglePlatformCredentials> {
  const envClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || null;

  try {
    const supabase = getAdminSupabase();
    const { data } = await supabase
      .from("platform_settings")
      .select("google_client_id, google_client_secret")
      .eq("id", "default")
      .single();

    const dbClientId = data?.google_client_id?.trim() || null;
    const dbClientSecret = data?.google_client_secret?.trim() || null;

    return {
      clientId: dbClientId || envClientId,
      clientSecret: dbClientSecret || envClientSecret,
    };
  } catch (err) {
    console.error("[GBP] Failed to fetch credentials from platform_settings:", err);
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
    };
  }
}

/**
 * Refresh expired Google access token using refresh_token.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  credentials: GooglePlatformCredentials
): Promise<{ accessToken: string; expiresIn: number } | null> {
  if (!credentials.clientId || !credentials.clientSecret) {
    console.error("[GBP] Missing client credentials for token refresh");
    return null;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[GBP] Token refresh failed:", err);
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  } catch (err) {
    console.error("[GBP] Error refreshing token:", err);
    return null;
  }
}

/**
 * Fetch list of Google Business Profile accounts linked to the authenticated user.
 */
export async function fetchGoogleBusinessAccounts(accessToken: string): Promise<any[]> {
  try {
    const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn("[GBP] fetch accounts warning:", await res.text());
      return [];
    }

    const data = await res.json();
    return data.accounts || [];
  } catch (err) {
    console.error("[GBP] Error fetching accounts:", err);
    return [];
  }
}

/**
 * Fetch verified locations/storefronts for a given Google Business account.
 */
export async function fetchGoogleBusinessLocations(
  accessToken: string,
  accountName: string
): Promise<any[]> {
  try {
    // URL format: https://mybusinessbusinessinformation.googleapis.com/v1/{parent=accounts/*}/locations
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,categories,regularHours,storeCode`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn("[GBP] fetch locations warning:", await res.text());
      return [];
    }

    const data = await res.json();
    return data.locations || [];
  } catch (err) {
    console.error("[GBP] Error fetching locations:", err);
    return [];
  }
}

/**
 * Post a review reply to Google Business Profile API.
 */
export async function postReviewReplyToGoogle(
  accessToken: string,
  parentLocationName: string, // e.g. "accounts/123/locations/456"
  reviewId: string,
  replyComment: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://mybusiness.googleapis.com/v4/${parentLocationName}/reviews/${reviewId}/reply`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment: replyComment }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
