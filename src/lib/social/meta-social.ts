// ============================================================
// Meta Social Messaging (Facebook Messenger & Instagram DM)
//
// Shared client for Meta Graph API messaging across Facebook Page
// Messenger and Instagram Messaging Graph API.
// ============================================================

import { createClient as createAdminClient } from '@supabase/supabase-js';

const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
  } | null;
}

export interface SocialSendParams {
  pageAccessToken: string;
  recipientId: string;
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | 'file';
}

export interface SocialSendResult {
  messageId: string;
  recipientId: string;
}

export interface SocialUserProfile {
  name: string;
  username?: string;
  avatarUrl?: string;
}

export class MetaSocialError extends Error {
  readonly code: string;
  readonly status: number;
  readonly metaError?: unknown;

  constructor(message: string, code = 'social_send_failed', status = 500, metaError?: unknown) {
    super(message);
    this.name = 'MetaSocialError';
    this.code = code;
    this.status = status;
    this.metaError = metaError;
  }
}

/**
 * Format human-readable explanation from Meta Graph API error.
 */
function explainGraphError(error: Record<string, unknown> | undefined): string {
  if (!error) return 'Meta Graph API call failed';
  const message = (error.message as string) || 'Unknown error';
  const code = error.code as number | undefined;
  const subcode = error.error_subcode as number | undefined;

  // 24-hour window policy error
  if (code === 10 || subcode === 2018001 || message.includes('outside the allowed window')) {
    return 'Cannot send message: Customer has not messaged in the past 24 hours (Meta 24-hour messaging window rule).';
  }

  // Permission / Token expired
  if (code === 190 || code === 200 || message.includes('Session has expired') || message.includes('access token')) {
    return 'Meta Page Access Token has expired or lacks permissions (pages_messaging / instagram_manage_messages). Please reconnect in Settings.';
  }

  // Rate limit
  if (code === 4 || code === 17 || code === 32) {
    return 'Meta API rate limit reached. Please wait a few moments before retrying.';
  }

  return message;
}

/**
 * Send a message via Facebook Messenger Graph API.
 */
export async function sendFacebookMessage(
  params: SocialSendParams,
): Promise<SocialSendResult> {
  const { pageAccessToken, recipientId, text, mediaUrl, mediaType } = params;

  if (!pageAccessToken) {
    throw new MetaSocialError('Facebook Page Access Token is required', 'missing_token', 400);
  }
  if (!recipientId) {
    throw new MetaSocialError('Recipient Facebook user ID (PSID) is required', 'missing_recipient', 400);
  }
  if (!text && !mediaUrl) {
    throw new MetaSocialError('Either text or mediaUrl is required', 'empty_message', 400);
  }

  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
    messaging_type: 'RESPONSE',
  };

  if (mediaUrl) {
    const attachmentType = mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : mediaType === 'file' ? 'file' : 'image';
    body.message = {
      attachment: {
        type: attachmentType,
        payload: {
          url: mediaUrl,
          is_reusable: true,
        },
      },
    };
  } else {
    body.message = {
      text: text!,
    };
  }

  const url = `${META_GRAPH_BASE_URL}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as {
      recipient_id?: string;
      message_id?: string;
      error?: Record<string, unknown>;
    };

    if (!response.ok || data.error) {
      const reason = explainGraphError(data.error);
      console.error('Meta Facebook send error:', { status: response.status, data });
      throw new MetaSocialError(reason, 'meta_api_error', response.status, data.error);
    }

    return {
      messageId: data.message_id || `fb-${Date.now()}`,
      recipientId: data.recipient_id || recipientId,
    };
  } catch (err) {
    if (err instanceof MetaSocialError) throw err;
    const msg = err instanceof Error ? err.message : 'Network error communicating with Meta';
    throw new MetaSocialError(msg, 'network_error', 502);
  }
}

/**
 * Send a message via Instagram Messaging Graph API.
 */
export async function sendInstagramMessage(
  params: SocialSendParams,
): Promise<SocialSendResult> {
  const { pageAccessToken, recipientId, text, mediaUrl, mediaType } = params;

  if (!pageAccessToken) {
    throw new MetaSocialError('Page Access Token with Instagram permissions is required', 'missing_token', 400);
  }
  if (!recipientId) {
    throw new MetaSocialError('Recipient Instagram user ID (IGSID) is required', 'missing_recipient', 400);
  }
  if (!text && !mediaUrl) {
    throw new MetaSocialError('Either text or mediaUrl is required', 'empty_message', 400);
  }

  const body: Record<string, unknown> = {
    recipient: { id: recipientId },
  };

  if (mediaUrl) {
    const attachmentType = mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : 'image';
    body.message = {
      attachment: {
        type: attachmentType,
        payload: {
          url: mediaUrl,
        },
      },
    };
  } else {
    body.message = {
      text: text!,
    };
  }

  const url = `${META_GRAPH_BASE_URL}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as {
      recipient_id?: string;
      message_id?: string;
      error?: Record<string, unknown>;
    };

    if (!response.ok || data.error) {
      const reason = explainGraphError(data.error);
      console.error('Meta Instagram send error:', { status: response.status, data });
      throw new MetaSocialError(reason, 'meta_api_error', response.status, data.error);
    }

    return {
      messageId: data.message_id || `ig-${Date.now()}`,
      recipientId: data.recipient_id || recipientId,
    };
  } catch (err) {
    if (err instanceof MetaSocialError) throw err;
    const msg = err instanceof Error ? err.message : 'Network error communicating with Meta';
    throw new MetaSocialError(msg, 'network_error', 502);
  }
}

/**
 * Fetch a Facebook user's public profile (PSID-scoped).
 */
export async function getFacebookUserProfile(
  psid: string,
  pageAccessToken: string,
): Promise<SocialUserProfile | null> {
  if (!psid || !pageAccessToken) return null;
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      first_name?: string;
      last_name?: string;
      profile_pic?: string;
    };
    const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
    return {
      name: fullName || 'Facebook User',
      avatarUrl: data.profile_pic,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch an Instagram user's public profile (IGSID-scoped).
 */
export async function getInstagramUserProfile(
  igsid: string,
  pageAccessToken: string,
): Promise<SocialUserProfile | null> {
  if (!igsid || !pageAccessToken) return null;
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(igsid)}?fields=name,username,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      name?: string;
      username?: string;
      profile_pic?: string;
    };
    return {
      name: data.name || (data.username ? `@${data.username}` : 'Instagram User'),
      username: data.username,
      avatarUrl: data.profile_pic,
    };
  } catch {
    return null;
  }
}

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Reads Meta App credentials for Facebook & Instagram OAuth.
 */
export async function getSocialAppCredentials(): Promise<{
  appId: string | null;
  appSecret: string | null;
}> {
  try {
    const supabase = getAdminSupabase();
    const { data } = await supabase
      .from('platform_settings')
      .select('meta_app_id, meta_app_secret')
      .eq('id', 'default')
      .maybeSingle();

    return {
      appId: data?.meta_app_id || process.env.META_APP_ID || null,
      appSecret: data?.meta_app_secret || process.env.META_APP_SECRET || null,
    };
  } catch {
    return {
      appId: process.env.META_APP_ID || null,
      appSecret: process.env.META_APP_SECRET || null,
    };
  }
}

/**
 * Exchanges the OAuth authorization code returned by Facebook for a user access token.
 */
export async function exchangeCodeForUserToken(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<{ userAccessToken: string } | { error: string }> {
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('code', code);
  url.searchParams.set('redirect_uri', redirectUri);

  try {
    const res = await fetch(url.toString());
    const data = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || !data.access_token) {
      return { error: data.error?.message || 'Failed to exchange authorization code with Meta.' };
    }
    return { userAccessToken: data.access_token };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Network error connecting to Meta Graph API.' };
  }
}

/**
 * Exchanges a short-lived user token for a long-lived user token (valid ~60 days).
 */
export async function getLongLivedUserToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{ longLivedToken: string } | { error: string }> {
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortLivedToken);

  try {
    const res = await fetch(url.toString());
    const data = (await res.json()) as { access_token?: string; error?: { message?: string } };
    if (!res.ok || !data.access_token) {
      return { longLivedToken: shortLivedToken };
    }
    return { longLivedToken: data.access_token };
  } catch {
    return { longLivedToken: shortLivedToken };
  }
}

/**
 * Fetches all Facebook Pages the user manages, with their permanent Page Access Tokens
 * and connected Instagram Business Accounts.
 */
export async function fetchUserFacebookPages(
  userAccessToken: string
): Promise<{ pages: FacebookPage[] } | { error: string }> {
  const url = new URL(`${META_GRAPH_BASE_URL}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token,category,instagram_business_account{id,username}');
  url.searchParams.set('access_token', userAccessToken);

  try {
    const res = await fetch(url.toString());
    const data = (await res.json()) as { data?: FacebookPage[]; error?: { message?: string } };
    if (!res.ok || !Array.isArray(data.data)) {
      return { error: data.error?.message || 'Failed to fetch Facebook Pages for user.' };
    }
    return { pages: data.data };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Network error connecting to Meta Graph API.' };
  }
}

/**
 * Subscribes a Facebook Page to the Meta App so incoming webhooks (messages) are dispatched.
 */
export async function subscribePageToApp(
  pageId: string,
  pageAccessToken: string
): Promise<{ success: boolean; error?: string }> {
  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/subscribed_apps`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['messages', 'messaging_postbacks'],
        access_token: pageAccessToken,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !data.success) {
      console.warn(`[Meta Social] Subscribed apps warning for page ${pageId}:`, data);
      return { success: false, error: data.error?.message };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

