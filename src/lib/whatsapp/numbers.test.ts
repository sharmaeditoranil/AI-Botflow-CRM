import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getWhatsAppNumberForConversation,
  getWhatsAppNumberForWaba,
  getWhatsAppNumberLimit,
  numberDisplayName,
  resolveWhatsAppNumber,
} from './numbers'

type Row = Record<string, unknown>

/**
 * Minimal PostgREST-shaped fake: records `.eq()` filters per query and
 * answers from in-memory tables. Order is honoured for the number list
 * (is_default desc, created_at asc) like the real query.
 */
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: [string, unknown][] = []
      const rows = () =>
        (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          filters.push([c, v])
          return b
        },
        order: () => b,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (r: { data: Row[]; error: null }) => unknown) =>
          resolve({
            data: rows().sort(
              (a, z) =>
                Number(z.is_default) - Number(a.is_default) ||
                String(a.created_at).localeCompare(String(z.created_at)),
            ),
            error: null,
          }),
      }
      return b
    },
  } as unknown as SupabaseClient
}

const SALES = { id: 'n-sales', account_id: 'acc', waba_id: 'W1', is_default: true, created_at: '2026-01-01', label: 'Sales' }
const SUPPORT = { id: 'n-support', account_id: 'acc', waba_id: 'W2', is_default: false, created_at: '2026-02-01', label: 'Support' }
const OTHER_TENANT = { id: 'n-other', account_id: 'other', waba_id: 'W9', is_default: true, created_at: '2025-01-01' }

describe('resolveWhatsAppNumber', () => {
  const db = fakeDb({ whatsapp_config: [SUPPORT, SALES, OTHER_TENANT] })

  it('returns the chosen number', async () => {
    expect((await resolveWhatsAppNumber(db, 'acc', 'n-support'))?.id).toBe('n-support')
  })

  it('falls back to the default when nothing is chosen', async () => {
    expect((await resolveWhatsAppNumber(db, 'acc', null))?.id).toBe('n-sales')
  })

  it("never resolves another tenant's number by id", async () => {
    expect((await resolveWhatsAppNumber(db, 'acc', 'n-other'))?.id).toBe('n-sales')
  })

  it('falls back to the oldest number when none is flagged default', async () => {
    const legacy = fakeDb({
      whatsapp_config: [
        { ...SUPPORT, is_default: false },
        { ...SALES, is_default: false },
      ],
    })
    expect((await resolveWhatsAppNumber(legacy, 'acc', null))?.id).toBe('n-sales')
  })

  it('returns null for an account with no numbers', async () => {
    expect(await resolveWhatsAppNumber(fakeDb({}), 'acc', null)).toBeNull()
  })
})

describe('getWhatsAppNumberForConversation', () => {
  it("uses the number the chat lives on", async () => {
    const db = fakeDb({
      whatsapp_config: [SALES, SUPPORT],
      conversations: [{ id: 'c1', account_id: 'acc', whatsapp_config_id: 'n-support' }],
    })
    expect((await getWhatsAppNumberForConversation(db, 'acc', 'c1'))?.id).toBe('n-support')
  })

  it('uses the default when the chat has no number (removed / legacy)', async () => {
    const db = fakeDb({
      whatsapp_config: [SALES, SUPPORT],
      conversations: [{ id: 'c1', account_id: 'acc', whatsapp_config_id: null }],
    })
    expect((await getWhatsAppNumberForConversation(db, 'acc', 'c1'))?.id).toBe('n-sales')
  })
})

describe('getWhatsAppNumberForWaba', () => {
  const db = fakeDb({ whatsapp_config: [SALES, SUPPORT] })

  it("picks a number on the template's WABA", async () => {
    expect((await getWhatsAppNumberForWaba(db, 'acc', 'W2'))?.id).toBe('n-support')
  })

  it('uses the default for a template with no WABA recorded', async () => {
    expect((await getWhatsAppNumberForWaba(db, 'acc', null))?.id).toBe('n-sales')
  })
})

describe('getWhatsAppNumberLimit', () => {
  it("reads the plan's limit", async () => {
    const db = fakeDb({ accounts: [{ id: 'acc', plan: { max_whatsapp_numbers: 3 } }] })
    expect(await getWhatsAppNumberLimit(db, 'acc')).toBe(3)
  })

  it('defaults to 1 without a plan', async () => {
    expect(await getWhatsAppNumberLimit(fakeDb({ accounts: [{ id: 'acc', plan: null }] }), 'acc')).toBe(1)
  })
})

describe('numberDisplayName', () => {
  it('prefers the label, then the display number, then the id tail', () => {
    expect(numberDisplayName({ label: ' Sales ', display_phone_number: '+91 1' })).toBe('Sales')
    expect(numberDisplayName({ label: '', display_phone_number: '+91 98765 43210' })).toBe('+91 98765 43210')
    expect(numberDisplayName({ phone_number_id: '1234567890' })).toBe('Number •••7890')
  })
})
