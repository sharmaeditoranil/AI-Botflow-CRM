// ------------------------------------------------------------
// Magic QR review drafts.
//
// Every happy customer used to get the same pre-written text, so a
// business's Google reviews read word-for-word alike (which Google
// treats as spam and filters). Each scan now gets its own draft: a
// randomly picked voice (opening, length, tone, English or Hinglish)
// that mentions one or two of the business's own keywords naturally,
// avoids the last few drafts, and stays generic — no invented names,
// prices or events — so the customer can post it as-is or add their
// own words.
// ------------------------------------------------------------

export interface DraftStyle {
  language: 'english' | 'hinglish'
  length: 'short' | 'medium' | 'long'
  opening: string
  tone: string
}

export interface DraftInput {
  businessName: string
  category?: string | null
  keywords: string[]
  /** Aspects the customer tapped ("What did you like?"). */
  liked?: string[]
  rating: number
  style: DraftStyle
  /** Recent drafts for this business — the new one must not echo them. */
  avoid?: string[]
}

type Rand = () => number

const pick = <T>(list: readonly T[], random: Rand): T => list[Math.floor(random() * list.length)]

const OPENINGS = [
  'start with how the visit or service felt overall',
  'start with the specific thing that impressed most',
  'start with a short exclamation, then explain',
  'start by saying what you came for',
  'start with a recommendation, then give the reason',
  'start with the staff or team',
] as const

const TONES = ['warm and friendly', 'calm and matter-of-fact', 'enthusiastic', 'grateful', 'concise and practical'] as const

export function pickStyle(random: Rand = Math.random): DraftStyle {
  return {
    language: random() < 0.6 ? 'english' : 'hinglish',
    length: pick(['short', 'medium', 'medium', 'long'] as const, random),
    opening: pick(OPENINGS, random),
    tone: pick(TONES, random),
  }
}

/** Owner keywords ("wedding photography, album design; video editing") → clean list. */
export function parseKeywords(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;\n]/) : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const k = String(p).trim().replace(/\s+/g, ' ').slice(0, 60)
    if (k && !seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase())
      out.push(k)
    }
  }
  return out.slice(0, 20)
}

/** 1–2 keywords for this draft: the customer's picks first, else random. */
export function chooseKeywords(input: Pick<DraftInput, 'keywords' | 'liked'>, random: Rand = Math.random): string[] {
  const liked = (input.liked ?? []).filter((k) => input.keywords.includes(k))
  if (liked.length > 0) return liked.slice(0, 2)
  const pool = [...input.keywords]
  const out: string[] = []
  const n = pool.length >= 2 && random() < 0.5 ? 2 : 1
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return out
}

const LENGTH_HINT = { short: '1–2 sentences (20–35 words)', medium: '2–3 sentences (35–60 words)', long: '3–4 sentences (60–90 words)' }

export function buildReviewPrompt(input: DraftInput, focus: string[]): string {
  const { style } = input
  const lang =
    style.language === 'hinglish'
      ? 'Hinglish (Hindi in Roman script mixed with English, the way people in India type on their phones)'
      : 'simple, natural Indian English'
  const sentiment = input.rating >= 5 ? 'very happy (5 stars)' : 'happy (4 stars) — positive but not over the top'
  const avoid = (input.avoid ?? []).slice(0, 8).map((d) => `- ${d.slice(0, 160)}`).join('\n')
  return `Write a Google review draft that a real customer of "${input.businessName}"${input.category ? ` (${input.category})` : ''} could post.

Customer is ${sentiment}.
Mention naturally (not as a list, not stuffed): ${focus.length ? focus.join(', ') : 'the service in general'}.
Language: ${lang}.
Length: ${LENGTH_HINT[style.length]}.
Voice: ${style.tone}; ${style.opening}.

Rules:
- Sound like one ordinary person, first person. Vary sentence structure.
- Do NOT invent facts: no staff names, prices, dates, product names or events.
- No hashtags, no quotes around the text, at most one emoji (or none).
- Do not start with "${input.businessName}" and do not repeat its name more than once.
${avoid ? `- Must read clearly different from these earlier drafts (different opening words and phrasing):\n${avoid}` : ''}

Reply with the review text only.`
}

/** Strip wrapping quotes / labels a model sometimes adds. */
export function cleanDraft(text: string): string {
  return text
    .trim()
    .replace(/^(review|draft)\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
    .slice(0, 600)
}

// ---------- offline fallback: still different each time ----------

const EN_OPEN = [
  'Really good experience here.',
  'Very happy with the service.',
  'Glad I chose this place.',
  'Had a great experience.',
  'Honestly impressed.',
  'Good experience overall.',
]
const EN_MID = [
  'The {k} was handled with care and the team explained everything clearly.',
  'Their {k} is genuinely good and the staff were helpful throughout.',
  'I came for {k} and the quality was better than I expected.',
  'Everything about the {k} felt professional and well organised.',
  'The team knows {k} well and was patient with all my questions.',
]
const EN_CLOSE = ['Would recommend.', 'Will definitely come back.', 'Recommended to friends already.', 'Worth it.', 'Thanks to the whole team.']
const HI_OPEN = ['Bahut accha experience raha.', 'Kaafi badhiya laga yahan.', 'Sach mein accha experience tha.', 'Yahan aakar khushi hui.']
const HI_MID = [
  '{k} ka kaam bahut acche se hua aur team ne sab clearly samjhaya.',
  'Inka {k} sach mein accha hai, staff bhi helpful hai.',
  '{k} ke liye aaya tha aur quality expectation se better thi.',
  '{k} me inki team ka experience saaf dikhta hai.',
]
const HI_CLOSE = ['Recommend karunga.', 'Dobara zaroor aaunga.', 'Sabko suggest karta hoon.', 'Thank you team!']

export function fallbackReview(input: DraftInput, focus: string[], random: Rand = Math.random): string {
  const hindi = input.style.language === 'hinglish'
  const k = focus[0] || input.category || 'service'
  const mid = pick(hindi ? HI_MID : EN_MID, random).replace('{k}', k)
  const parts = [pick(hindi ? HI_OPEN : EN_OPEN, random), mid]
  if (focus[1]) parts.push(hindi ? `${focus[1]} bhi accha laga.` : `The ${focus[1]} was good too.`)
  if (input.style.length !== 'short') parts.push(pick(hindi ? HI_CLOSE : EN_CLOSE, random))
  return parts.join(' ')
}
