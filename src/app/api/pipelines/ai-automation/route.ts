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
      .select('lead_qualification_enabled')
      .eq('account_id', accountId)
      .maybeSingle();

    // Default is true if row exists and not explicitly set to false, or true by default
    const enabled = data ? data.lead_qualification_enabled !== false : true;

    return NextResponse.json({ enabled });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/pipelines/ai-automation
 * Toggle Smart AI Lead Capture & Qualification ON or OFF.
 */
export async function POST(req: Request) {
  try {
    const { accountId, userId } = await getCurrentAccount();
    const admin = supabaseAdmin();

    const body = await req.json().catch(() => null);
    const enabled = body?.enabled === true;

    // Check if ai_configs row exists
    const { data: existing } = await admin
      .from('ai_configs')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('ai_configs')
        .update({
          lead_qualification_enabled: enabled,
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
          lead_qualification_enabled: enabled,
          auto_tagging_enabled: true,
          followup_intelligence_enabled: true,
        });

      if (error) {
        console.error('[ai-automation toggle] insert error:', error);
        return NextResponse.json({ error: 'Failed to save automation' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, enabled });
  } catch (err) {
    return toErrorResponse(err);
  }
}
