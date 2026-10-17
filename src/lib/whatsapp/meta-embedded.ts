import { createClient as createAdminClient } from '@supabase/supabase-js';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface EmbeddedSignupPayload {
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
  coexistence?: boolean;
}

export interface EmbeddedSignupResult {
  success: boolean;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  coexistence?: boolean;
  error?: string;
}

/**
 * Returns the extras parameter payload for Meta Embedded Signup in Coexistence mode
 * (allowing existing WhatsApp Business App mobile accounts to connect without losing app access).
 */
export function getCoexistenceExtras() {
  return {
    setup: {},
    featureType: 'whatsapp_business_app_onboarding',
    sessionInfoVersion: '3',
    coex: true,
  };
}

/**
 * Returns the extras parameter payload for standard Meta Embedded Signup.
 */
export function getStandardExtras() {
  return {
    setup: {},
    sessionInfoVersion: '3',
  };
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
  creditLineId: string | null;
  systemUserToken: string | null;
}> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from('platform_settings')
    .select('meta_app_id, meta_app_secret, meta_config_id, meta_extended_credit_id, meta_system_user_token')
    .eq('id', 'default')
    .maybeSingle();

  return {
    appId: data?.meta_app_id || process.env.META_APP_ID || null,
    appSecret: data?.meta_app_secret || process.env.META_APP_SECRET || null,
    configId: data?.meta_config_id || process.env.META_CONFIG_ID || null,
    creditLineId: data?.meta_extended_credit_id || process.env.META_EXTENDED_CREDIT_ID || null,
    systemUserToken: data?.meta_system_user_token || process.env.META_SYSTEM_USER_TOKEN || null,
  };
}

/**
 * Exchanges the OAuth authorization code returned by Meta Embedded Signup for an access token.
 */
export async function exchangeCodeForAccessToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri?: string
): Promise<{ accessToken: string } | { error: string }> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('code', code);
  if (redirectUri) {
    url.searchParams.set('redirect_uri', redirectUri);
  }

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

/**
 * Automatically shares and attaches the platform master Extended Credit Line
 * to a newly connected client WABA so the client never needs to configure
 * payment methods or currency in Meta Business Manager.
 */
export async function attachCreditLineToWaba(
  wabaId: string,
  currency: string = 'INR'
): Promise<{ success: boolean; error?: string }> {
  const credentials = await getMetaAppCredentials();
  const creditLineId = credentials.creditLineId;
  const systemUserToken = credentials.systemUserToken;

  if (!creditLineId || !systemUserToken) {
    console.log('[Meta Embedded] Extended Credit Line auto-attach skipped (not configured in Super-Admin)');
    return { success: false, error: 'Credit line not configured' };
  }

  const url = `${GRAPH_BASE}/${creditLineId}/whatsapp_credit_sharing_and_attach?waba_currency=${encodeURIComponent(currency)}&waba_id=${encodeURIComponent(wabaId)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${systemUserToken}`,
      },
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[Meta Embedded] Credit sharing and attach failed:', data);
      return {
        success: false,
        error: data.error?.message || 'Failed to attach credit line to WABA',
      };
    }
    console.log(`[Meta Embedded] Successfully attached Extended Credit Line ${creditLineId} to WABA ${wabaId}!`);
    return { success: true };
  } catch (err: any) {
    console.error('[Meta Embedded] Exception attaching credit line to WABA:', err);
    return { success: false, error: err.message };
  }
}

