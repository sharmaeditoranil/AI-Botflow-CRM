import { NextResponse } from 'next/server';
import { getWahaQrCodeBuffer } from '@/lib/waha/client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = searchParams.get('session');

    if (!session) {
      return NextResponse.json({ error: 'Missing session parameter' }, { status: 400 });
    }

    const buffer = await getWahaQrCodeBuffer(session);
    if (!buffer) {
      return NextResponse.json({ error: 'QR code not available or session connected' }, { status: 404 });
    }

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load QR code' }, { status: 500 });
  }
}
