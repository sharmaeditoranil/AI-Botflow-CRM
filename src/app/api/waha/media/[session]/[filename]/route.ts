import { NextResponse } from 'next/server';
import { getWahaConfig } from '@/lib/waha/client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ session: string; filename: string }> }
) {
  try {
    const { session, filename } = await params;

    if (!session || !filename) {
      return NextResponse.json({ error: 'Session and filename are required' }, { status: 400 });
    }

    const { baseUrl, apiKey } = getWahaConfig();
    const wahaFileUrl = `${baseUrl.replace(/\/+$/, '')}/api/files/${encodeURIComponent(session)}/${encodeURIComponent(filename)}`;

    const res = await fetch(wahaFileUrl, {
      headers: {
        'x-api-key': apiKey,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'File not found in WhatsApp Web storage' }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: any) {
    console.error('[waha-media-proxy] error:', err);
    return NextResponse.json({ error: err?.message || 'Internal proxy error' }, { status: 500 });
  }
}
