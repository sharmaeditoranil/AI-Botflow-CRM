import { describe, expect, it } from 'vitest'
import { isWahaSessionLostError, wahaSendGapMs } from './session-guard'

describe('isWahaSessionLostError', () => {
  it('recognises a dropped WhatsApp Web session', () => {
    expect(isWahaSessionLostError('Session status is not as expected. Try again later or restart the session')).toBe(true)
    expect(isWahaSessionLostError('Connection Closed')).toBe(true)
  })

  it('ignores per-recipient errors', () => {
    expect(isWahaSessionLostError('Unprocessable Entity')).toBe(false)
    expect(isWahaSessionLostError('Invalid phone number format')).toBe(false)
    expect(isWahaSessionLostError(null)).toBe(false)
  })
})

describe('wahaSendGapMs', () => {
  it('stays between 1.5 and 3 seconds', () => {
    expect(wahaSendGapMs(() => 0)).toBe(1500)
    expect(wahaSendGapMs(() => 0.999)).toBeLessThan(3000)
  })
})
