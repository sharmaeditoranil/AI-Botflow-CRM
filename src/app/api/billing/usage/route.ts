import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccountUsage } from '@/lib/billing/limits';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.account_id) {
    return NextResponse.json({ error: 'No account associated with user.' }, { status: 400 });
  }

  const usageInfo = await getAccountUsage(profile.account_id);
  return NextResponse.json(usageInfo);
}
