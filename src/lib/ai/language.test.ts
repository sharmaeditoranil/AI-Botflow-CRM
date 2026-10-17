import { describe, expect, it } from 'vitest'
import { detectScript } from './language'

describe('detectScript', () => {
  it('detects Hindi written in Devanagari', () => {
    expect(detectScript(['नमस्ते, मुझे कोर्स की फीस बताइए'])).toBe('devanagari')
  })

  it('treats Hinglish as Latin script', () => {
    expect(detectScript(['Namaste! Mujhe course ki fees chahiye'])).toBe('latin')
  })

  it('detects Gujarati', () => {
    expect(detectScript(['નમસ્તે, ફી કેટલી છે?'])).toBe('gujarati')
  })

  it('goes by the dominant script when messages mix', () => {
    expect(detectScript(['ok', 'मुझे अगले बैच की जानकारी चाहिए'])).toBe('devanagari')
  })

  it('returns null for emoji / numbers only', () => {
    expect(detectScript(['👍', '123'])).toBeNull()
  })
})
