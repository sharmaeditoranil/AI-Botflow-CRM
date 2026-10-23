import { describe, expect, it } from 'vitest'
import { cronToSimple, dueSlot, nextRun, readSchedule, scheduleProblem, zonedInstant } from './schedule'

const IST = 'Asia/Kolkata'
// 2026-10-23 is a Friday.
const at = (iso: string) => new Date(iso)

describe('zonedInstant', () => {
  it('converts IST wall-clock time to the right instant', () => {
    expect(zonedInstant(2026, 10, 23, 5, 30, IST).toISOString()).toBe('2026-10-23T00:00:00.000Z')
  })
})

describe('weekly', () => {
  const everyFriday = { repeat: 'weekly', weekdays: [5], time: '05:30', timezone: IST }

  it('is due on Friday 05:30 IST and a few minutes after', () => {
    expect(dueSlot(everyFriday, at('2026-10-23T00:00:00Z'))?.toISOString()).toBe('2026-10-23T00:00:00.000Z')
    expect(dueSlot(everyFriday, at('2026-10-23T00:07:00Z'))?.toISOString()).toBe('2026-10-23T00:00:00.000Z')
  })

  it('is not due before the time, long after it, or on other days', () => {
    expect(dueSlot(everyFriday, at('2026-10-22T23:59:00Z'))).toBeNull()
    expect(dueSlot(everyFriday, at('2026-10-23T01:00:00Z'))).toBeNull()
    expect(dueSlot(everyFriday, at('2026-10-24T00:00:00Z'))).toBeNull()
  })

  it('next run is the following Friday once this one has passed', () => {
    expect(nextRun(everyFriday, at('2026-10-23T00:00:00Z'))?.toISOString()).toBe('2026-10-30T00:00:00.000Z')
  })

  it('handles several weekdays (every Sunday and Wednesday)', () => {
    const s = { repeat: 'weekly', weekdays: [0, 3], time: '10:00', timezone: IST }
    // Fri 23 Oct → next is Sun 25 Oct 10:00 IST = 04:30Z
    expect(nextRun(s, at('2026-10-23T06:00:00Z'))?.toISOString()).toBe('2026-10-25T04:30:00.000Z')
  })
})

describe('monthly', () => {
  it('runs on the 1st of every month', () => {
    const s = { repeat: 'monthly', month_days: [1], time: '09:00', timezone: IST }
    expect(nextRun(s, at('2026-10-23T00:00:00Z'))?.toISOString()).toBe('2026-11-01T03:30:00.000Z')
  })

  it('"last day" lands on the 28th in February', () => {
    const s = { repeat: 'monthly', month_days: [-1], time: '18:00', timezone: IST }
    expect(nextRun(s, at('2027-02-01T00:00:00Z'))?.toISOString()).toBe('2027-02-28T12:30:00.000Z')
  })

  it('skips months that lack the day (31st)', () => {
    const s = { repeat: 'monthly', month_days: [31], time: '09:00', timezone: IST }
    // From 1 Nov: November has no 31st → 31 Dec.
    expect(nextRun(s, at('2026-11-01T00:00:00Z'))?.toISOString()).toBe('2026-12-31T03:30:00.000Z')
  })
})

describe('once', () => {
  const thisSunday = { repeat: 'once', date: '2026-10-25', time: '10:00', timezone: IST }

  it('runs on that date only', () => {
    expect(nextRun(thisSunday, at('2026-10-23T00:00:00Z'))?.toISOString()).toBe('2026-10-25T04:30:00.000Z')
    expect(dueSlot(thisSunday, at('2026-10-25T04:31:00Z'))?.toISOString()).toBe('2026-10-25T04:30:00.000Z')
  })

  it('has no next run after it has passed', () => {
    expect(nextRun(thisSunday, at('2026-10-26T00:00:00Z'))).toBeNull()
  })
})

describe('daily', () => {
  it('runs every day at the time', () => {
    const s = { repeat: 'daily', time: '21:15', timezone: IST }
    expect(nextRun(s, at('2026-10-23T16:00:00Z'))?.toISOString()).toBe('2026-10-24T15:45:00.000Z')
  })
})

describe('legacy cron', () => {
  it('keeps running "30 5 * * 5" as Friday 05:30 in IST', () => {
    const cfg = { schedule: '30 5 * * 5' }
    expect(dueSlot(cfg, at('2026-10-23T00:02:00Z'))?.toISOString()).toBe('2026-10-23T00:00:00.000Z')
    expect(dueSlot(cfg, at('2026-10-22T00:02:00Z'))).toBeNull()
    expect(nextRun(cfg, at('2026-10-23T00:00:00Z'))?.toISOString()).toBe('2026-10-30T00:00:00.000Z')
  })

  it('maps simple cron onto the simple form', () => {
    expect(cronToSimple('30 5 * * 5')).toEqual({ repeat: 'weekly', time: '05:30', timezone: IST, weekdays: [5] })
    expect(cronToSimple('0 9 1 * *')).toEqual({ repeat: 'monthly', time: '09:00', timezone: IST, month_days: [1] })
    expect(cronToSimple('0 9 * * *')).toEqual({ repeat: 'daily', time: '09:00', timezone: IST })
    expect(cronToSimple('*/15 * * * *')).toBeNull()
  })

  it('treats a bare HH:MM as daily', () => {
    expect(readSchedule({ schedule: '09:30' })).toEqual({
      kind: 'simple',
      schedule: { repeat: 'daily', time: '09:30', timezone: IST },
    })
  })

  it('rejects garbage', () => {
    expect(readSchedule({ schedule: 'every friday' })).toBeNull()
    expect(dueSlot({ schedule: '99 99 * * *' }, new Date())).toBeNull()
  })
})

describe('scheduleProblem', () => {
  it('asks for the missing piece', () => {
    expect(scheduleProblem({ repeat: 'weekly', time: '09:00', timezone: IST, weekdays: [] })).toBe(
      'choose at least one day',
    )
    expect(scheduleProblem({ repeat: 'once', time: '09:00', timezone: IST })).toBe('choose a date')
    expect(scheduleProblem({ repeat: 'daily', time: '', timezone: IST })).toBe('choose a time')
    expect(scheduleProblem({ repeat: 'daily', time: '09:00', timezone: IST })).toBeNull()
  })
})
