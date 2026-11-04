import { describe, expect, it } from 'vitest'
import { followupBlock } from './followup-guard'

const now = new Date('2026-11-05T10:00:00Z')
const base = { isOptedOut: false, tagNames: [], wabaId: '123', lastCustomerMessageAt: '2026-11-05T02:00:00Z', now }

describe('followupBlock', () => {
  it('lets a follow-up through inside the 24h window', () => {
    expect(followupBlock(base)).toBeNull()
  })

  it('blocks opted-out customers, by flag or Unsubscribed tag', () => {
    expect(followupBlock({ ...base, isOptedOut: true })).toEqual({ kind: 'opted_out' })
    expect(followupBlock({ ...base, tagNames: ['Interested', 'Unsubscribed'] })).toEqual({ kind: 'opted_out' })
    expect(followupBlock({ ...base, wabaId: 'waha', isOptedOut: true })).toEqual({ kind: 'opted_out' })
  })

  it('blocks free text on a Meta number after 24h, or with no customer message', () => {
    expect(followupBlock({ ...base, lastCustomerMessageAt: '2026-10-18T01:43:28Z' })).toEqual({ kind: 'window_closed' })
    expect(followupBlock({ ...base, lastCustomerMessageAt: null })).toEqual({ kind: 'window_closed' })
  })

  it('WhatsApp Web has no window', () => {
    expect(followupBlock({ ...base, wabaId: 'waha', lastCustomerMessageAt: '2026-10-18T01:43:28Z' })).toBeNull()
  })
})
