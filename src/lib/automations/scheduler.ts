import type { Automation, AutomationLogStepResult, AutomationStepType } from '@/types'
import { supabaseAdmin } from './admin-client'
import { executeAutomation } from './engine'
import { dueSlot, readSchedule } from './schedule'

// ------------------------------------------------------------
// Time-based automations.
//
// Called from the per-minute automations cron. For every active
// `time_based` automation whose schedule has a slot due now:
//
//   1. skip it if that slot already ran — each run writes one "schedule"
//      log row (contact_id NULL) at the start, which is both the audit
//      line and the claim that stops the next minute's tick replaying it;
//   2. otherwise write that row, then run the automation once per contact
//      in its audience (all contacts, or contacts with a tag), skipping
//      opted-out and unreachable contacts;
//   3. a one-time schedule switches itself off afterwards.
//
// The steps (conditions, templates, waits…) run through the normal
// engine, exactly as for any other trigger.
// ------------------------------------------------------------

const PAGE = 1000
const CONCURRENCY = 4

interface ScheduledConfig {
  audience?: 'all' | 'tag'
  audience_tag_id?: string
  repeat?: string
}

async function audienceContactIds(accountId: string, cfg: ScheduledConfig): Promise<string[]> {
  const db = supabaseAdmin()
  const ids: string[] = []
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from('contacts')
      .select(cfg.audience === 'tag' && cfg.audience_tag_id ? 'id, contact_tags!inner(tag_id)' : 'id')
      .eq('account_id', accountId)
      .or('is_opted_out.is.null,is_opted_out.eq.false')
      .or('phone.not.is.null,wa_user_id.not.is.null')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (cfg.audience === 'tag' && cfg.audience_tag_id) {
      q = q.eq('contact_tags.tag_id', cfg.audience_tag_id)
    }
    const { data, error } = await q
    if (error) throw new Error(`audience lookup failed: ${error.message}`)
    const rows = (data ?? []) as unknown as { id: string }[]
    for (const r of rows) ids.push(r.id)
    if (rows.length < PAGE) break
  }
  return Array.from(new Set(ids))
}

async function runForContacts(automation: Automation, contactIds: string[], slotIso: string) {
  let next = 0
  let failed = 0
  const worker = async () => {
    while (next < contactIds.length) {
      const contactId = contactIds[next++]
      try {
        await executeAutomation(automation, {
          accountId: automation.account_id as string,
          triggerType: 'time_based',
          contactId,
          context: { vars: { scheduled_at: slotIso } },
        })
      } catch (err) {
        failed++
        console.error('[scheduler] run failed for contact', contactId, err)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, contactIds.length) }, worker))
  return failed
}

function scheduleStep(status: AutomationLogStepResult['status'], detail: string): AutomationLogStepResult[] {
  return [{ step_id: 'schedule', step_type: 'schedule' as AutomationStepType, status, detail }]
}

/** Run every time-based automation that is due at `now`. Never throws. */
export async function runDueScheduledAutomations(
  now: Date = new Date(),
): Promise<{ started: number; contacts: number }> {
  const db = supabaseAdmin()
  let started = 0
  let contacts = 0

  const { data: automations, error } = await db
    .from('automations')
    .select('*')
    .eq('trigger_type', 'time_based')
    .eq('is_active', true)
  if (error) {
    console.error('[scheduler] could not load time-based automations:', error.message)
    return { started, contacts }
  }

  for (const automation of (automations ?? []) as Automation[]) {
    try {
      const cfg = (automation.trigger_config ?? {}) as Record<string, unknown>
      const slot = dueSlot(cfg, now)
      if (!slot) continue
      const slotIso = slot.toISOString()

      const { data: prior } = await db
        .from('automation_logs')
        .select('id')
        .eq('automation_id', automation.id)
        .eq('trigger_event', 'time_based')
        .is('contact_id', null)
        .gte('created_at', slotIso)
        .limit(1)
      if (prior && prior.length > 0) continue

      // Claim this slot before doing any work.
      const { data: marker, error: markerError } = await db
        .from('automation_logs')
        .insert({
          automation_id: automation.id,
          account_id: automation.account_id,
          user_id: automation.user_id,
          contact_id: null,
          trigger_event: 'time_based',
          steps_executed: scheduleStep('success', `Scheduled run for ${slotIso} started`),
          status: 'success',
        })
        .select('id')
        .single()
      if (markerError || !marker) {
        console.error('[scheduler] could not record run:', automation.id, markerError?.message)
        continue
      }
      started++

      const audience = await audienceContactIds(automation.account_id as string, cfg as ScheduledConfig)
      const failed = await runForContacts(automation, audience, slotIso)
      contacts += audience.length

      await db
        .from('automation_logs')
        .update({
          steps_executed: scheduleStep(
            failed > 0 ? 'failed' : 'success',
            `Scheduled run for ${slotIso}: ran for ${audience.length} contact${audience.length === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`,
          ),
          status: failed > 0 && failed === audience.length ? 'failed' : 'success',
        })
        .eq('id', marker.id)

      const parsed = readSchedule(cfg)
      if (parsed?.kind === 'simple' && parsed.schedule.repeat === 'once') {
        await db.from('automations').update({ is_active: false }).eq('id', automation.id)
      }
    } catch (err) {
      console.error('[scheduler] automation failed:', automation.id, err)
    }
  }

  return { started, contacts }
}
