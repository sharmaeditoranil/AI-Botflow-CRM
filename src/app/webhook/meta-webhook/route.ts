import { NextRequest } from 'next/server';
import { GET as socialGET, POST as socialPOST } from '@/app/api/meta/social/webhook/route';
import { GET as waGET, POST as waPOST } from '@/app/api/whatsapp/webhook/route';

export async function GET(request: NextRequest) {
  const resSocial = await socialGET(request);
  if (resSocial.status === 200) return resSocial;
  return waGET(request);
}

export async function POST(request: NextRequest) {
  const cloned = request.clone();
  try {
    const body = await request.json();
    if (body.object === 'page' || body.object === 'instagram') {
      return socialPOST(cloned);
    }
    return waPOST(cloned);
  } catch {
    return socialPOST(cloned);
  }
}
