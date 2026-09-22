import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';

/**
 * GET /api/pipelines/ai-automation
 * Returns whether Smart AI Lead Capture & Qualification is enabled for the account.
 */
export async function GET() {
  try {
    const { accountId } = await getCurrentAccount();
    const admin = supabaseAdmin();

    const { data } = await admin
      .from('ai_configs')
      .select('lead_qualification_enabled, auto_tagging_enabled')
      .eq('account_id', accountId)
      .maybeSingle();

    const dealsEnabled = data ? data.lead_qualification_enabled !== false : true;
    const tagsEnabled = data ? data.auto_tagging_enabled !== false : true;

    return NextResponse.json({
      enabled: dealsEnabled,
      deals_enabled: dealsEnabled,
      tags_enabled: tagsEnabled,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/pipelines/ai-automation
 * Toggle Smart AI Lead Capture (deals_enabled) and Auto Tagging (tags_enabled) independently.
 */
export async function POST(req: Request) {
  try {
    const { accountId, userId } = await getCurrentAccount();
    const admin = supabaseAdmin();

    const body = await req.json().catch(() => null);
    
    // Check if ai_configs row exists
    const { data: existing } = await admin
      .from('ai_configs')
      .select('id, lead_qualification_enabled, auto_tagging_enabled')
      .eq('account_id', accountId)
      .maybeSingle();

    const currentDeals = existing ? existing.lead_qualification_enabled !== false : true;
    const currentTags = existing ? existing.auto_tagging_enabled !== false : true;

    const dealsEnabled = typeof body?.deals_enabled === 'boolean'
      ? body.deals_enabled
      : (typeof body?.enabled === 'boolean' ? body.enabled : currentDeals);

    const tagsEnabled = typeof body?.tags_enabled === 'boolean'
      ? body.tags_enabled
      : currentTags;

    if (existing) {
      const { error } = await admin
        .from('ai_configs')
        .update({
          lead_qualification_enabled: dealsEnabled,
          auto_tagging_enabled: tagsEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq('account_id', accountId);

      if (error) {
        console.error('[ai-automation toggle] update error:', error);
        return NextResponse.json({ error: 'Failed to update automation' }, { status: 500 });
      }
    } else {
      // Create default ai_configs row with toggle state
      const { error } = await admin
        .from('ai_configs')
        .insert({
          account_id: accountId,
          created_by: userId,
          provider: 'openai',
          model: 'gpt-4o-mini',
          api_key: 'managed',
          lead_qualification_enabled: dealsEnabled,
          auto_tagging_enabled: tagsEnabled,
          followup_intelligence_enabled: true,
        });

      if (error) {
        console.error('[ai-automation toggle] insert error:', error);
        return NextResponse.json({ error: 'Failed to save automation' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      enabled: dealsEnabled,
      deals_enabled: dealsEnabled,
      tags_enabled: tagsEnabled,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
