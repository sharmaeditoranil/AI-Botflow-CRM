import { wallClock, zonedInstant } from '@/lib/automations/schedule'

// ------------------------------------------------------------
// When to follow up, from what the customer wrote.
//
// "kal shaam 5 baje call karna", "Monday ko batata hoon", "10 tarikh ko
// payment karunga", "2 din baad" — the AI resolves these to a moment
// (it is given the current IST time); this module
//
//   - validates that moment (future, within 90 days), and
//   - parses the common Hindi / Hinglish / English phrasings itself, as
//     the fallback when the model is unavailable or returns nothing.
//
// Only a date → 10:00. Only a time → its next occurrence.
// ------------------------------------------------------------

export const FOLLOWUP_TIMEZONE = 'Asia/Kolkata'
const MIN_LEAD_MS = 5 * 60 * 1000
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000
const DEFAULT_HOUR = 10

/** A model-supplied follow-up time, if it is a real moment in range. */
export function acceptFollowupAt(value: unknown, now: Date = new Date()): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const delta = d.getTime() - now.getTime()
  if (delta < MIN_LEAD_MS || delta > MAX_AHEAD_MS) return null
  return d
}

/** 'YYYY-MM-DD' of an instant in IST — the deal's date column. */
export function followupDateString(d: Date, timezone = FOLLOWUP_TIMEZONE): string {
  const w = wallClock(d, timezone)
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`
}

const WEEKDAYS: [RegExp, number][] = [
  [/\b(sunday|ravivar|raviwar|itwar|itvaar|itvar)\b/, 0],
  [/\b(monday|somvar|somwar|somvaar)\b/, 1],
  [/\b(tuesday|mangalvar|mangalwar|mangalvaar)\b/, 2],
  [/\b(wednesday|budhvar|budhwar|budhvaar)\b/, 3],
  [/\b(thursday|guruvar|guruwar|veervar|virvar|brihaspativar)\b/, 4],
  [/\b(friday|shukravar|shukrawar|sukravar|shukarvar)\b/, 5],
  [/\b(saturday|shanivar|shaniwar|saniwar|shanivaar)\b/, 6],
]

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

interface LocalDay {
  year: number
  month: number
  day: number
}

function addDays(d: LocalDay, n: number): LocalDay {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n, 12))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

function weekdayOf(d: LocalDay): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day, 12)).getUTCDay()
}

function parseDay(text: string, today: LocalDay): { day: LocalDay; nextWeek: boolean } | null {
  const nextWeek = /\b(agle|agla|next)\b/.test(text)
  let m: RegExpExecArray | null

  if ((m = /(\d{1,2})\s*(?:din|days?)\s*(?:baad|bad|baadme|ke baad|later|after)/.exec(text)) ||
      (m = /\bafter\s+(\d{1,2})\s*days?\b/.exec(text))) {
    return { day: addDays(today, Number(m[1])), nextWeek: false }
  }
  if (/\b(parso|parson|parsoo|day after tomorrow)\b/.test(text)) return { day: addDays(today, 2), nextWeek: false }
  // "kal" is also yesterday: "kal order kiya tha" is not a follow-up.
  if (/\b(kal|kl)\b/.test(text) && /\b(tha|thi|the|gaya|gayi|kiya|liya|diya|aaya|aayi)\b/.test(text)) return null
  if (/\b(kal|kl|tomorrow|tmrw|tomorow|tommorow)\b/.test(text)) return { day: addDays(today, 1), nextWeek: false }
  if (/\b(aaj|aj|today|tonight)\b/.test(text)) return { day: today, nextWeek: false }

  for (const [re, wd] of WEEKDAYS) {
    if (re.test(text)) {
      let diff = (wd - weekdayOf(today) + 7) % 7
      if (nextWeek && diff === 0) diff = 7
      return { day: addDays(today, diff), nextWeek }
    }
  }

  // "15 november", "nov 15", "15th nov"
  if ((m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/.exec(text)) && MONTHS[m[2]]) {
    return { day: nearestDate(today, MONTHS[m[2]], Number(m[1])), nextWeek: false }
  }
  if ((m = /\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(text)) && MONTHS[m[1]]) {
    return { day: nearestDate(today, MONTHS[m[1]], Number(m[2])), nextWeek: false }
  }
  // dd/mm or dd-mm(-yyyy) — not dd.mm, which reads as "2.5 lakh"
  if ((m = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text))) {
    const day = Number(m[1])
    const month = Number(m[2])
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      if (m[3]) {
        const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
        return { day: { year: y, month, day }, nextWeek: false }
      }
      return { day: nearestDate(today, month, day), nextWeek: false }
    }
  }
  // "10 tarikh", "10 date", "10th"
  if ((m = /\b(\d{1,2})\s*(?:tarikh|tareekh|tarik|tareek|date|st|nd|rd|th)\b/.exec(text))) {
    const day = Number(m[1])
    if (day >= 1 && day <= 31) {
      let month = today.month
      let year = today.year
      if (day < today.day) {
        month = month === 12 ? 1 : month + 1
        if (month === 1) year++
      }
      return { day: { year, month, day }, nextWeek: false }
    }
  }
  return null
}

function nearestDate(today: LocalDay, month: number, day: number): LocalDay {
  const thisYear = { year: today.year, month, day }
  const past =
    month < today.month || (month === today.month && day < today.day)
  return past ? { year: today.year + 1, month, day } : thisYear
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const morning = /\b(subah|subha|savere|sawere|morning)\b/.test(text)
  const noon = /\b(dopahar|dophar|dopaher|afternoon)\b/.test(text)
  const evening = /\b(shaam|sham|evening|raat|night|tonight)\b/.test(text)

  let m: RegExpExecArray | null
  let hour: number | null = null
  let minute = 0
  let meridiem: 'am' | 'pm' | null = null

  // "5:30", or "5.30" only with am/pm/baje (a bare 12.50 is a price).
  if ((m = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/.exec(text)) ||
      (m = /\b(\d{1,2})\.(\d{2})\s*(am|pm|baje|bje)\b/.exec(text))) {
    hour = Number(m[1])
    minute = Number(m[2])
    meridiem = m[3] === 'am' || m[3] === 'pm' ? m[3] : null
  } else if ((m = /\b(\d{1,2})\s*(am|pm)\b/.exec(text))) {
    hour = Number(m[1])
    meridiem = m[2] as 'am' | 'pm'
  } else if ((m = /\b(\d{1,2})\s*(?:baje|bje|baj|o'?clock|bajkar|baje tak)\b/.exec(text))) {
    hour = Number(m[1])
  }
  if (hour === null || hour > 23 || minute > 59) return null

  if (hour <= 12) {
    if (meridiem === 'pm' || (!meridiem && (evening || noon))) {
      if (hour < 12) hour += 12
    } else if (meridiem === 'am' || (!meridiem && morning)) {
      if (hour === 12) hour = 0
    } else if (hour >= 1 && hour <= 7) {
      // "5 baje" with no qualifier, in a business chat, means 5 PM.
      hour += 12
    }
  }
  return { hour, minute }
}

/**
 * Rule-based fallback: the follow-up moment a message mentions, or null.
 * Needs at least a day or a time; ignores plain numbers (prices, counts).
 */
export function parseFollowupFromText(
  message: string,
  now: Date = new Date(),
  timezone = FOLLOWUP_TIMEZONE,
): Date | null {
  const text = message.toLowerCase()
  const w = wallClock(now, timezone)
  const today: LocalDay = { year: w.year, month: w.month, day: w.day }

  let m: RegExpExecArray | null
  if ((m = /\b(\d{1,2})\s*(?:ghante|ghanta|hours?|hrs?)\s*(?:baad|bad|me|mein|later)\b/.exec(text)) ||
      (m = /\bin\s+(\d{1,2})\s*(?:hours?|hrs?)\b/.exec(text))) {
    return acceptFollowupAt(new Date(now.getTime() + Number(m[1]) * 3_600_000).toISOString(), now)
  }

  const day = parseDay(text, today)
  const time = parseTime(text)
  if (!day && !time) return null

  let target: Date
  if (day) {
    const t = time ?? { hour: DEFAULT_HOUR, minute: 0 }
    target = zonedInstant(day.day.year, day.day.month, day.day.day, t.hour, t.minute, timezone)
  } else {
    target = zonedInstant(today.year, today.month, today.day, time!.hour, time!.minute, timezone)
    if (target.getTime() - now.getTime() < MIN_LEAD_MS) {
      const tomorrow = addDays(today, 1)
      target = zonedInstant(tomorrow.year, tomorrow.month, tomorrow.day, time!.hour, time!.minute, timezone)
    }
  }
  return acceptFollowupAt(target.toISOString(), now)
}

/** "Fri, 24 Oct, 5:00 pm" in IST, for prompts and notes. */
export function formatFollowupMoment(d: Date, timezone = FOLLOWUP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}
