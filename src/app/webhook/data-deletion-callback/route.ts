import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const confirmationCode = `del_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin || 'https://dash.aibotflow.in';
    const statusUrl = `${origin}/data-deletion?id=${confirmationCode}`;

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (err: unknown) {
    console.error('[Data Deletion Callback Error]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.redirect('https://dash.aibotflow.in/data-deletion');
}
