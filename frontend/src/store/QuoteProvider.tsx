import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { createDebouncer, watchTables } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import { cleanQuote, loadSelection, QUOTE_LIMIT, saveSelection, selectForBriefing, type Quote, type QuoteSelection } from '../services/quotes'
import { deleteQuote, fetchQuotes, insertQuote, isMissingQuotesBackend, quoteFromRow, updateQuote, type QuoteRow } from '../services/remote/quotes'
import { QuoteContext, type QuoteCtx } from './quoteContext'

const cacheKey = (uid: string) => `ourday:quotes:${uid}`
const readCache = (uid: string): Quote[] => {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(uid)) ?? '[]') as Quote[]
    return Array.isArray(v) ? v.filter((q) => q && typeof q.id === 'string' && typeof q.text === 'string') : []
  } catch {
    return []
  }
}
const writeCache = (uid: string, q: Quote[]) => {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify(q))
  } catch {
    /* best effort */
  }
}

/**
 * Each person's own quotes. Real mode: Supabase table `inspiration_quotes` (RLS: owner only), live-synced across
 * devices and cached locally so they show offline. Demo mode (no Supabase): kept in this browser only.
 */
export function QuoteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.id ?? 'demo'
  const remote = !!supabase && !!user
  const [quotes, setQuotes] = useState<Quote[]>(() => readCache(uid))
  const [loading, setLoading] = useState(remote)
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Loaded synchronously the first time it is needed (a child may render before any effect runs).
  const selStore = useRef<{ uid: string; sel: QuoteSelection } | null>(null)
  const getSel = useCallback((): QuoteSelection => {
    if (selStore.current?.uid !== uid) selStore.current = { uid, sel: loadSelection(uid) }
    return selStore.current.sel
  }, [uid])
  const setSel = useCallback(
    (sel: QuoteSelection) => {
      selStore.current = { uid, sel }
      saveSelection(uid, sel)
    },
    [uid],
  )
  const loadedFor = useRef('')
  const seq = useRef(0)
  const quotesRef = useRef(quotes)
  useEffect(() => {
    quotesRef.current = quotes
  }, [quotes])

  // Per-person state when the signed-in person changes.
  useEffect(() => {
    if (loadedFor.current === uid) return
    loadedFor.current = uid
    queueMicrotask(() => setQuotes(readCache(uid)))
  }, [uid])

  const commit = useCallback(
    (next: Quote[]) => {
      setQuotes(next)
      writeCache(uid, next)
    },
    [uid],
  )

  const refetch = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false)
      return
    }
    const my = ++seq.current
    const { data, error: e } = await fetchQuotes(supabase)
    if (my !== seq.current) return
    if (isMissingQuotesBackend(e)) {
      setAvailable(false)
      setLoading(false)
      return
    }
    if (e) {
      setError('Couldn’t refresh your quotes. Showing what was saved on this device.')
      setLoading(false)
      return
    }
    setAvailable(true)
    setError(null)
    commit(((data ?? []) as QuoteRow[]).map(quoteFromRow))
    setLoading(false)
  }, [user, commit])

  useEffect(() => {
    if (!remote || !supabase || !user) return
    queueMicrotask(() => void refetch())
    const debounced = createDebouncer(() => void refetch(), 250)
    const stop = watchTables(supabase, `ourday:quotes:${user.id}`, [{ table: 'inspiration_quotes', filter: `user_id=eq.${user.id}` }], () => debounced.trigger(), () => undefined)
    const onOnline = () => void refetch()
    window.addEventListener('online', onOnline)
    return () => {
      debounced.cancel()
      stop()
      window.removeEventListener('online', onOnline)
    }
  }, [remote, user, refetch])

  const add = useCallback(
    async (text: string, author?: string) => {
      const c = cleanQuote({ text, author })
      if ('error' in c) return c.error
      if (quotesRef.current.length >= QUOTE_LIMIT) return `Your library is full (${QUOTE_LIMIT} quotes). Delete one to add another.`
      const id = crypto.randomUUID()
      const q: Quote = { id, text: c.text, author: c.author, createdAt: new Date().toISOString() }
      if (!remote || !supabase) {
        commit([...quotesRef.current, q])
        return null
      }
      const before = quotesRef.current
      commit([...before, q])
      const { error: e } = await insertQuote(supabase, id, c.text, c.author)
      if (e) {
        commit(before)
        return /quote_limit/.test(e.message) ? 'Your library is full. Delete one to add another.' : 'Couldn’t save that quote. Check your connection and try again.'
      }
      return null
    },
    [remote, commit],
  )

  const edit = useCallback(
    async (id: string, text: string, author?: string) => {
      const c = cleanQuote({ text, author })
      if ('error' in c) return c.error
      const before = quotesRef.current
      commit(before.map((q) => (q.id === id ? { ...q, text: c.text, author: c.author } : q)))
      if (!remote || !supabase) return null
      const { error: e } = await updateQuote(supabase, id, c.text, c.author)
      if (e) {
        commit(before)
        return 'Couldn’t save that change. Check your connection and try again.'
      }
      return null
    },
    [remote, commit],
  )

  const remove = useCallback(
    async (id: string) => {
      const before = quotesRef.current
      commit(before.filter((q) => q.id !== id))
      if (!remote || !supabase) return null
      const { error: e } = await deleteQuote(supabase, id)
      if (e) {
        commit(before)
        return 'Couldn’t delete that quote. Check your connection and try again.'
      }
      return null
    },
    [remote, commit],
  )

  const quoteForBriefing = useCallback(
    (day: string): Quote | null => {
      const list = quotes
      const cur = getSel()
      const key = `${uid}:${day}:${cur.seq}`
      const r = selectForBriefing(cur, key, list.map((q) => q.id))
      if (r.sel !== cur) setSel(r.sel)
      return r.id ? (list.find((q) => q.id === r.id) ?? null) : null
    },
    [uid, quotes, getSel, setSel],
  )

  const finishBriefing = useCallback(() => {
    const cur = getSel()
    setSel({ ...cur, seq: cur.seq + 1, current: null })
  }, [getSel, setSel])

  const value = useMemo<QuoteCtx>(() => ({ quotes, loading, available, error, add, edit, remove, quoteForBriefing, finishBriefing }), [quotes, loading, available, error, add, edit, remove, quoteForBriefing, finishBriefing])
  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>
}
