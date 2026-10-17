import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findOrCreateNumberConversation } from './number-conversation'

type Row = Record<string, unknown>

/** In-memory conversations table with the 057 unique rule enforced. */
function fakeDb(initial: Row[], opts: { raceOnInsert?: Row } = {}) {
  const rows = [...initial]
  const writes = { inserts: [] as Row[], updates: [] as { id: unknown; patch: Row }[] }
  const db = {
    from() {
      const eqs: [string, unknown][] = []
      const isNull: string[] = []
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      const match = () =>
        rows.filter(
          (r) => eqs.every(([c, v]) => r[c] === v) && isNull.every((c) => r[c] == null),
        )
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          eqs.push([c, v])
          if (mode === 'update') {
            const target = rows.find((r) => r[c] === v)
            if (target) Object.assign(target, payload)
            writes.updates.push({ id: v, patch: payload })
            return Promise.resolve({ error: null })
          }
          return b
        },
        is: (c: string) => {
          isNull.push(c)
          return b
        },
        order: () => b,
        limit: () => Promise.resolve({ data: match(), error: null }),
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
        single: async () => {
          writes.inserts.push(payload)
          if (opts.raceOnInsert) {
            rows.push(opts.raceOnInsert)
            return { data: null, error: { code: '23505', message: 'duplicate key' } }
          }
          const row = { id: `new-${writes.inserts.length}`, ...payload }
          rows.push(row)
          return { data: row, error: null }
        },
      }
      return b
    },
  } as unknown as SupabaseClient
  return { db, rows, writes }
}

const INPUT = { accountId: 'acc', contactId: 'ct', numberId: 'n-support', userId: 'u1' }

describe('findOrCreateNumberConversation', () => {
  it("returns the contact's chat on this number", async () => {
    const { db, writes } = fakeDb([
      { id: 'c-sales', account_id: 'acc', contact_id: 'ct', whatsapp_config_id: 'n-sales', channel: 'whatsapp' },
      { id: 'c-support', account_id: 'acc', contact_id: 'ct', whatsapp_config_id: 'n-support', channel: 'whatsapp' },
    ])
    const r = await findOrCreateNumberConversation(db, INPUT)
    expect(r).toEqual({ conversation: expect.objectContaining({ id: 'c-support' }), created: false })
    expect(writes.inserts).toHaveLength(0)
  })

  it("opens a separate chat when the contact only has one on another number", async () => {
    const { db, writes } = fakeDb([
      { id: 'c-sales', account_id: 'acc', contact_id: 'ct', whatsapp_config_id: 'n-sales', channel: 'whatsapp' },
    ])
    const r = await findOrCreateNumberConversation(db, INPUT)
    expect(r.created).toBe(true)
    expect(writes.inserts[0]).toMatchObject({ contact_id: 'ct', whatsapp_config_id: 'n-support' })
  })

  it('adopts a WhatsApp chat with no number instead of splitting history', async () => {
    const { db, writes } = fakeDb([
      { id: 'c-old', account_id: 'acc', contact_id: 'ct', whatsapp_config_id: null, channel: 'whatsapp' },
    ])
    const r = await findOrCreateNumberConversation(db, INPUT)
    expect(r).toEqual({ conversation: expect.objectContaining({ id: 'c-old' }), created: false })
    expect(writes.updates[0]).toEqual({ id: 'c-old', patch: { whatsapp_config_id: 'n-support' } })
    expect(writes.inserts).toHaveLength(0)
  })

  it('re-resolves the winner when a concurrent create wins the race', async () => {
    const winner = { id: 'c-race', account_id: 'acc', contact_id: 'ct', whatsapp_config_id: 'n-support', channel: 'whatsapp' }
    const { db } = fakeDb([], { raceOnInsert: winner })
    const r = await findOrCreateNumberConversation(db, INPUT)
    expect(r).toEqual({ conversation: expect.objectContaining({ id: 'c-race' }), created: false })
  })
})
