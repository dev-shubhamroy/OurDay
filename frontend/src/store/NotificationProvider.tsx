import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { browserTimezone, DEFAULT_PREFS, fetchNotifications, fetchPrefs, generateMine, isMissingBackend, markAllRead as dbMarkAllRead, markRead as dbMarkRead, savePrefs, unreadCount, withDefaults, type NotificationPrefs, type NotificationRow } from '../services/remote/notifications'
import { NotificationContext, type NotificationCtx } from './notificationContext'

const POLL_MS = 60_000

/**
 * Notification history + preferences, shared with the Mac companion through Supabase.
 * No browser timers decide WHEN a reminder happens: the database (pg_cron / generate_my_notifications) creates
 * the rows; this provider only reads them, so history is the same on every device. While the page is open it
 * polls once a minute and on focus, and asks the database to create anything newly due for this person.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.id ?? ''
  const [items, setItems] = useState<NotificationRow[]>([])
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const tzSynced = useRef(false)

  const refresh = useCallback(async () => {
    if (!supabase || !uid) return
    const my = ++seq.current
    const gen = await generateMine(supabase)
    if (isMissingBackend(gen.error)) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    const [list, p] = await Promise.all([fetchNotifications(supabase), fetchPrefs(supabase, uid)])
    if (my !== seq.current) return // a newer refresh superseded this one
    if (isMissingBackend(list.error) || isMissingBackend(p.error)) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    if (list.error || p.error) {
      setError('Couldn’t refresh notifications. Showing what was loaded earlier.')
      setLoading(false)
      return
    }
    setUnavailable(false)
    setError(null)
    setItems((list.data ?? []) as NotificationRow[])
    const merged = withDefaults(p.data as Partial<NotificationPrefs> | null)
    setPrefs(merged)
    setLoading(false)
    // Keep the stored timezone current (used for the 9:30 PM check-in and clock text on the server).
    if (!tzSynced.current) {
      tzSynced.current = true
      const tz = browserTimezone()
      if (!p.data || merged.timezone !== tz) void savePrefs(supabase, uid, { ...merged, timezone: tz })
    }
  }, [uid])

  useEffect(() => {
    queueMicrotask(() => void refresh())
    const t = setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const markRead = useCallback(
    async (id: string) => {
      if (!supabase) return
      const before = items
      setItems((xs) => xs.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)))
      const { error: e } = await dbMarkRead(supabase, id)
      if (e) setItems(before)
    },
    [items],
  )

  const markAllRead = useCallback(async () => {
    if (!supabase || !uid) return
    const before = items
    const at = new Date().toISOString()
    setItems((xs) => xs.map((x) => (x.read_at ? x : { ...x, read_at: at })))
    const { error: e } = await dbMarkAllRead(supabase, uid)
    if (e) setItems(before)
  }, [items, uid])

  const setPref = useCallback(
    async <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
      if (!supabase || !uid) return
      const before = prefs
      const next = { ...prefs, [key]: value }
      setPrefs(next)
      const { error: e } = await savePrefs(supabase, uid, next)
      if (e) {
        setPrefs(before)
        setError('Couldn’t save that setting. Try again.')
      } else void refresh()
    },
    [prefs, uid, refresh],
  )

  const value = useMemo<NotificationCtx>(
    () => ({ items, unread: unreadCount(items), prefs, loading, unavailable, error, refresh, markRead, markAllRead, setPref }),
    [items, prefs, loading, unavailable, error, refresh, markRead, markAllRead, setPref],
  )
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
