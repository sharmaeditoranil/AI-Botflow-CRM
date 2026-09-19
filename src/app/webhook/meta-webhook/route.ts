import { NextRequest } from 'next/server';
import { GET as socialGET, POST as socialPOST } from '@/app/api/meta/social/webhook/route';
import { GET as waGET, POST as waPOST } from '@/app/api/whatsapp/webhook/route';

export async function GET(request: NextRequest) {
  const resSocial = await socialGET(request);
  if (resSocial.status === 200) return resSocial;
  return waGET(request);
}

export async function POST(request: NextRequest) {
  try {
    const rawText = await request.text();
    const body = JSON.parse(rawText);

    const makeForwardReq = () =>
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: rawText,
      });

    if (body.object === 'page' || body.object === 'instagram') {
      return socialPOST(makeForwardReq());
    }
    return waPOST(makeForwardReq() as unknown as NextRequest);
  } catch (err) {
    console.error('[meta-webhook] error forwarding webhook:', err);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
