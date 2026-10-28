import { getWahaConfig } from './client';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { buildMediaPath } from '@/lib/storage/upload-media';
import { normalizeMimeType, MIRROR_BUCKET, MIRROR_FOLDER } from '@/lib/whatsapp/mirror-inbound-media';

/**
 * Copies inbound WhatsApp Web (WAHA) media into Supabase Storage `chat-media`
 * bucket so files are durable, fast to load, and never lost if local storage is cleared.
 */
export async function mirrorWahaInboundMedia(args: {
  accountId: string;
  session: string;
  filename: string;
  mimeType?: string | null;
}): Promise<string | null> {
  const { accountId, session, filename, mimeType } = args;

  try {
    const { baseUrl, apiKey } = getWahaConfig();
    const wahaFileUrl = `${baseUrl.replace(/\/+$/, '')}/api/files/${encodeURIComponent(session)}/${encodeURIComponent(filename)}`;

    const res = await fetch(wahaFileUrl, {
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (!res.ok) {
      console.warn(`[waha-mirror] could not fetch file from waha (${res.status}): ${wahaFileUrl}`);
      return null;
    }

    const contentType =
      normalizeMimeType(mimeType) ||
      normalizeMimeType(res.headers.get('content-type')) ||
      'application/octet-stream';
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // Limit to 16MB max to comply with chat-media bucket limits
    if (buffer.byteLength > 16 * 1024 * 1024) {
      console.warn(`[waha-mirror] file too large (${buffer.byteLength} bytes)`);
      return null;
    }

    // Sanitize filename to avoid folder traversal or forbidden characters
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `${session}-${cleanFilename}`;
    const path = buildMediaPath(accountId, objectName, null, MIRROR_FOLDER);

    const db = supabaseAdmin();
    const { error } = await db.storage.from(MIRROR_BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: '3600',
      upsert: true,
    });

    if (error) {
      console.warn(`[waha-mirror] upload failed for ${objectName}:`, error.message);
      return null;
    }

    const {
      data: { publicUrl },
    } = db.storage.from(MIRROR_BUCKET).getPublicUrl(path);

    return publicUrl || null;
  } catch (err: any) {
    console.warn(`[waha-mirror] error mirroring media:`, err?.message || err);
    return null;
  }
}
