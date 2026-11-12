import { describe, expect, it } from 'vitest'
import {
  buildReviewPrompt,
  chooseKeywords,
  cleanDraft,
  fallbackReview,
  parseKeywords,
  pickStyle,
} from './review-draft'

const seq = (...vals: number[]) => {
  let i = 0
  return () => vals[i++ % vals.length]
}

describe('parseKeywords', () => {
  it('splits, trims and de-duplicates', () => {
    expect(parseKeywords('Wedding photography, album design;\nwedding photography ,  video editing')).toEqual([
      'Wedding photography',
      'album design',
      'video editing',
    ])
    expect(parseKeywords(undefined)).toEqual([])
  })
})

describe('chooseKeywords', () => {
  const keywords = ['wedding photography', 'album design', 'video editing']
  it('prefers what the customer liked', () => {
    expect(chooseKeywords({ keywords, liked: ['video editing'] })).toEqual(['video editing'])
  })
  it('picks 1–2 business keywords otherwise', () => {
    const k = chooseKeywords({ keywords }, seq(0.9, 0.1))
    expect(k.length).toBe(1)
    expect(keywords).toContain(k[0])
  })
})

describe('buildReviewPrompt', () => {
  it('carries business, keywords, style and the drafts to avoid', () => {
    const p = buildReviewPrompt(
      {
        businessName: 'Quick Art Photography Academy',
        category: 'Photography Class',
        keywords: ['wedding photography'],
        rating: 5,
        style: { language: 'hinglish', length: 'short', opening: 'start with the staff or team', tone: 'grateful' },
        avoid: ['Great place, loved it.'],
      },
      ['wedding photography'],
    )
    expect(p).toContain('Quick Art Photography Academy')
    expect(p).toContain('wedding photography')
    expect(p).toContain('Hinglish')
    expect(p).toContain('Great place, loved it.')
    expect(p).toContain('Do NOT invent facts')
  })
})

describe('fallbackReview', () => {
  it('produces varied drafts that use the keyword', () => {
    const base = {
      businessName: 'X',
      keywords: ['album design'],
      rating: 5,
    }
    const drafts = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const style = pickStyle()
      drafts.add(fallbackReview({ ...base, style }, ['album design']))
    }
    expect(drafts.size).toBeGreaterThan(10)
    for (const d of drafts) expect(d.toLowerCase()).toContain('album design')
  })
})

describe('fallbackReview phrasing', () => {
  it('lower-cases a keyword mid-sentence but keeps acronyms', () => {
    const style = { language: 'english' as const, length: 'short' as const, opening: '', tone: '' }
    const d = fallbackReview({ businessName: 'X', keywords: [], rating: 5, style }, ['Photography Class'], () => 0)
    expect(d).toContain('photography class')
    const a = fallbackReview({ businessName: 'X', keywords: [], rating: 5, style }, ['AI Video Editing'], () => 0)
    expect(a).toContain('AI video editing')
  })
})

describe('cleanDraft', () => {
  it('drops wrapping quotes and labels', () => {
    expect(cleanDraft('Review: "Nice place, good team."')).toBe('Nice place, good team.')
  })
})
