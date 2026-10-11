import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  platformSecret: null as string | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: { meta_app_secret: h.platformSecret }, error: null }),
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/whatsapp/encryption', () => ({ decrypt: (v: string) => v }))
vi.mock('@/lib/social/meta-social', () => ({
  getFacebookUserProfile: vi.fn(),
  getInstagramUserProfile: vi.fn(),
}))
vi.mock('@/lib/ai/auto-reply', () => ({ dispatchInboundToAiReply: vi.fn() }))

import { POST } from './route'

// Not a page/instagram object, so a verified request returns early
// without touching any messaging tables.
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })

function sign(body: string, secret: string) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

function post(body: string, signature?: string) {
  return POST(
    new Request('http://localhost/api/meta/social/webhook', {
      method: 'POST',
      headers: signature ? { 'x-hub-signature-256': signature } : {},
      body,
    }),
  )
}

describe('POST /api/meta/social/webhook signature verification', () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = 'env-secret'
    h.platformSecret = null
  })
  afterEach(() => {
    delete process.env.META_APP_SECRET
  })

  it('rejects an unsigned request', async () => {
    expect((await post(BODY)).status).toBe(401)
  })

  it('rejects a request signed with an unknown secret', async () => {
    expect((await post(BODY, sign(BODY, 'attacker'))).status).toBe(401)
  })

  it('rejects a valid signature over a different body', async () => {
    const tampered = JSON.stringify({ object: 'page', entry: [{ id: 'x' }] })
    expect((await post(tampered, sign(BODY, 'env-secret'))).status).toBe(401)
  })

  it('accepts a request signed with META_APP_SECRET', async () => {
    expect((await post(BODY, sign(BODY, 'env-secret'))).status).toBe(200)
  })

  it('accepts a request signed with the platform_settings app secret', async () => {
    h.platformSecret = 'db-secret'
    expect((await post(BODY, sign(BODY, 'db-secret'))).status).toBe(200)
  })
})
