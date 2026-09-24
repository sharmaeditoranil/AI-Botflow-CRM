import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_PIPELINE_STAGES = [
  { name: 'New Lead', color: '#3b82f6', position: 0 },
  { name: 'Contact Made', color: '#f59e0b', position: 1 },
  { name: 'Meeting Scheduled', color: '#8b5cf6', position: 2 },
  { name: 'Proposal Sent', color: '#06b6d4', position: 3 },
  { name: 'Won', color: '#10b981', position: 4 },
  { name: 'Lost', color: '#ef4444', position: 5 },
] as const;

export interface EnsurePipelineResult {
  pipelineId: string;
  stageId: string;
  created: boolean;
}

/**
 * Ensures an account has at least one active pipeline with stages.
 * If the account is brand new or empty, automatically provisions "Sales Pipeline"
 * with default stages so AI and automations never fail or break.
 */
export async function ensureDefaultPipelineForAccount(
  db: SupabaseClient,
  accountId: string,
  userId?: string
): Promise<EnsurePipelineResult | null> {
  if (!accountId) return null;

  try {
    // 1. Look for existing pipeline for this account
    const { data: existingPipe } = await db
      .from('pipelines')
      .select('id, stages:pipeline_stages(id, position)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingPipe && existingPipe.stages && (existingPipe.stages as any[]).length > 0) {
      const sortedStages = (existingPipe.stages as any[]).sort((a: any, b: any) => a.position - b.position);
      return {
        pipelineId: existingPipe.id,
        stageId: sortedStages[0].id,
        created: false,
      };
    }

    // 2. Fallback check by user_id if account_id search was empty
    if (userId) {
      const { data: userPipe } = await db
        .from('pipelines')
        .select('id, stages:pipeline_stages(id, position)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (userPipe && userPipe.stages && (userPipe.stages as any[]).length > 0) {
        const sortedStages = (userPipe.stages as any[]).sort((a: any, b: any) => a.position - b.position);
        return {
          pipelineId: userPipe.id,
          stageId: sortedStages[0].id,
          created: false,
        };
      }
    }

    // 3. Brand new account: Auto-provision "Sales Pipeline"
    let ownerId = userId;
    if (!ownerId) {
      const { data: acct } = await db
        .from('accounts')
        .select('owner_user_id')
        .eq('id', accountId)
        .maybeSingle();
      ownerId = acct?.owner_user_id || undefined;
    }

    const { data: newPipe, error: pipeErr } = await db
      .from('pipelines')
      .insert({
        account_id: accountId,
        user_id: ownerId,
        name: 'Sales Pipeline',
      })
      .select('id')
      .single();

    if (pipeErr || !newPipe) {
      console.warn('[default-pipeline] Failed to create default pipeline:', pipeErr);
      return null;
    }

    const stagesPayload = DEFAULT_PIPELINE_STAGES.map((s) => ({
      pipeline_id: newPipe.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));

    const { data: createdStages, error: stagesErr } = await db
      .from('pipeline_stages')
      .insert(stagesPayload)
      .select('id, position');

    if (stagesErr || !createdStages || createdStages.length === 0) {
      console.warn('[default-pipeline] Failed to seed default pipeline stages:', stagesErr);
      return null;
    }

    const sorted = createdStages.sort((a, b) => a.position - b.position);
    return {
      pipelineId: newPipe.id,
      stageId: sorted[0].id,
      created: true,
    };
  } catch (err) {
    console.warn('[default-pipeline] ensureDefaultPipelineForAccount error:', err);
    return null;
  }
}
