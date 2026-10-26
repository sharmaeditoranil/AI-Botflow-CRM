import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { encrypt } from '@/lib/whatsapp/encryption';
import {
  getOrCreateWahaSession,
  getWahaSessionStatus,
  logoutWahaSession,
} from '@/lib/waha/client';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabaseAdmin()
      .from('account_members')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const accountId = member?.account_id;
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    const { data: config } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .eq('waba_id', 'waha')
      .maybeSingle();

    if (!config) {
      return NextResponse.json({ connected: false, session: null, config: null });
    }

    const sessionName = config.phone_number_id;
    const wahaSession = await getWahaSessionStatus(sessionName);

    return NextResponse.json({
      connected: config.status === 'connected',
      sessionName,
      status: wahaSession?.status || config.status,
      displayPhoneNumber: config.display_phone_number,
      label: config.label || 'WhatsApp Web',
      configId: config.id,
      me: wahaSession?.me || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabaseAdmin()
      .from('account_members')
      .select('account_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const accountId = member?.account_id;
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    const sessionName = `web_${accountId.replace(/-/g, '').slice(0, 12)}`;

    // Create or start the session in WAHA
    const session = await getOrCreateWahaSession(sessionName);

    // Save/update row in whatsapp_config
    const { data: existing } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .eq('waba_id', 'waha')
      .maybeSingle();

    if (existing) {
      await supabaseAdmin()
        .from('whatsapp_config')
        .update({
          phone_number_id: sessionName,
          status: session?.status === 'WORKING' ? 'connected' : 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin().from('whatsapp_config').insert({
        account_id: accountId,
        user_id: user.id,
        phone_number_id: sessionName,
        waba_id: 'waha',
        access_token: encrypt(sessionName),
        label: 'WhatsApp Web',
        status: session?.status === 'WORKING' ? 'connected' : 'disconnected',
        is_default: false,
      });
    }

    return NextResponse.json({
      success: true,
      sessionName,
      status: session?.status || 'SCAN_QR_CODE',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to initialize session' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabaseAdmin()
      .from('account_members')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const accountId = member?.account_id;
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    const { data: config } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id, phone_number_id')
      .eq('account_id', accountId)
      .eq('waba_id', 'waha')
      .maybeSingle();

    if (config) {
      await logoutWahaSession(config.phone_number_id);
      await supabaseAdmin()
        .from('whatsapp_config')
        .update({
          status: 'disconnected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to disconnect session' }, { status: 500 });
  }
}
