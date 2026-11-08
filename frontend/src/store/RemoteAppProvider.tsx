import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNow } from '../hooks/useNow'
import { useWorkspace } from '../hooks/useWorkspace'
import { friendlyWorkspaceError, isNetworkError } from '../lib/authErrors'
import { createDebouncer, watchTables, type SyncState } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import { toKey } from '../services/dates'
import { fetchSnapshot, type Ctx } from '../services/remote/data'
import { reopenSharedRpc, requestCompletionRpc, reviewCompletionRpc, sendReminderRpc, sharedErrorMessage } from '../services/remote/shared'
import { loadDataCache, saveDataCache } from '../services/offline/cache'
import { enqueue, loadQueue, opActions, saveQueue, type Op, type QueuedOp } from '../services/offline/queue'
import { runOp } from '../services/offline/run'
import { initialsOf, pendingPartner } from '../services/remote/mappers'
import { reducer } from '../services/remote/state'
import type { Habit, Task, User } from '../types'
import { AppContext, type AppCtx, type NewHabitInput, type NewTaskInput, type SyncInfo, type UpdateHabitInput, type UpdateTaskInput } from './appContext'

const POLL_MS = 20_000

/**
 * The real, shared data source: tasks and habits live in Supabase and stay in sync through Realtime.
 * - Writes are optimistic, then confirmed by a re-fetch (the server is the source of truth).
 * - Every realtime event and every reconnect triggers a debounced re-fetch, so payloads are never trusted.
 * - Stale reads are discarded: a fetch that started before a newer fetch or any in-flight write is ignored.
 * - If realtime drops, the app polls and re-fetches on focus / when the network returns.
 */
export function RemoteAppProvider({ children }: { children: ReactNode }) {
  const now = useNow()
  const { user } = useAuth()
  const ws = useWorkspace()
  const [state, dispatch] = useReducer(reducer, { tasks: [], habits: [], pulse: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncState>('connecting')
  const [offline, setOffline] = useState(false)
  const [actionError, setActionError] = useState<{ id: number; message: string } | null>(null)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const uid = user?.id ?? ''
  const wsId = ws.workspace?.id ?? ''
  const memberKey = ws.members.map((m) => m.id).join(',')
  const memberIds = useMemo(() => (memberKey ? memberKey.split(',') : []), [memberKey])
  const today = toKey(now)

  // ---- identities from real profiles (never hardcoded) -------------------------------------------
  const { users, me, partner } = useMemo(() => {
    const toUser = (id: string, name: string, tone: User['tone']): User => ({ id, name, initials: initialsOf(name), tone })
    const meM = ws.members.find((m) => m.id === uid)
    const other = ws.members.find((m) => m.id !== uid)
    const meU = toUser(uid, meM?.name ?? user?.name ?? 'Me', 'you')
    const partnerU = other ? toUser(other.id, other.name, 'partner') : pendingPartner()
    return { users: [meU, partnerU], me: meU, partner: partnerU }
  }, [ws.members, uid, user?.name])

  // ---- fetching with stale-result protection ------------------------------------------------------
  const serverSnapshot = useRef<{ tasks: Task[]; habits: Habit[] }>({ tasks: [], habits: [] })
  /** True once a first successful load has happened; later failures only show the offline state. */
  const hasLoaded = useRef(false)
  const fetchSeq = useRef(0)
  const inflightWrites = useRef(0)
  const writeEpoch = useRef(0)
  const memberIdsRef = useRef(memberIds)
  useEffect(() => {
    memberIdsRef.current = memberIds
  }, [memberIds])
  const refetchRef = useRef<() => void>(() => undefined)
  /** Changes waiting to reach the server (persisted, so they survive closing the app while offline). */
  const queueRef = useRef<QueuedOp[]>([])
  const flushing = useRef(false)
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  /** Re-applies queued changes on top of a server snapshot, so unsynced work never disappears from the screen. */
  const withQueue = useCallback((snap: { tasks: Task[]; habits: Habit[] }) => {
    let st = { tasks: snap.tasks, habits: snap.habits, pulse: 0 }
    for (const q of queueRef.current) for (const a of opActions(q.op, { memberIds: memberIdsRef.current })) st = reducer(st, a)
    return st
  }, [])
  const setQueue = useCallback(
    (q: QueuedOp[]) => {
      queueRef.current = q
      if (uid) saveQueue(uid, q)
      setPending(q.length)
    },
    [uid],
  )

  // Offline start: show the last known data immediately (with queued changes applied), then refresh.
  const hydrated = useRef('')
  useEffect(() => {
    if (!uid || !wsId || hydrated.current === uid) return
    hydrated.current = uid
    queueRef.current = loadQueue(uid)
    queueMicrotask(() => {
      setPending(queueRef.current.length)
      const c = loadDataCache(uid)
      if (!c) return
      serverSnapshot.current = { tasks: c.tasks, habits: c.habits }
      hasLoaded.current = true
      const st = withQueue(c)
      dispatch({ type: 'replace', tasks: st.tasks, habits: st.habits })
      setLastSyncedAt(c.at)
      setLoading(false)
    })
  }, [uid, wsId, withQueue])

  const refetch = useCallback(async () => {
    if (!supabase || !wsId) return
    const mine = ++fetchSeq.current
    const epoch = writeEpoch.current
    try {
      const snap = await fetchSnapshot(supabase, memberIdsRef.current)
      if (mine !== fetchSeq.current) return // a newer fetch superseded this one
      if (inflightWrites.current > 0 || epoch !== writeEpoch.current) {
        // A write happened while we were fetching: this snapshot may predate it. Discard and try again shortly.
        setTimeout(() => refetchRef.current(), 250)
        return
      }
      serverSnapshot.current = snap
      hasLoaded.current = true
      if (uid) saveDataCache(uid, snap.tasks, snap.habits)
      const shown = queueRef.current.length > 0 ? withQueue(snap) : snap
      dispatch({ type: 'replace', tasks: shown.tasks, habits: shown.habits })
      setLastSyncedAt(new Date().toISOString())
      setLoadError(null)
      setOffline(false)
    } catch (e) {
      if (mine !== fetchSeq.current) return
      setOffline(true)
      if (!hasLoaded.current) setLoadError(isNetworkError(e) ? 'Can’t reach the server. Check your connection and try again.' : 'Something went wrong loading your data.')
    } finally {
      if (mine === fetchSeq.current) setLoading(false)
    }
  }, [wsId, uid, withQueue])

  useEffect(() => {
    refetchRef.current = () => void refetch()
  }, [refetch])

  // Initial load + realtime subscription
  useEffect(() => {
    if (!supabase || !wsId) return
    queueMicrotask(() => void refetch())
    const debounced = createDebouncer(() => void refetch(), 200)
    const stop = watchTables(
      supabase,
      `ourday:data:${wsId}`,
      [
        { table: 'tasks', filter: `workspace_id=eq.${wsId}` },
        { table: 'habits', filter: `workspace_id=eq.${wsId}` },
        { table: 'habit_logs', filter: `workspace_id=eq.${wsId}` },
      ],
      () => debounced.trigger(),
      setSync,
    )
    return () => {
      debounced.cancel()
      stop()
    }
  }, [wsId, refetch])

  // Members changing (partner joined) changes who "shared" habits include.
  useEffect(() => {
    if (wsId && memberKey) queueMicrotask(() => void refetch())
  }, [wsId, memberKey, refetch])

  // Fallback: poll while realtime is down; always refresh when the tab returns or the network comes back.
  useEffect(() => {
    if (!wsId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void flushRef.current()
        void refetch()
      }
    }
    const onOnline = () => {
      void flushRef.current()
      void refetch()
    }
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => {
      if (queueRef.current.length > 0) void flushRef.current()
      if (sync !== 'live' || offline) void refetch()
    }, POLL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    }
  }, [wsId, sync, offline, refetch])

  // ---- writes ------------------------------------------------------------------------------------
  const ctx = useMemo<Ctx | null>(() => (supabase && wsId && uid ? { client: supabase, workspaceId: wsId, userId: uid } : null), [wsId, uid])
  const errId = useRef(0)
  const inflightQid = useRef<string | null>(null)

  const report = useCallback((err: { message: string }) => {
    setActionError({
      id: ++errId.current,
      message: /immutable|not_a_participant|row-level|permission/i.test(err.message)
        ? 'You don’t have permission to do that.'
        : friendlyWorkspaceError(err) === 'Something went wrong. Please try again.'
          ? 'That change couldn’t be saved. Please try again.'
          : friendlyWorkspaceError(err),
    })
  }, [])

  /**
   * Sends queued changes in order. A network failure keeps the change queued (and the optimistic state on screen);
   * a real rejection (permissions, validation) drops that one change, tells the user, and the re-fetch shows the truth.
   */
  const flush = useCallback(async () => {
    if (!ctx || flushing.current || queueRef.current.length === 0) return
    flushing.current = true
    setSyncing(true)
    inflightWrites.current++
    writeEpoch.current++
    let dropped = false
    try {
      while (queueRef.current.length > 0) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setOffline(true)
          break
        }
        const head = queueRef.current[0]
        inflightQid.current = head.qid
        let err: { message: string } | null
        try {
          err = await runOp(ctx, head.op)
        } catch (e) {
          err = { message: e instanceof Error ? e.message : 'error' }
        }
        inflightQid.current = null
        if (err && isNetworkError(err)) {
          setOffline(true)
          break
        }
        setQueue(queueRef.current.filter((q) => q.qid !== head.qid))
        if (err) {
          dropped = true
          report(err)
        }
      }
    } finally {
      inflightQid.current = null
      inflightWrites.current--
      writeEpoch.current++
      flushing.current = false
      setSyncing(false)
    }
    if (dropped || queueRef.current.length === 0) void refetch()
  }, [ctx, refetch, report, setQueue])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  // Anything left from a previous session goes out as soon as we know who we are.
  useEffect(() => {
    if (ctx) queueMicrotask(() => void flushRef.current())
  }, [ctx])

  /** Optimistic apply -> persist in the queue -> send. Works identically online and offline. */
  const submit = useCallback(
    (op: Op) => {
      if (!ctx) return
      for (const a of opActions(op, { memberIds: memberIdsRef.current })) dispatch(a)
      setQueue(enqueue(queueRef.current, { qid: crypto.randomUUID(), op }, inflightQid.current))
      void flushRef.current()
    },
    [ctx, setQueue],
  )

  const nowIso = () => new Date().toISOString()

  const toggleTask = useCallback(
    (id: string) => {
      const t = state.tasks.find((x) => x.id === id)
      if (!t || !ctx || t.kind === 'shared') return // shared tasks complete only through the approval flow
      const completing = t.status !== 'completed'
      if (completing) dispatch({ type: 'pulse' })
      submit({ type: 'task.complete', id, completed: completing, by: uid, at: nowIso() })
    },
    [state.tasks, ctx, uid, submit],
  )

  const addTask = useCallback(
    (i: NewTaskInput) => {
      if (!ctx) return
      submit({ type: 'task.insert', id: crypto.randomUUID(), input: i, createdBy: uid, at: nowIso() })
    },
    [ctx, uid, submit],
  )

  const updateTask = useCallback(
    (id: string, p: UpdateTaskInput) => {
      const t = state.tasks.find((x) => x.id === id)
      if (!t || !ctx) return
      submit({ type: 'task.patch', id, patch: p, kind: t.kind })
    },
    [state.tasks, ctx, submit],
  )

  const deleteTask = useCallback(
    (id: string) => {
      if (!ctx) return
      submit({ type: 'task.delete', id })
    },
    [ctx, submit],
  )

  const toggleHabit = useCallback(
    (id: string) => {
      const h = state.habits.find((x) => x.id === id)
      if (!h || !ctx || !h.participants.includes(uid)) return
      const done = h.log[uid]?.[today]?.status === 'done'
      if (!done) dispatch({ type: 'pulse' })
      submit({ type: 'habit.log', habitId: id, day: today, status: done ? null : 'done', by: uid, at: nowIso() })
    },
    [state.habits, ctx, uid, today, submit],
  )

  const markHabitMissed = useCallback(
    (id: string) => {
      const h = state.habits.find((x) => x.id === id)
      if (!h || !ctx || !h.participants.includes(uid)) return
      submit({ type: 'habit.log', habitId: id, day: today, status: 'missed', by: uid, at: nowIso() })
    },
    [state.habits, ctx, uid, today, submit],
  )

  const addHabit = useCallback(
    (i: NewHabitInput) => {
      if (!ctx) return
      submit({ type: 'habit.insert', id: crypto.randomUUID(), input: i, startDate: today, createdBy: uid })
    },
    [ctx, uid, today, submit],
  )

  const updateHabit = useCallback(
    (id: string, p: UpdateHabitInput) => {
      if (!ctx) return
      submit({ type: 'habit.patch', id, patch: p })
    },
    [ctx, submit],
  )

  const setHabitPaused = useCallback((id: string, paused: boolean) => updateHabit(id, { paused }), [updateHabit])

  const deleteHabit = useCallback(
    (id: string) => {
      if (!ctx) return
      submit({ type: 'habit.delete', id })
    },
    [ctx, submit],
  )

  // ---- shared tasks: server-side state machine (needs a connection; nothing is faked offline) -------------------
  const sharedCall = useCallback(
    async (run: (c: Ctx['client']) => PromiseLike<{ data: unknown; error: { message?: string; details?: string | null; code?: string } | null }>): Promise<{ error: string | null; data: unknown }> => {
      if (!ctx) return { error: 'Please sign in again.', data: null }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: sharedErrorMessage({ message: 'Failed to fetch' }), data: null }
      try {
        const { data, error } = await run(ctx.client)
        void refetch() // both people converge on the server's state right away (realtime does the same for the other device)
        return { error: error ? sharedErrorMessage(error) : null, data }
      } catch (e) {
        return { error: sharedErrorMessage({ message: e instanceof Error ? e.message : '' }), data: null }
      }
    },
    [ctx, refetch],
  )
  const requestCompletion = useCallback(async (id: string) => (await sharedCall((c) => requestCompletionRpc(c, id))).error, [sharedCall])
  const reviewCompletion = useCallback(async (id: string, approve: boolean) => (await sharedCall((c) => reviewCompletionRpc(c, id, approve))).error, [sharedCall])
  const reopenShared = useCallback(async (id: string) => (await sharedCall((c) => reopenSharedRpc(c, id))).error, [sharedCall])
  const remindPartner = useCallback(
    async (id: string, message: string): Promise<string | { delivered: boolean }> => {
      const r = await sharedCall((c) => sendReminderRpc(c, id, message))
      return r.error ?? { delivered: (r.data as { delivered?: boolean } | null)?.delivered !== false }
    },
    [sharedCall],
  )

  const syncInfo = useMemo<SyncInfo>(
    () => ({ remote: true, state: offline ? 'offline' : sync === 'live' ? 'live' : 'polling', loading, loadError, actionError, pending, syncing, lastSyncedAt, retry: () => { void flushRef.current(); void refetch() } }),
    [offline, sync, loading, loadError, actionError, pending, syncing, lastSyncedAt, refetch],
  )

  const value = useMemo<AppCtx>(
    () => ({
      sync: syncInfo,
      users,
      me,
      partner,
      userById: (id: string) => users.find((u) => u.id === id) ?? { id, name: 'Former member', initials: '?', tone: 'partner' },
      now,
      today,
      tasks: state.tasks,
      habits: state.habits,
      pulse: state.pulse,
      toggleTask,
      toggleHabit,
      setHabitPaused,
      addTask,
      addHabit,
      updateTask,
      deleteTask,
      updateHabit,
      deleteHabit,
      markHabitMissed,
      requestCompletion,
      reviewCompletion,
      reopenShared,
      remindPartner,
    }),
    [syncInfo, users, me, partner, now, today, state, toggleTask, toggleHabit, setHabitPaused, addTask, addHabit, updateTask, deleteTask, updateHabit, deleteHabit, markHabitMissed, requestCompletion, reviewCompletion, reopenShared, remindPartner],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
