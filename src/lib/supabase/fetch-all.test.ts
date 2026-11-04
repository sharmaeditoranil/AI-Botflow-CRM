import { describe, expect, it } from 'vitest'
import { IN_CHUNK, PAGE_SIZE, fetchAllRows, fetchInChunks } from './fetch-all'

const table = Array.from({ length: 4039 }, (_, i) => ({ id: i }))

describe('fetchAllRows', () => {
  it('reads past the 1000-row cap', async () => {
    const calls: [number, number][] = []
    const rows = await fetchAllRows((from, to) => {
      calls.push([from, to])
      return Promise.resolve({ data: table.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null })
    })
    expect(rows).toHaveLength(4039)
    expect(calls).toHaveLength(5)
  })

  it('stops after an exact multiple with one empty page', async () => {
    const rows = await fetchAllRows((from, to) =>
      Promise.resolve({ data: table.slice(0, 2000).slice(from, to + 1), error: null }),
    )
    expect(rows).toHaveLength(2000)
  })

  it('throws on error', async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: 'boom' } })),
    ).rejects.toThrow('boom')
  })
})

describe('fetchInChunks', () => {
  it('splits long key lists', async () => {
    const sizes: number[] = []
    const keys = table.map((r) => r.id)
    const rows = await fetchInChunks(keys, (chunk) => {
      sizes.push(chunk.length)
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null })
    })
    expect(rows).toHaveLength(4039)
    expect(Math.max(...sizes)).toBe(IN_CHUNK)
  })
})
