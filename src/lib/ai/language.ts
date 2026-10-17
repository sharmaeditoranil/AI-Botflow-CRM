// ------------------------------------------------------------
// Reply-language helpers.
//
// Follow-ups and other proactive messages must go out in the language
// the customer actually chats in — not a hard-coded English/Hinglish.
// The model is the real language judge (it is told to mirror the
// customer's language AND script); this module only supplies:
//
//   - detectScript(): which writing system the customer uses, so the
//     no-AI fallback can still pick a sensible language, and
//   - LANGUAGE_MIRROR_RULE: the prompt instruction itself.
// ------------------------------------------------------------

export type Script =
  | 'devanagari'
  | 'gujarati'
  | 'gurmukhi'
  | 'bengali'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'odia'
  | 'arabic'
  | 'latin'

const RANGES: [Script, RegExp][] = [
  ['devanagari', /[ऀ-ॿ]/g],
  ['bengali', /[ঀ-৿]/g],
  ['gurmukhi', /[਀-੿]/g],
  ['gujarati', /[઀-૿]/g],
  ['odia', /[଀-୿]/g],
  ['tamil', /[஀-௿]/g],
  ['telugu', /[ఀ-౿]/g],
  ['kannada', /[ಀ-೿]/g],
  ['malayalam', /[ഀ-ൿ]/g],
  ['arabic', /[؀-ۿ]/g],
  ['latin', /[A-Za-z]/g],
]

/**
 * The dominant writing system across the customer's messages, or null
 * when they contain no letters at all (only emoji / numbers / media).
 */
export function detectScript(texts: string[]): Script | null {
  const joined = texts.join(' ')
  let best: Script | null = null
  let bestCount = 0
  for (const [script, re] of RANGES) {
    const count = joined.match(re)?.length ?? 0
    if (count > bestCount) {
      best = script
      bestCount = count
    }
  }
  return best
}

/** The prompt rule that makes the model reply in the customer's language. */
export const LANGUAGE_MIRROR_RULE =
  "Write in the SAME language and the SAME script the customer uses in the conversation above — " +
  'e.g. Hindi in Devanagari if they write Hindi in Devanagari, Hinglish in Roman letters if they write Hinglish, ' +
  'Marathi, Gujarati, Tamil, Bengali or English exactly as they do. Base this on the customer\'s own messages, ' +
  'not on the business\'s messages. If the customer has not written anything yet, use the language of the most recent message; ' +
  'if there is none, use English.'
