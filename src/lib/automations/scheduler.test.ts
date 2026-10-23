import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  automations: [] as Record<string, unknown>[],
  priorRuns: [] as unknown[],
  contacts: [] as { id: string }[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  executed: [] as { automationId: string; contactId: string }[],
}))

vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'gte', 'limit', 'or', 'order', 'range']) b[m] = () => b
      b.insert = (row: Record<string, unknown>) => {
        h.inserts.push(row)
        return { select: () => ({ single: async () => ({ data: { id: 'log-1' }, error: null }) }) }
      }
      b.update = (patch: Record<string, unknown>) => {
        h.updates.push({ table, patch })
        return { eq: async () => ({ error: null }) }
      }
      b.then = (resolve: (r: unknown) => unknown) =>
        resolve({
          data:
            table === 'automations'
              ? h.automations
              : table === 'automation_logs'
                ? h.priorRuns
                : table === 'contacts'
                  ? h.contacts
                  : [],
          error: null,
        })
      return b
    },
  }),
}))

vi.mock('./engine', () => ({
  executeAutomation: vi.fn(async (automation: { id: string }, input: { contactId: string }) => {
    h.executed.push({ automationId: automation.id, contactId: input.contactId })
  }),
}))

import { runDueScheduledAutomations } from './scheduler'

const FRIDAY_0530_IST = new Date('2026-10-23T00:01:00Z')
const weekly = {
  id: 'auto-1',
  account_id: 'acc',
  user_id: 'u1',
  trigger_type: 'time_based',
  is_active: true,
  trigger_config: { repeat: 'weekly', weekdays: [5], time: '05:30', timezone: 'Asia/Kolkata' },
}

beforeEach(() => {
  h.automations = []
  h.priorRuns = []
  h.contacts = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]
  h.inserts = []
  h.updates = []
  h.executed = []
})

describe('runDueScheduledAutomations', () => {
  it('runs a due automation once per audience contact and records the run', async () => {
    h.automations = [weekly]
    const r = await runDueScheduledAutomations(FRIDAY_0530_IST)
    expect(r).toEqual({ started: 1, contacts: 3 })
    expect(h.executed.map((e) => e.contactId).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(h.inserts[0]).toMatchObject({ automation_id: 'auto-1', contact_id: null, trigger_event: 'time_based' })
  })

  it('does not replay a slot that already ran', async () => {
    h.automations = [weekly]
    h.priorRuns = [{ id: 'earlier-run' }]
    const r = await runDueScheduledAutomations(FRIDAY_0530_IST)
    expect(r.started).toBe(0)
    expect(h.executed).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('does nothing when the schedule is not due', async () => {
    h.automations = [weekly]
    const r = await runDueScheduledAutomations(new Date('2026-10-22T00:01:00Z'))
    expect(r.started).toBe(0)
    expect(h.executed).toHaveLength(0)
  })

  it('switches a one-time schedule off after it runs', async () => {
    h.automations = [
      {
        ...weekly,
        id: 'auto-once',
        trigger_config: { repeat: 'once', date: '2026-10-23', time: '05:30', timezone: 'Asia/Kolkata' },
      },
    ]
    await runDueScheduledAutomations(FRIDAY_0530_IST)
    expect(h.executed).toHaveLength(3)
    expect(h.updates).toContainEqual({ table: 'automations', patch: { is_active: false } })
  })

  it('keeps running legacy cron schedules', async () => {
    h.automations = [{ ...weekly, trigger_config: { schedule: '30 5 * * 5' } }]
    const r = await runDueScheduledAutomations(FRIDAY_0530_IST)
    expect(r.started).toBe(1)
  })
})
