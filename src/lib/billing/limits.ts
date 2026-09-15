import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface AccountUsageInfo {
  plan: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    max_contacts: number;
    max_team_members: number;
    max_broadcasts_monthly: number;
    max_automations: number;
    max_flows: number;
    ai_agents_enabled: boolean;
  } | null;
  subscription: {
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    is_suspended: boolean;
  };
  usage: {
    contacts: number;
    team_members: number;
    broadcasts_month: number;
    automations: number;
    flows: number;
  };
}

/**
 * Returns account plan, subscription status, and usage counts.
 */
export async function getAccountUsage(accountId: string): Promise<AccountUsageInfo> {
  const supabase = getAdminSupabase();

  // 1. Get account with plan
  const { data: account } = await supabase
    .from('accounts')
    .select(`
      id,
      plan_id,
      subscription_status,
      trial_ends_at,
      current_period_end,
      is_suspended,
      plans (*)
    `)
    .eq('id', accountId)
    .single();

  const plan = (account?.plans as any) || null;

  // 2. Count contacts
  const { count: contactsCount } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // 3. Count team members
  const { count: membersCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // 4. Count automations
  const { count: automationsCount } = await supabase
    .from('automations')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // 5. Count flows
  const { count: flowsCount } = await supabase
    .from('flows')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  // 6. Count broadcasts sent this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: broadcasts } = await supabase
    .from('broadcasts')
    .select('recipient_count')
    .eq('account_id', accountId)
    .gte('created_at', startOfMonth.toISOString());

  const broadcastsTotal = (broadcasts || []).reduce(
    (acc, b: any) => acc + (b.recipient_count || 0),
    0
  );

  return {
    plan,
    subscription: {
      status: account?.subscription_status || 'active',
      trial_ends_at: account?.trial_ends_at || null,
      current_period_end: account?.current_period_end || null,
      is_suspended: !!account?.is_suspended,
    },
    usage: {
      contacts: contactsCount || 0,
      team_members: membersCount || 1,
      broadcasts_month: broadcastsTotal,
      automations: automationsCount || 0,
      flows: flowsCount || 0,
    },
  };
}

/**
 * Validates if the tenant can add more contacts according to their plan.
 */
export async function assertCanAddContact(accountId: string, countToAdd = 1): Promise<void> {
  const info = await getAccountUsage(accountId);

  if (info.subscription.is_suspended) {
    throw new Error('Your account is currently suspended. Please contact support.');
  }

  if (info.plan) {
    if (info.usage.contacts + countToAdd > info.plan.max_contacts) {
      throw new Error(
        `Contact limit reached (${info.usage.contacts}/${info.plan.max_contacts}). Please upgrade your plan in Settings > Billing.`
      );
    }
  }
}
