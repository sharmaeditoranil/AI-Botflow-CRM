import { NextResponse } from 'next/server';
import { getWahaQrCodeBuffer } from '@/lib/waha/client';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const session = searchParams.get('session');

    if (!session) {
      return NextResponse.json({ error: 'Missing session parameter' }, { status: 400 });
    }

    // Only a member of the account that owns this WhatsApp Web session may
    // see its QR code (scanning it links a phone to that account's CRM).
    let accountId: string;
    try {
      ({ accountId } = await getCurrentAccount());
    } catch (err) {
      return toErrorResponse(err);
    }
    const { data: owned } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .eq('waba_id', 'waha')
      .eq('phone_number_id', session)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
