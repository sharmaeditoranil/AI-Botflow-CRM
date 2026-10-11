import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ queried: 0 }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      h.queried++
      const chain = {
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
      }
      return chain
    },
  }),
}))

import { GET } from './route'

const SECRET = 'a'.repeat(64)

function req(headers: Record<string, string> = {}, query = '') {
  return new NextRequest(`http://localhost/api/broadcasts/process-scheduled${query}`, { headers })
}

describe('GET /api/broadcasts/process-scheduled', () => {
  beforeEach(() => {
    h.queried = 0
    process.env.AUTOMATION_CRON_SECRET = SECRET
  })
  afterEach(() => {
    delete process.env.AUTOMATION_CRON_SECRET
  })

  it('rejects callers without the cron secret and never touches the database', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(h.queried).toBe(0)
  })

  it('rejects a wrong secret', async () => {
    const res = await GET(req({ 'x-cron-secret': 'b'.repeat(64) }))
    expect(res.status).toBe(401)
    expect(h.queried).toBe(0)
  })

  it('fails closed when no secret is configured', async () => {
    delete process.env.AUTOMATION_CRON_SECRET
    const res = await GET(req({ 'x-cron-secret': '' }))
    expect(res.status).toBe(401)
    expect(h.queried).toBe(0)
  })

  it.each([
    ['x-cron-secret header', { 'x-cron-secret': SECRET }, ''],
    ['bearer token', { authorization: `Bearer ${SECRET}` }, ''],
    ['secret query param', {}, `?secret=${SECRET}`],
  ])('runs the sweep with a valid %s', async (_label, headers, query) => {
    const res = await GET(req(headers as Record<string, string>, query))
    expect(res.status).toBe(200)
    expect(h.queried).toBeGreaterThan(0)
  })
})
