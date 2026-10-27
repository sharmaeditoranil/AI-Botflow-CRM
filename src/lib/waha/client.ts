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
      config: {
        noweb: {
          store: { enabled: true },
        },
      },
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

  const id = res.data?.id || `waha_${Date.now()}`;
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

  const id = res.data?.id || `waha_${Date.now()}`;
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

