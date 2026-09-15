import { encrypt } from '@/lib/whatsapp/encryption';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface EmbeddedSignupPayload {
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
}

export interface EmbeddedSignupResult {
  success: boolean;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  error?: string;
}

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Reads Meta credentials from platform_settings table or falls back to env vars.
 */
export async function getMetaAppCredentials(): Promise<{
  appId: string | null;
  appSecret: string | null;
  configId: string | null;
}> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from('platform_settings')
    .select('meta_app_id, meta_app_secret, meta_config_id')
    .eq('id', 'default')
    .maybeSingle();

  return {
    appId: data?.meta_app_id || process.env.META_APP_ID || null,
    appSecret: data?.meta_app_secret || process.env.META_APP_SECRET || null,
    configId: data?.meta_config_id || process.env.META_CONFIG_ID || null,
  };
}

/**
 * Exchanges the OAuth authorization code returned by Meta Embedded Signup for an access token.
 */
export async function exchangeCodeForAccessToken(
  code: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string } | { error: string }> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('code', code);

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      console.error('[Meta Embedded] Token exchange failed:', data);
      return {
        error: data.error?.message || 'Failed to exchange authorization code with Meta.',
      };
    }

    return { accessToken: data.access_token };
  } catch (err: any) {
    console.error('[Meta Embedded] Network error during token exchange:', err);
    return { error: err.message || 'Network error connecting to Meta Graph API.' };
  }
}

/**
 * Subscribes the WABA to the Meta app so incoming webhooks (messages, statuses) are delivered.
 */
export async function subscribeWabaToApp(
  wabaId: string,
  accessToken: string
): Promise<{ success: boolean; error?: string }> {
  const url = `${GRAPH_BASE}/${wabaId}/subscribed_apps`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[Meta Embedded] WABA subscription failed:', data);
      return { success: false, error: data.error?.message || 'Failed to subscribe WABA to app.' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Queries phone numbers under the WABA if phoneNumberId wasn't passed directly.
 */
export async function fetchWabaPhoneNumbers(
  wabaId: string,
  accessToken: string
): Promise<Array<{ id: string; display_phone_number: string; verified_name?: string }>> {
  const url = `${GRAPH_BASE}/${wabaId}/phone_numbers`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await res.json();
    return data.data || [];
  } catch (err) {
    console.error('[Meta Embedded] Failed to fetch WABA phone numbers:', err);
    return [];
  }
}

/**
 * Inspects access token via debug_token to extract the shared WABA ID if not provided in session payload.
 */
export async function getWabaFromToken(
  accessToken: string,
  appId: string,
  appSecret: string
): Promise<string | null> {
  const url = `${GRAPH_BASE}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const scopes = data?.data?.granular_scopes || [];
    const waScope = scopes.find((s: any) => s.scope === 'whatsapp_business_management');
    if (waScope && waScope.target_ids && waScope.target_ids.length > 0) {
      return waScope.target_ids[0];
    }
    return null;
  } catch (err) {
    console.error('[Meta Embedded] Failed to inspect token for WABA:', err);
    return null;
  }
}
