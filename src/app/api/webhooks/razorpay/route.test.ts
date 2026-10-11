import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  platformSecret: null as string | null,
  triggers: [] as { secret_key: string; account_id: string }[],
  accountUpdates: [] as { values: Record<string, unknown>; id: unknown }[],
  invoiceInserts: [] as Record<string, unknown>[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = { data: table === 'webhook_triggers' ? h.triggers : [], error: null }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        limit: () => chain,
        update: (values: Record<string, unknown>) => ({
          eq: (_col: string, id: unknown) => {
            if (table === 'accounts') h.accountUpdates.push({ values, id })
            return Promise.resolve({ data: null, error: null })
          },
        }),
        insert: (row: Record<string, unknown>) => {
          if (table === 'invoices') h.invoiceInserts.push(row)
          return Promise.resolve({ data: null, error: null })
        },
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
      }
      return chain
    },
  }),
}))

vi.mock('@/lib/billing/razorpay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/razorpay')>()
  return {
    ...actual,
    getRazorpayCredentials: async () => ({
      keyId: null,
      keySecret: null,
      webhookSecret: h.platformSecret,
    }),
  }
})
vi.mock('@/lib/webhooks/incoming-trigger', () => ({
  processIncomingWebhook: vi.fn(),
  findSmartPhone: () => null,
  findSmartName: () => null,
  flattenPayload: () => ({}),
}))
vi.mock('@/lib/automations/engine', () => ({ executeAutomation: vi.fn() }))
vi.mock('@/lib/whatsapp/resolve-conversation', () => ({ resolveConversationByPhone: vi.fn() }))

import { POST } from './route'

let seq = 0
function capturedEvent(notes: Record<string, string>) {
  seq++
  return JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: { id: `pay_${seq}`, order_id: `order_${seq}`, amount: 99900, currency: 'INR', notes },
      },
    },
  })
}

function sign(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('hex')
}

function post(body: string, signature: string | null) {
  return POST(
    new NextRequest('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: signature ? { 'x-razorpay-signature': signature } : {},
      body,
    }),
  )
}

describe('POST /api/webhooks/razorpay', () => {
  beforeEach(() => {
    h.platformSecret = 'platform-secret'
    h.triggers = [{ secret_key: 'tenant-secret', account_id: 'tenant-acc' }]
    h.accountUpdates = []
    h.invoiceInserts = []
  })

  it('upgrades the plan for a platform-signed payment', async () => {
    const body = capturedEvent({ accountId: 'acc-1', planId: 'plan-pro' })
    const res = await post(body, sign(body, 'platform-secret'))
    expect(res.status).toBe(200)
    expect(h.accountUpdates).toHaveLength(1)
    expect(h.accountUpdates[0].id).toBe('acc-1')
    expect(h.invoiceInserts).toHaveLength(1)
  })

  it('rejects a forged signature and changes nothing', async () => {
    const body = capturedEvent({ accountId: 'acc-1', planId: 'plan-pro' })
    const res = await post(body, sign(body, 'attacker'))
    expect(res.status).toBe(400)
    expect(h.accountUpdates).toHaveLength(0)
    expect(h.invoiceInserts).toHaveLength(0)
  })

  it('rejects unsigned-equivalent requests even when no platform secret is configured', async () => {
    h.platformSecret = null
    const body = capturedEvent({ accountId: 'acc-1', planId: 'plan-pro' })
    const res = await post(body, sign(body, 'attacker'))
    expect(res.status).toBe(400)
    expect(h.accountUpdates).toHaveLength(0)
  })

  it('never lets a tenant-signed event change plans or invoices', async () => {
    const body = capturedEvent({ accountId: 'victim-acc', planId: 'plan-pro' })
    const res = await post(body, sign(body, 'tenant-secret'))
    expect(res.status).toBe(200)
    expect(h.accountUpdates).toHaveLength(0)
    expect(h.invoiceInserts).toHaveLength(0)
  })
})
