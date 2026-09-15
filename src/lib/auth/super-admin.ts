import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Checks whether the caller is a verified super admin.
 * Throws an Error if unauthorized.
 */
export async function assertSuperAdmin(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const adminSupabase = getAdminSupabase();
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('is_super_admin, email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.is_super_admin) {
    throw new Error('Forbidden: Super-Admin access required.');
  }

  return { userId: user.id, email: profile.email };
}

/**
 * Logs an administrative action to the audit_logs table.
 */
export async function logSuperAdminAction(params: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, any>;
}) {
  const adminSupabase = getAdminSupabase();
  await adminSupabase.from('audit_logs').insert({
    actor_user_id: params.actorUserId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId || null,
    details: params.details || {},
  });
}
