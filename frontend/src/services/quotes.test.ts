import { describe, expect, it } from 'vitest'
import { cleanQuote, EMPTY_SELECTION, loadSelection, pickQuote, saveSelection, selectForBriefing } from './quotes'

const seq = (...n: number[]) => {
  let i = 0
  return () => n[i++ % n.length]
}
const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('cleanQuote', () => {
  it('requires text, trims, and makes the author optional', () => {
    expect(cleanQuote({ text: '   ' })).toEqual({ error: 'Write the quote first.' })
    expect(cleanQuote({ text: '  Keep   going ' })).toEqual({ text: 'Keep going', author: null })
    expect(cleanQuote({ text: 'x', author: '  Ada  Lovelace ' })).toEqual({ text: 'x', author: 'Ada Lovelace' })
    expect('error' in cleanQuote({ text: 'x'.repeat(501) })).toBe(true)
    expect('error' in cleanQuote({ text: 'x', author: 'a'.repeat(101) })).toBe(true)
  })
})

describe('pickQuote', () => {
  it('returns null with no quotes and the only quote when there is one', () => {
    expect(pickQuote([], [])).toBeNull()
    expect(pickQuote(['a'], [])?.id).toBe('a')
    expect(pickQuote(['a'], ['a'])?.id).toBe('a') // a single quote is shown every time
  })
  it('shows every quote once before any repeats, then starts a new cycle', () => {
    const ids = ['a', 'b', 'c', 'd']
    let history: string[] = []
    const shown: string[] = []
    for (let i = 0; i < 4; i++) {
      const p = pickQuote(ids, history, Math.random)!
      shown.push(p.id)
      history = p.history
    }
    expect([...shown].sort()).toEqual(ids)
    const next = pickQuote(ids, history, () => 0)!
    expect(next.id).not.toBe(shown[3]) // the new cycle never opens with the quote that just closed the last
    expect(next.history).toEqual([next.id])
  })
  it('ignores history entries for quotes that were deleted', () => {
    expect(pickQuote(['a', 'b'], ['gone', 'a'], () => 0)?.id).toBe('b')
  })
})

describe('selectForBriefing', () => {
  it('is stable for the same briefing (refresh) and changes for the next one', () => {
    const ids = ['a', 'b', 'c']
    const first = selectForBriefing(EMPTY_SELECTION, 'u:2026-11-09:0', ids, seq(0.1))
    const refresh = selectForBriefing(first.sel, 'u:2026-11-09:0', ids, seq(0.99))
    expect(refresh.id).toBe(first.id)
    const next = selectForBriefing(refresh.sel, 'u:2026-11-09:1', ids, seq(0.99))
    expect(next.id).not.toBe(first.id)
  })
  it('hides the section with no quotes, and re-picks if the chosen quote was deleted', () => {
    expect(selectForBriefing(EMPTY_SELECTION, 'k', []).id).toBeNull()
    const a = selectForBriefing(EMPTY_SELECTION, 'k', ['a', 'b'], () => 0)
    const gone = selectForBriefing(a.sel, 'k', ['b'], () => 0)
    expect(gone.id).toBe('b')
  })
  it('survives a restart (persisted selection)', () => {
    const store = mem()
    const a = selectForBriefing(EMPTY_SELECTION, 'k1', ['a', 'b', 'c'], seq(0.5))
    saveSelection('u', a.sel, store)
    const restored = loadSelection('u', store)
    expect(selectForBriefing(restored, 'k1', ['a', 'b', 'c'], seq(0.99)).id).toBe(a.id)
    expect(loadSelection('other', store)).toEqual(EMPTY_SELECTION)
    expect(loadSelection('u', { getItem: () => '{bad json' })).toEqual(EMPTY_SELECTION)
  })
})
