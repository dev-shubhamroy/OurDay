/** Inspiration Library: pure rules (validation + which quote a briefing shows). No React, no network. */

export interface Quote {
  id: string
  text: string
  author: string | null
  createdAt: string
}

export const QUOTE_MAX = 500
export const AUTHOR_MAX = 100
export const QUOTE_LIMIT = 200

export type QuoteInput = { text: string; author?: string }

/** Trims input; returns an error message or the cleaned value. */
export function cleanQuote(input: QuoteInput): { error: string } | { text: string; author: string | null } {
  const text = input.text.replace(/\s+/g, ' ').trim()
  const author = (input.author ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { error: 'Write the quote first.' }
  if (text.length > QUOTE_MAX) return { error: `Keep it under ${QUOTE_MAX} characters.` }
  if (author.length > AUTHOR_MAX) return { error: `Keep the author under ${AUTHOR_MAX} characters.` }
  return { text, author: author || null }
}

// ---- which quote a briefing shows -------------------------------------------------------------------------

/**
 * Picks the next quote. Quotes already shown in the current cycle are skipped until every saved quote has been
 * shown once; then a new cycle starts (never opening it with the quote that just closed the previous one, when
 * there is a choice). `rand` is injectable so tests are deterministic.
 */
export function pickQuote(ids: string[], history: string[], rand: () => number = Math.random): { id: string; history: string[] } | null {
  if (ids.length === 0) return null
  const live = history.filter((h) => ids.includes(h))
  let cycle = live
  let pool = ids.filter((i) => !cycle.includes(i))
  if (pool.length === 0) {
    const last = live[live.length - 1]
    cycle = []
    pool = ids.length > 1 ? ids.filter((i) => i !== last) : ids
  }
  const id = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
  return { id, history: [...cycle, id] }
}

export interface QuoteSelection {
  /** Quotes shown in the current cycle, oldest first. */
  history: string[]
  /** The quote chosen for the briefing identified by `key`. Stays put until the key changes. */
  current: { key: string; id: string } | null
  /** Counts finished briefings; part of the key, so the next briefing gets a new pick. */
  seq: number
}

export const EMPTY_SELECTION: QuoteSelection = { history: [], current: null, seq: 0 }

/** The quote for briefing `key`: the remembered one if the key and quote still exist, otherwise a fresh pick. */
export function selectForBriefing(sel: QuoteSelection, key: string, ids: string[], rand: () => number = Math.random): { sel: QuoteSelection; id: string | null } {
  if (ids.length === 0) return { sel, id: null }
  if (sel.current && sel.current.key === key && ids.includes(sel.current.id)) return { sel, id: sel.current.id }
  const p = pickQuote(ids, sel.history, rand)
  if (!p) return { sel, id: null }
  return { sel: { ...sel, history: p.history, current: { key, id: p.id } }, id: p.id }
}

const selKey = (uid: string) => `ourday:quote-selection:${uid}`

export function loadSelection(uid: string, storage: Pick<Storage, 'getItem'> = localStorage): QuoteSelection {
  try {
    const v = JSON.parse(storage.getItem(selKey(uid)) ?? 'null') as Partial<QuoteSelection> | null
    if (!v || !Array.isArray(v.history)) return EMPTY_SELECTION
    return { history: v.history.filter((x) => typeof x === 'string'), current: v.current && typeof v.current.key === 'string' && typeof v.current.id === 'string' ? v.current : null, seq: typeof v.seq === 'number' ? v.seq : 0 }
  } catch {
    return EMPTY_SELECTION
  }
}

export function saveSelection(uid: string, sel: QuoteSelection, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(selKey(uid), JSON.stringify(sel))
  } catch {
    /* storage unavailable: the pick simply isn't remembered */
  }
}
