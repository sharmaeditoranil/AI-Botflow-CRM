import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .neq('slug', 'founder')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ plans: plans || [] });
}
