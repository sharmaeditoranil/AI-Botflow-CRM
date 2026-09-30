import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPlanFeaturesConfig, DEFAULT_PLAN_FEATURES } from '@/lib/billing/plan-features';

export async function GET() {
  const supabase = await createClient();
  const [plansRes, featuresConfig] = await Promise.all([
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .neq('slug', 'founder')
      .order('sort_order', { ascending: true }),
    getPlanFeaturesConfig(),
  ]);

  if (plansRes.error) {
    return NextResponse.json({ error: plansRes.error.message }, { status: 500 });
  }

  const enrichedPlans = (plansRes.data || []).map((p) => ({
    ...p,
    features: featuresConfig[p.slug] || DEFAULT_PLAN_FEATURES[p.slug] || DEFAULT_PLAN_FEATURES.starter,
  }));

  return NextResponse.json({ plans: enrichedPlans });
}
