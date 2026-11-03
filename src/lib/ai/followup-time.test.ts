import { describe, expect, it } from 'vitest'
import {
  acceptFollowupAt,
  followupDateString,
  parseFollowupFromText,
} from './followup-time'

// Tuesday 3 Nov 2026, 12:00 IST.
const NOW = new Date('2026-11-03T06:30:00Z')
const ist = (s: string) => new Date(`${s}+05:30`).toISOString()
const parse = (msg: string) => parseFollowupFromText(msg, NOW)?.toISOString() ?? null

describe('parseFollowupFromText', () => {
  it('reads relative days, defaulting to 10:00', () => {
    expect(parse('kal baat karte hain')).toBe(ist('2026-11-04T10:00:00'))
    expect(parse('parso call karna')).toBe(ist('2026-11-05T10:00:00'))
    expect(parse('I will confirm tomorrow')).toBe(ist('2026-11-04T10:00:00'))
    expect(parse('3 din baad batata hoon')).toBe(ist('2026-11-06T10:00:00'))
  })

  it('reads day + time with Hindi qualifiers', () => {
    expect(parse('kal shaam 5 baje call karna')).toBe(ist('2026-11-04T17:00:00'))
    expect(parse('kal subah 9 baje')).toBe(ist('2026-11-04T09:00:00'))
    expect(parse('tomorrow 11:30 am')).toBe(ist('2026-11-04T11:30:00'))
    expect(parse('aaj raat 8 baje')).toBe(ist('2026-11-03T20:00:00'))
  })

  it('treats a bare 1–7 as PM', () => {
    expect(parse('kal 4 baje')).toBe(ist('2026-11-04T16:00:00'))
  })

  it('a time alone means its next occurrence', () => {
    expect(parse('5 baje call karo')).toBe(ist('2026-11-03T17:00:00'))
    expect(parse('11 am pe baat karte hain')).toBe(ist('2026-11-04T11:00:00'))
  })

  it('reads weekdays, English and Hindi', () => {
    expect(parse('Friday ko payment karunga')).toBe(ist('2026-11-06T10:00:00'))
    expect(parse('somvar ko milte hain')).toBe(ist('2026-11-09T10:00:00'))
    expect(parse('agle tuesday')).toBe(ist('2026-11-10T10:00:00'))
  })

  it('reads dates', () => {
    expect(parse('10 tarikh ko payment')).toBe(ist('2026-11-10T10:00:00'))
    expect(parse('1 tarikh ko')).toBe(ist('2026-12-01T10:00:00'))
    expect(parse('15/11 ko aaunga')).toBe(ist('2026-11-15T10:00:00'))
    expect(parse('20 november 3 pm')).toBe(ist('2026-11-20T15:00:00'))
  })

  it('reads hours from now', () => {
    expect(parse('2 ghante baad call karo')).toBe(new Date(NOW.getTime() + 2 * 3_600_000).toISOString())
  })

  it('ignores prices and plain numbers', () => {
    expect(parse('price 5000 hai kya?')).toBeNull()
    expect(parse('2.5 lakh budget hai')).toBeNull()
    expect(parse('I am interested, send details')).toBeNull()
    expect(parse('12.50 per piece')).toBeNull()
    expect(parse('kal order kiya tha abhi tak nahi aaya')).toBeNull()
  })

  it('rejects dates beyond 90 days', () => {
    expect(parse('15/06/2027 ko')).toBeNull()
  })
})

describe('acceptFollowupAt', () => {
  it('accepts a future ISO time in range', () => {
    expect(acceptFollowupAt('2026-11-04T17:00:00+05:30', NOW)?.toISOString()).toBe(ist('2026-11-04T17:00:00'))
  })
  it('rejects past, garbage and null', () => {
    expect(acceptFollowupAt('2026-11-01T10:00:00+05:30', NOW)).toBeNull()
    expect(acceptFollowupAt('soon', NOW)).toBeNull()
    expect(acceptFollowupAt(null, NOW)).toBeNull()
  })
})

describe('followupDateString', () => {
  it('uses the IST calendar day', () => {
    // 23:30 IST on the 4th is still the 4th in IST (18:00Z).
    expect(followupDateString(new Date(ist('2026-11-04T23:30:00')))).toBe('2026-11-04')
    expect(followupDateString(new Date('2026-11-04T19:00:00Z'))).toBe('2026-11-05')
  })
})
