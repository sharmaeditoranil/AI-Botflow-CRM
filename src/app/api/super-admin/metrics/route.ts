import { NextResponse } from 'next/server';
import { assertSuperAdmin, getAdminSupabase } from '@/lib/auth/super-admin';

export async function GET() {
  try {
    await assertSuperAdmin();
    const supabase = getAdminSupabase();

    // 1. Total Tenants
    const { count: tenantsCount } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true });

    // 2. Active Subscriptions
    const { count: activeSubsCount } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'active');

    // 3. WhatsApp Connected Count
    const { count: waConnectedCount } = await supabase
      .from('whatsapp_config')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'connected');

    // 4. Total Invoiced Revenue
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount')
      .eq('status', 'paid');

    const totalRevenue = (invoices || []).reduce((acc, inv) => acc + Number(inv.amount || 0), 0);

    // 5. Total Contacts across all tenants
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({
      totalTenants: tenantsCount || 0,
      activeSubscriptions: activeSubsCount || 0,
      waConnectedCount: waConnectedCount || 0,
      totalRevenue,
      totalContacts: totalContacts || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
