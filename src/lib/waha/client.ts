/**
 * WAHA (WhatsApp HTTP API) Client Wrapper
 * Handles WhatsApp Web connection via QR scan (NOWEB / Baileys engine).
 * Runs alongside Meta Cloud API without any 24-hour window restriction.
 */

export interface WahaSession {
  name: string;
  status: 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED' | 'STOPPED';
  me?: {
    id: string; // e.g. "918983214614@c.us"
    pushName?: string;
  } | null;
}

export function getWahaConfig() {
  const baseUrl =
    process.env.WAHA_BASE_URL ||
    (process.env.NODE_ENV === 'production' ? 'http://waha:3000' : 'http://127.0.0.1:3001');
  const apiKey = process.env.WAHA_API_KEY || 'waha_api_key_88222_aibotflow';
  return { baseUrl, apiKey };
}

/**
 * Returns the public webhook URL for WAHA to deliver message and status updates.
 */
export function getWahaWebhookUrl(): string {
  if (process.env.WAHA_WEBHOOK_URL) {
    return process.env.WAHA_WEBHOOK_URL;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dash.aibotflow.in';
  return `${siteUrl.replace(/\/+$/, '')}/api/waha/webhook`;
}

/**
 * Safely extracts a clean string message ID from any WAHA message or ack payload.
 * Supports flat strings, WEBJS { id: { _serialized, id } }, NOWEB / Baileys { key: { id } },
 * and nested _data structures.
 */
export function extractWahaMessageId(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string' && data.trim()) return data.trim();

  // If data itself has _serialized
  if (typeof data._serialized === 'string' && data._serialized) {
    return data._serialized;
  }

  // WEBJS format: { id: { _serialized: "true_..._3EB...", id: "3EB..." } }
  if (data.id) {
    if (typeof data.id === 'string' && data.id.trim()) {
      return data.id.trim();
    }
    if (typeof data.id === 'object') {
      if (typeof data.id._serialized === 'string' && data.id._serialized) {
        return data.id._serialized;
      }
      if (typeof data.id.id === 'string' && data.id.id) {
        return data.id.id;
      }
    }
  }

  // Baileys / NOWEB key format: { key: { id: "3EB...", remoteJid: "..." } }
  if (data.key && typeof data.key === 'object') {
    if (typeof data.key.id === 'string' && data.key.id) {
      return data.key.id;
    }
  }

  // Nested in _data:
  if (data._data) {
    if (typeof data._data === 'string' && data._data.trim()) return data._data.trim();
    if (typeof data._data.id === 'string' && data._data.id) return data._data.id;
    if (typeof data._data.id?._serialized === 'string') return data._data.id._serialized;
    if (typeof data._data.id?.id === 'string') return data._data.id.id;
    if (typeof data._data.key?.id === 'string') return data._data.key.id;
  }

  return null;
}

/**
 * Maps a WAHA / WhatsApp ack code or string to our internal message status.
 *
 * WhatsApp ACK codes:
 *  -1 / ERROR: failed
 *   0 / PENDING: sending
 *   1 / SERVER: sent (single check)
 *   2 / DEVICE: delivered (double check)
 *   3 / READ: read (blue double check)
 *   4 / PLAYED: read (blue double check for audio/media)
 */
export function mapWahaAckToStatus(
  ack: number | string | null | undefined,
  ackName?: string | null
): 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | null {
  const name = String(ackName || ack || '').toUpperCase().trim();
  const num = typeof ack === 'number' ? ack : parseInt(String(ack), 10);

  if (name === 'READ' || name === 'PLAYED' || num === 3 || num === 4) {
    return 'read';
  }
  if (name === 'DEVICE' || num === 2) {
    return 'delivered';
  }
  if (name === 'SERVER' || num === 1) {
    return 'sent';
  }
  if (name === 'ERROR' || name === 'FAILED' || num === -1) {
    return 'failed';
  }
  if (name === 'PENDING' || num === 0) {
    return 'sending';
  }
  return null;
}

export const WAHA_STATUS_PRIORITY: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * Searches the Supabase messages table for a message matching a WAHA ID.
 * Handles both composite serialized IDs (true_..._3EB...) and short stanza IDs (3EB...).
 */
export async function findMessageByWahaId(db: any, rawId: string) {
  if (!rawId) return null;

  // 1. Exact match
  const { data: exact } = await db
    .from('messages')
    .select('id, status, conversation_id, message_id')
    .eq('message_id', rawId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exact) return exact;

  // 2. If rawId is composite (contains '_'), extract stanza ID and try exact match
  const lastUnderscore = rawId.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const stanzaId = rawId.slice(lastUnderscore + 1);
    if (stanzaId && stanzaId.length >= 6) {
      const { data: byStanza } = await db
        .from('messages')
        .select('id, status, conversation_id, message_id')
        .eq('message_id', stanzaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byStanza) return byStanza;

      const { data: byEnding } = await db
        .from('messages')
        .select('id, status, conversation_id, message_id')
        .ilike('message_id', `%_${stanzaId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byEnding) return byEnding;
    }
  } else if (rawId.length >= 6) {
    // 3. rawId is a short stanza ID (e.g. 3EB...), check if stored message_id ends with `_${rawId}`
    const { data: byEnding } = await db
      .from('messages')
      .select('id, status, conversation_id, message_id')
      .ilike('message_id', `%_${rawId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEnding) return byEnding;
  }

  return null;
}

async function wahaFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const { baseUrl, apiKey } = getWahaConfig();
  const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    ...(options.headers as Record<string, string>),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any = null;

    if (contentType.includes('application/json')) {
      data = await res.json();
    } else if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      const buffer = await res.arrayBuffer();
      return { ok: res.ok, status: res.status, data: Buffer.from(buffer) as any };
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: typeof data === 'object' && data?.message ? data.message : res.statusText,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: err?.message || 'WAHA service connection failed',
    };
  }
}

/**
 * Get or create a session for an account.
 */
export async function getOrCreateWahaSession(sessionName: string): Promise<WahaSession | null> {
  const webhookUrl = getWahaWebhookUrl();
  const sessionConfig = {
    webhooks: [
      {
        url: webhookUrl,
        events: ['message', 'message.any', 'message.ack', 'message.ack.group', 'session.status'],
      },
    ],
    noweb: {
      store: { enabled: true },
    },
  };

  const getRes = await wahaFetch<WahaSession>(`/api/sessions/${sessionName}`);
  if (getRes.ok && getRes.data) {
    if (getRes.data.status === 'STOPPED') {
      await wahaFetch(`/api/sessions/${sessionName}/start`, { method: 'POST' });
    }
    return getRes.data;
  }

  // Create session
  const createRes = await wahaFetch<WahaSession>('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: sessionName,
      config: sessionConfig,
    }),
  });

  if (!createRes.ok) {
    // If already exists or error, try starting it
    await wahaFetch(`/api/sessions/${sessionName}/start`, { method: 'POST' });
    const retry = await wahaFetch<WahaSession>(`/api/sessions/${sessionName}`);
    return retry.data;
  }

  // Start the newly created session
  await wahaFetch(`/api/sessions/${sessionName}/start`, { method: 'POST' });
  const started = await wahaFetch<WahaSession>(`/api/sessions/${sessionName}`);
  return started.data;
}

/**
 * Ensures existing WAHA session is subscribed to message & ack webhooks.
 * Safe non-blocking call.
 */
export async function syncWahaSessionWebhooks(sessionName: string): Promise<boolean> {
  const webhookUrl = getWahaWebhookUrl();
  try {
    const res = await wahaFetch(`/api/sessions/${sessionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sessionName,
        config: {
          webhooks: [
            {
              url: webhookUrl,
              events: ['message', 'message.any', 'message.ack', 'message.ack.group', 'session.status'],
            },
          ],
        },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[syncWahaSessionWebhooks] notice:', err);
    return false;
  }
}

/**
 * Get QR code PNG image buffer for a session.
 */
export async function getWahaQrCodeBuffer(sessionName: string): Promise<Buffer | null> {
  const res = await wahaFetch<Buffer>(`/api/${sessionName}/auth/qr`);
  if (res.ok && res.data && Buffer.isBuffer(res.data)) {
    return res.data;
  }
  return null;
}

/**
 * Get status of an existing session.
 */
export async function getWahaSessionStatus(sessionName: string): Promise<WahaSession | null> {
  const res = await wahaFetch<WahaSession>(`/api/sessions/${sessionName}`);
  return res.ok ? res.data : null;
}

/**
 * Log out and delete an existing session.
 */
export async function logoutWahaSession(sessionName: string): Promise<boolean> {
  const logoutRes = await wahaFetch(`/api/sessions/${sessionName}/logout`, { method: 'POST' });
  await wahaFetch(`/api/sessions/${sessionName}`, { method: 'DELETE' });
  return logoutRes.ok;
}

/**
 * Format normal phone number to WAHA chatId (e.g. "918983214614" -> "918983214614@c.us")
 */
export function formatToWahaChatId(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@c.us`;
}

/**
 * Send text message through WhatsApp Web (WAHA).
 * No 24-hour window restriction!
 */
export async function sendWahaText(
  sessionName: string,
  toPhone: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const chatId = formatToWahaChatId(toPhone);

  const res = await wahaFetch('/api/sendText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: sessionName,
      chatId,
      text,
    }),
  });

  if (!res.ok) {
    return { success: false, error: res.error || 'Failed to send WhatsApp Web message' };
  }

  const extractedId = extractWahaMessageId(res.data);
  const id = extractedId || `waha_${Date.now()}`;
  return { success: true, messageId: id };
}

/**
 * Send image / media through WhatsApp Web (WAHA).
 */
export async function sendWahaImage(
  sessionName: string,
  toPhone: string,
  mediaUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const chatId = formatToWahaChatId(toPhone);

  const res = await wahaFetch('/api/sendImage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: sessionName,
      chatId,
      file: { url: mediaUrl },
      caption: caption || '',
    }),
  });

  if (!res.ok) {
    return { success: false, error: res.error || 'Failed to send WhatsApp Web media' };
  }

  const extractedId = extractWahaMessageId(res.data);
  const id = extractedId || `waha_${Date.now()}`;
  return { success: true, messageId: id };
}

/**
 * Resolves a real E.164 phone number from a WAHA JID or WhatsApp multi-device LID.
 * WhatsApp multi-device often uses internal LIDs (e.g. "48950279163915@lid").
 * This function extracts or queries the underlying real phone number (e.g. "+919939967431").
 */
export async function resolveWahaPhoneNumber(
  sessionName: string,
  jidOrLid: string,
  payload?: any
): Promise<{ phone: string; name?: string }> {
  // 1. Direct check in payload._data.key.remoteJidAlt or payload.remoteJidAlt
  const alt =
    payload?._data?.key?.remoteJidAlt ||
    payload?.remoteJidAlt ||
    payload?._data?.remoteJidAlt ||
    payload?._data?.key?.participantAlt;

  if (alt && typeof alt === 'string' && !alt.includes('@lid')) {
    const cleanAlt = alt.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
    if (cleanAlt && cleanAlt.length >= 8) {
      const pushName =
        payload?._data?.pushName ||
        payload?._data?.notifyName ||
        payload?.pushname ||
        null;
      return { phone: `+${cleanAlt}`, name: pushName };
    }
  }

  // 2. If it is already a regular WhatsApp phone JID (e.g. "919939967431@c.us") and NOT a LID:
  if (jidOrLid && !jidOrLid.includes('@lid')) {
    const clean = jidOrLid.replace('@c.us', '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (clean && clean.length >= 8) {
      const pushName =
        payload?._data?.pushName ||
        payload?._data?.notifyName ||
        payload?.pushname ||
        null;
      return { phone: `+${clean}`, name: pushName };
    }
  }

  // 3. It's a LID (e.g. 48950279163915@lid). Query WAHA contacts API:
  try {
    const res = await wahaFetch<any>(
      `/api/contacts?session=${encodeURIComponent(sessionName)}&contactId=${encodeURIComponent(jidOrLid)}`
    );
    if (res.ok && res.data) {
      const pn = res.data.phoneNumber || res.data.id;
      if (pn && typeof pn === 'string' && !pn.includes('@lid')) {
        const cleanPn = pn.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\D/g, '');
        if (cleanPn && cleanPn.length >= 8) {
          const name =
            res.data.verifiedName ||
            res.data.pushname ||
            (res.data.name && !res.data.name.includes('∙') ? res.data.name : null);
          return { phone: `+${cleanPn}`, name };
        }
      }
    }
  } catch (err) {
    console.warn('[resolveWahaPhoneNumber] LID lookup error:', err);
  }

  // 4. Fallback: clean digits
  const fallback = jidOrLid.replace(/@.*$/, '').replace(/\D/g, '');
  return { phone: `+${fallback}` };
}

/**
 * Fetch profile picture URL for a contact from WhatsApp Web (WAHA).
 */
export async function getWahaProfilePicture(
  sessionName: string,
  contactPhoneOrJid: string
): Promise<string | null> {
  try {
    let contactId = contactPhoneOrJid;
    if (!contactId.includes('@')) {
      const clean = contactId.replace(/\D/g, '');
      contactId = `${clean}@c.us`;
    }
    const res = await wahaFetch<{ profilePictureURL?: string | null }>(
      `/api/contacts/profile-picture?session=${encodeURIComponent(sessionName)}&contactId=${encodeURIComponent(contactId)}`
    );
    if (res.ok && res.data?.profilePictureURL) {
      return res.data.profilePictureURL;
    }
  } catch (err) {
    console.warn('[getWahaProfilePicture] error:', err);
  }
  return null;
}

