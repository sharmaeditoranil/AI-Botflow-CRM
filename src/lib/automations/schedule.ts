// ------------------------------------------------------------
// Time-based automation schedules.
//
// One module, used by both the builder (to show "Next run: …") and the
// cron scheduler (to decide what is due), so the two can never disagree.
//
// A schedule is a wall-clock time in a timezone plus a repeat rule:
//
//   once     — a single date            ("this Sunday at 10:00")
//   daily    — every day
//   weekly   — chosen weekdays          ("every Friday", "Mon–Fri")
//   monthly  — chosen days of the month ("every 1st", "last day")
//
// Older automations saved a cron expression in `schedule`; those keep
// working (5-field cron, evaluated in the same timezone) and the builder
// offers them in the simple form when the expression maps onto one.
// ------------------------------------------------------------

export type ScheduleRepeat = 'once' | 'daily' | 'weekly' | 'monthly'

export interface SimpleSchedule {
  repeat: ScheduleRepeat
  /** 'HH:MM', 24-hour, in `timezone`. */
  time: string
  /** IANA zone, e.g. 'Asia/Kolkata'. */
  timezone: string
  /** once: 'YYYY-MM-DD'. */
  date?: string
  /** weekly: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[]
  /** monthly: 1–31; -1 = last day of the month. */
  month_days?: number[]
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

/** How far back the scheduler looks for a slot it hasn't run yet. A
 *  short window so a cron outage doesn't replay old slots for hours. */
export const DUE_WINDOW_MS = 15 * 60 * 1000

// ---------- timezone helpers (no dependencies) ----------------------

interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: number // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Wall-clock parts of an instant in a timezone. */
export function wallClock(instant: Date, timezone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

/** The instant at which the given wall-clock time occurs in `timezone`. */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  // Offset of the zone at (roughly) that moment; a second pass settles
  // DST transitions.
  let guess = asUtc
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(guess), timezone)
    const shown = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
    guess = guess - (shown - asUtc)
  }
  return new Date(guess)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? '')
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// ---------- validation ----------------------------------------------

/** Human-readable problem with a simple schedule, or null when valid. */
export function scheduleProblem(s: SimpleSchedule): string | null {
  if (!['once', 'daily', 'weekly', 'monthly'].includes(s.repeat)) return 'choose how often it runs'
  if (!parseTime(s.time)) return 'choose a time'
  if (!isValidTimezone(s.timezone)) return 'choose a valid timezone'
  if (s.repeat === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(s.date ?? '')) return 'choose a date'
  if (s.repeat === 'weekly' && !(s.weekdays ?? []).some((d) => d >= 0 && d <= 6)) return 'choose at least one day'
  if (s.repeat === 'monthly' && !(s.month_days ?? []).some((d) => d === -1 || (d >= 1 && d <= 31))) {
    return 'choose at least one date'
  }
  return null
}

// ---------- simple schedule evaluation -------------------------------

function dayMatches(s: SimpleSchedule, year: number, month: number, day: number, weekday: number): boolean {
  switch (s.repeat) {
    case 'daily':
      return true
    case 'weekly':
      return (s.weekdays ?? []).includes(weekday)
    case 'monthly': {
      const days = s.month_days ?? []
      return days.includes(day) || (days.includes(-1) && day === daysInMonth(year, month))
    }
    case 'once': {
      const [y, m, d] = (s.date ?? '').split('-').map(Number)
      return y === year && m === month && d === day
    }
  }
}

/** Scheduled instants of a simple schedule, in order, starting at the
 *  local day that contains `from`. */
function* simpleSlots(s: SimpleSchedule, from: Date, maxDays: number): Generator<Date> {
  const t = parseTime(s.time)
  if (!t || scheduleProblem(s)) return
  const start = wallClock(from, s.timezone)
  // Walk local calendar days via a UTC-noon anchor so DST never skips one.
  const anchor = Date.UTC(start.year, start.month - 1, start.day, 12)
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(anchor + i * 86_400_000)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    if (dayMatches(s, year, month, day, d.getUTCDay())) {
      yield zonedInstant(year, month, day, t.hour, t.minute, s.timezone)
    }
  }
}

// ---------- legacy cron (5 fields) ------------------------------------

function cronField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim())
    if (!m) return null
    const step = m[2] ? Number(m[2]) : 1
    let lo = min
    let hi = max
    if (m[1] !== '*') {
      const [a, b] = m[1].split('-').map(Number)
      lo = a
      hi = b ?? (m[2] ? max : a)
    }
    if (lo < min || hi > max || lo > hi || step < 1) return null
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

interface ParsedCron {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
  domStar: boolean
  dowStar: boolean
}

export function parseCron(expr: string): ParsedCron | null {
  const f = expr?.trim().split(/\s+/) ?? []
  if (f.length !== 5) return null
  const minute = cronField(f[0], 0, 59)
  const hour = cronField(f[1], 0, 23)
  const dom = cronField(f[2], 1, 31)
  const month = cronField(f[3], 1, 12)
  const dowRaw = cronField(f[4].replace(/\b7\b/g, '0'), 0, 6)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  return { minute, hour, dom, month, dow: dowRaw, domStar: f[2] === '*', dowStar: f[4] === '*' }
}

function cronMatches(c: ParsedCron, w: WallClock): boolean {
  if (!c.minute.has(w.minute) || !c.hour.has(w.hour) || !c.month.has(w.month)) return false
  // Standard cron: when both day fields are restricted, either may match.
  if (c.domStar && c.dowStar) return true
  if (c.domStar) return c.dow.has(w.weekday)
  if (c.dowStar) return c.dom.has(w.day)
  return c.dom.has(w.day) || c.dow.has(w.weekday)
}

/** The simple form of a cron expression when there is one
 *  (e.g. "30 5 * * 5" → weekly on Friday at 05:30). */
export function cronToSimple(expr: string, timezone = DEFAULT_TIMEZONE): SimpleSchedule | null {
  const c = parseCron(expr)
  if (!c || c.minute.size !== 1 || c.hour.size !== 1 || c.month.size !== 12) return null
  const time = `${String([...c.hour][0]).padStart(2, '0')}:${String([...c.minute][0]).padStart(2, '0')}`
  if (c.domStar && c.dowStar) return { repeat: 'daily', time, timezone }
  if (c.domStar) return { repeat: 'weekly', time, timezone, weekdays: [...c.dow].sort() }
  if (c.dowStar) return { repeat: 'monthly', time, timezone, month_days: [...c.dom].sort((a, b) => a - b) }
  return null
}

// ---------- public evaluation ----------------------------------------

/** Read a stored trigger config into a schedule we can evaluate. */
export function readSchedule(
  config: Record<string, unknown> | null | undefined,
): { kind: 'simple'; schedule: SimpleSchedule } | { kind: 'cron'; cron: ParsedCron; timezone: string } | null {
  const cfg = config ?? {}
  const timezone =
    typeof cfg.timezone === 'string' && isValidTimezone(cfg.timezone) ? cfg.timezone : DEFAULT_TIMEZONE
  if (typeof cfg.repeat === 'string') {
    const s: SimpleSchedule = {
      repeat: cfg.repeat as ScheduleRepeat,
      time: typeof cfg.time === 'string' ? cfg.time : '',
      timezone,
      date: typeof cfg.date === 'string' ? cfg.date : undefined,
      weekdays: Array.isArray(cfg.weekdays) ? (cfg.weekdays as unknown[]).map(Number) : undefined,
      month_days: Array.isArray(cfg.month_days) ? (cfg.month_days as unknown[]).map(Number) : undefined,
    }
    return scheduleProblem(s) ? null : { kind: 'simple', schedule: s }
  }
  if (typeof cfg.schedule === 'string') {
    const raw = cfg.schedule.trim()
    // "HH:MM" alone meant "every day at that time".
    if (parseTime(raw)) return { kind: 'simple', schedule: { repeat: 'daily', time: raw, timezone } }
    const cron = parseCron(raw)
    if (cron) return { kind: 'cron', cron, timezone }
  }
  return null
}

/**
 * The scheduled instant that is due at `now`: the latest slot in
 * (now − DUE_WINDOW_MS, now], or null. The scheduler runs a slot only
 * once (it records each run), so the window just absorbs a late tick.
 */
export function dueSlot(
  config: Record<string, unknown> | null | undefined,
  now: Date,
): Date | null {
  const r = readSchedule(config)
  if (!r) return null
  const earliest = now.getTime() - DUE_WINDOW_MS

  if (r.kind === 'cron') {
    // Walk minutes back from now.
    const startMinute = Math.floor(now.getTime() / 60_000) * 60_000
    for (let t = startMinute; t > earliest; t -= 60_000) {
      if (cronMatches(r.cron, wallClock(new Date(t), r.timezone))) return new Date(t)
    }
    return null
  }

  let due: Date | null = null
  for (const slot of simpleSlots(r.schedule, new Date(earliest - 86_400_000), 3)) {
    const t = slot.getTime()
    if (t > earliest && t <= now.getTime()) due = slot
    if (t > now.getTime()) break
  }
  return due
}

/** The next scheduled instant strictly after `after`, or null if none
 *  (a past one-time date, or an invalid schedule). */
export function nextRun(
  config: Record<string, unknown> | null | undefined,
  after: Date = new Date(),
): Date | null {
  const r = readSchedule(config)
  if (!r) return null
  if (r.kind === 'cron') {
    const start = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000
    for (let i = 0; i < 366 * 1440; i++) {
      const t = start + i * 60_000
      if (cronMatches(r.cron, wallClock(new Date(t), r.timezone))) return new Date(t)
    }
    return null
  }
  for (const slot of simpleSlots(r.schedule, after, 400)) {
    if (slot.getTime() > after.getTime()) return slot
  }
  return null
}
