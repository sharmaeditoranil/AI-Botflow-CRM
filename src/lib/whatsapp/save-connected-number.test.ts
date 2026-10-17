import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pickNumberToConnect, saveConnectedNumber } from './save-connected-number'

type Row = Record<string, unknown>

function fakeAdmin(numbers: Row[], limit: number) {
  const inserts: Row[] = []
  const updates: { id: unknown; patch: Row }[] = []
  const db = {
    from(table: string) {
      const eqs: [string, unknown][] = []
      let countMode = false
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      const match = () => numbers.filter((r) => eqs.every(([c, v]) => r[c] === v))
      const b: Record<string, unknown> = {
        select: (_cols: string, opts?: { count?: string }) => {
          countMode = Boolean(opts?.count)
          return b
        },
        eq: (c: string, v: unknown) => {
          if (mode === 'update') {
            updates.push({ id: v, patch: payload })
            return Promise.resolve({ error: null })
          }
          eqs.push([c, v])
          return b
        },
        update: (p: Row) => {
          mode = 'update'
          payload = p
          return b
        },
        insert: (p: Row) => {
          mode = 'insert'
          payload = p
          return b
        },
        maybeSingle: async () => ({
          data: table === 'accounts' ? { plan: { max_whatsapp_numbers: limit } } : null,
          error: null,
        }),
        single: async () => {
          inserts.push(payload)
          return { data: { id: 'new-id' }, error: null }
        },
        then: (resolve: (r: unknown) => unknown) =>
          resolve(
            countMode
              ? { count: match().length, error: null }
              : { data: match(), error: null },
          ),
      }
      return b
    },
  } as unknown as SupabaseClient
  return { db, inserts, updates }
}

const INPUT = {
  accountId: 'acc',
  userId: 'u1',
  phoneNumberId: 'PN-2',
  wabaId: 'W1',
  encryptedAccessToken: 'enc',
  coexistence: false,
}

describe('saveConnectedNumber', () => {
  it('makes the first number the default', async () => {
    const { db, inserts } = fakeAdmin([], 1)
    const r = await saveConnectedNumber(db, INPUT)
    expect(r).toEqual({ ok: true, numberId: 'new-id', created: true })
    expect(inserts[0]).toMatchObject({ phone_number_id: 'PN-2', is_default: true })
  })

  it('adds a second number (not default) within the plan limit', async () => {
    const { db, inserts } = fakeAdmin([{ id: 'n1', account_id: 'acc', phone_number_id: 'PN-1' }], 3)
    const r = await saveConnectedNumber(db, INPUT)
    expect(r.ok).toBe(true)
    expect(inserts[0]).toMatchObject({ is_default: false })
  })

  it('refuses a new number beyond the plan limit', async () => {
    const { db, inserts } = fakeAdmin([{ id: 'n1', account_id: 'acc', phone_number_id: 'PN-1' }], 1)
    const r = await saveConnectedNumber(db, INPUT)
    expect(r).toMatchObject({ ok: false, code: 'number_limit_reached' })
    expect(inserts).toHaveLength(0)
  })

  it('updates (not duplicates) a number the account reconnects, even at the limit', async () => {
    const { db, inserts, updates } = fakeAdmin([{ id: 'n2', account_id: 'acc', phone_number_id: 'PN-2' }], 1)
    const r = await saveConnectedNumber(db, INPUT)
    expect(r).toEqual({ ok: true, numberId: 'n2', created: false })
    expect(inserts).toHaveLength(0)
    expect(updates[0].id).toBe('n2')
  })

  it("refuses a number owned by another account", async () => {
    const { db } = fakeAdmin([{ id: 'x', account_id: 'other', phone_number_id: 'PN-2' }], 5)
    expect(await saveConnectedNumber(db, INPUT)).toMatchObject({ ok: false, code: 'claimed' })
  })
})

describe('pickNumberToConnect', () => {
  it("prefers a WABA number the account hasn't connected yet", () => {
    expect(pickNumberToConnect([{ id: 'PN-1' }, { id: 'PN-2' }], ['PN-1'])?.id).toBe('PN-2')
  })
  it('falls back to the first number on a reconnect', () => {
    expect(pickNumberToConnect([{ id: 'PN-1' }], ['PN-1'])?.id).toBe('PN-1')
  })
  it('returns null when the WABA has no numbers', () => {
    expect(pickNumberToConnect([], [])).toBeNull()
  })
})
