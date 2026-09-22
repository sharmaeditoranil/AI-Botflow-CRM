import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { executeAutomation } from '@/lib/automations/engine';
import type { Automation } from '@/types';

/**
 * GET /api/automations/assign?contactId=xxx
 * Returns available automations, active/scheduled runs, and recent history for a contact.
 */
export async function GET(request: Request) {
  try {
    const { accountId } = await getCurrentAccount();
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    const db = supabaseAdmin();

    // 1. Fetch all active automations in the tenant account
    const { data: automations, error: autoErr } = await db
      .from('automations')
      .select('id, name, description, trigger_type, is_active')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (autoErr) {
      console.error('[automations-assign] Error loading automations:', autoErr);
      return NextResponse.json({ error: 'Failed to load automations' }, { status: 500 });
    }

    if (!contactId) {
      return NextResponse.json({
        automations: automations || [],
        pending: [],
        recentLogs: [],
      });
    }

    // 2. Fetch any pending or running executions for this contact
    const { data: pending, error: pendErr } = await db
      .from('automation_pending_executions')
      .select('id, automation_id, status, run_at, automations(id, name)')
      .eq('contact_id', contactId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false });

    if (pendErr) {
      console.warn('[automations-assign] Error loading pending runs:', pendErr);
    }

    // 3. Fetch recent automation execution logs for this contact
    const { data: recentLogs, error: logErr } = await db
      .from('automation_logs')
      .select('id, automation_id, status, error_message, created_at, steps_executed, automations(id, name)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (logErr) {
      console.warn('[automations-assign] Error loading logs:', logErr);
    }

    return NextResponse.json({
      automations: automations || [],
      pending: pending || [],
      recentLogs: recentLogs || [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/automations/assign
 * Manually assigns and immediately triggers an automation on a customer.
 * Guarded against concurrent runs and duplicate executions.
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await getCurrentAccount();
    const body = await request.json().catch(() => ({}));
    const { contactId, automationId, conversationId } = body;

    if (!contactId || !automationId) {
      return NextResponse.json(
        { error: 'contactId and automationId are required' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // 1. Verify contact ownership
    const { data: contact, error: contactErr } = await db
      .from('contacts')
      .select('id, name, phone')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (contactErr || !contact) {
      return NextResponse.json(
        { error: 'Contact not found or does not belong to your account' },
        { status: 404 }
      );
    }

    // 2. Verify automation ownership & active status
    const { data: automation, error: autoErr } = await db
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (autoErr || !automation) {
      return NextResponse.json(
        { error: 'Automation not found or does not belong to your account' },
        { status: 404 }
      );
    }

    // 3. Guard against duplicate execution:
    // Check A: Is this exact automation already pending/running for this contact?
    const { data: activePending } = await db
      .from('automation_pending_executions')
      .select('id, status, run_at')
      .eq('automation_id', automationId)
      .eq('contact_id', contactId)
      .in('status', ['pending', 'running'])
      .limit(1);

    if (activePending && activePending.length > 0) {
      return NextResponse.json(
        {
          error: `This automation is already active or scheduled for this customer (${activePending[0].status}). Duplicate assignment blocked.`,
          code: 'duplicate_running',
        },
        { status: 409 }
      );
    }

    // Check B: Was this exact automation executed for this contact in the last 30 seconds?
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    const { data: recentLogs } = await db
      .from('automation_logs')
      .select('id, created_at, status')
      .eq('automation_id', automationId)
      .eq('contact_id', contactId)
      .gte('created_at', thirtySecondsAgo)
      .limit(1);

    if (recentLogs && recentLogs.length > 0) {
      return NextResponse.json(
        {
          error: 'This automation was just assigned moments ago. Please wait 30 seconds before re-assigning.',
          code: 'rate_limited',
        },
        { status: 409 }
      );
    }

    // 4. Resolve conversation ID if not supplied
    let targetConvId = conversationId;
    if (!targetConvId) {
      const { data: latestConv } = await db
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestConv) {
        targetConvId = latestConv.id;
      }
    }

    // 5. Execute automation immediately
    await executeAutomation(automation as Automation, {
      accountId,
      triggerType: automation.trigger_type || 'user_enquiry',
      contactId,
      context: {
        conversation_id: targetConvId || undefined,
        manual_assignment: true,
        assigned_by_user_id: userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Automation "${automation.name}" assigned and started successfully.`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
