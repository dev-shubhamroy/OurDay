import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNow } from '../hooks/useNow'
import { useWorkspace } from '../hooks/useWorkspace'
import { friendlyWorkspaceError, isNetworkError } from '../lib/authErrors'
import { createDebouncer, watchTables, type SyncState } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import { toKey } from '../services/dates'
import { fetchSnapshot, insertHabit, insertTask, patchHabit, patchTask, removeHabit, removeTask, setTaskCompleted, writeMyHabitLog, type Ctx } from '../services/remote/data'
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
      dispatch({ type: 'replace', tasks: snap.tasks, habits: snap.habits })
      setLoadError(null)
      setOffline(false)
    } catch (e) {
      if (mine !== fetchSeq.current) return
      setOffline(true)
      if (!hasLoaded.current) setLoadError(isNetworkError(e) ? 'Can’t reach the server. Check your connection and try again.' : 'Something went wrong loading your data.')
    } finally {
      if (mine === fetchSeq.current) setLoading(false)
    }
  }, [wsId])

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
      if (document.visibilityState === 'visible') void refetch()
    }
    const onOnline = () => void refetch()
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => {
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

  /** Optimistic apply -> server write -> on failure re-fetch (reverts) and report. */
  const write = useCallback(
    async (op: () => Promise<{ message: string } | null>) => {
      inflightWrites.current++
      writeEpoch.current++
      let err: { message: string } | null = null
      try {
        err = await op()
      } catch (e) {
        err = { message: e instanceof Error ? e.message : 'error' }
      } finally {
        inflightWrites.current--
        writeEpoch.current++
      }
      if (err) {
        // Revert the optimistic change to the last state the server confirmed.
        dispatch({ type: 'replace', ...serverSnapshot.current })
        if (isNetworkError(err)) setOffline(true)
        setActionError({ id: ++errId.current, message: isNetworkError(err) ? 'You appear to be offline. That change wasn’t saved.' : /immutable|not_a_participant|row-level|permission/i.test(err.message) ? 'You don’t have permission to do that.' : friendlyWorkspaceError(err) === 'Something went wrong. Please try again.' ? 'That change couldn’t be saved. Please try again.' : friendlyWorkspaceError(err) })
      }
      void refetch()
    },
    [refetch],
  )

  const nowIso = () => new Date().toISOString()

  const toggleTask = useCallback(
    (id: string) => {
      const t = state.tasks.find((x) => x.id === id)
      if (!t || !ctx) return
      const completing = t.status !== 'completed'
      dispatch({ type: 'taskPatch', id, patch: completing ? { status: 'completed', completedAt: nowIso(), completedBy: uid } : { status: 'open', completedAt: undefined, completedBy: undefined } })
      if (completing) dispatch({ type: 'pulse' })
      void write(() => setTaskCompleted(ctx, id, completing))
    },
    [state.tasks, ctx, uid, write],
  )

  const addTask = useCallback(
    (i: NewTaskInput) => {
      if (!ctx) return
      const id = crypto.randomUUID()
      dispatch({
        type: 'task',
        task: { id, kind: i.kind, title: i.title.trim(), notes: i.notes?.trim() || undefined, createdBy: uid, createdAt: nowIso(), notifySecondUser: i.notifySecondUser, date: i.date, time: i.time, dueAt: i.dueAt, status: 'open' },
      })
      void write(() => insertTask(ctx, id, i))
    },
    [ctx, uid, write],
  )

  const updateTask = useCallback(
    (id: string, p: UpdateTaskInput) => {
      const t = state.tasks.find((x) => x.id === id)
      if (!t || !ctx) return
      dispatch({ type: 'taskPatch', id, patch: { ...p, notes: p.notes === undefined ? t.notes : p.notes || undefined } })
      void write(() => patchTask(ctx, id, p, t.kind))
    },
    [state.tasks, ctx, write],
  )

  const deleteTask = useCallback(
    (id: string) => {
      if (!ctx) return
      dispatch({ type: 'taskRemove', id })
      void write(() => removeTask(ctx, id))
    },
    [ctx, write],
  )

  const toggleHabit = useCallback(
    (id: string) => {
      const h = state.habits.find((x) => x.id === id)
      if (!h || !ctx || !h.participants.includes(uid)) return
      const done = h.log[uid]?.[today]?.status === 'done'
      dispatch({ type: 'log', id, user: uid, day: today, entry: done ? null : { status: 'done', at: nowIso() } })
      if (!done) dispatch({ type: 'pulse' })
      void write(() => writeMyHabitLog(ctx, id, today, done ? null : 'done'))
    },
    [state.habits, ctx, uid, today, write],
  )

  const markHabitMissed = useCallback(
    (id: string) => {
      const h = state.habits.find((x) => x.id === id)
      if (!h || !ctx || !h.participants.includes(uid)) return
      dispatch({ type: 'log', id, user: uid, day: today, entry: { status: 'missed' } })
      void write(() => writeMyHabitLog(ctx, id, today, 'missed'))
    },
    [state.habits, ctx, uid, today, write],
  )

  const addHabit = useCallback(
    (i: NewHabitInput) => {
      if (!ctx) return
      const id = crypto.randomUUID()
      dispatch({
        type: 'habit',
        habit: { id, title: i.title.trim(), notes: i.notes?.trim() || undefined, createdBy: uid, notifySecondUser: i.notifySecondUser, participants: i.shared ? memberIdsRef.current : [uid], schedule: i.schedule, paused: false, startDate: today, log: {} },
      })
      void write(() => insertHabit(ctx, id, i, today))
    },
    [ctx, uid, today, write],
  )

  const updateHabit = useCallback(
    (id: string, p: UpdateHabitInput) => {
      if (!ctx) return
      dispatch({ type: 'habitPatch', id, patch: { ...p, notes: p.notes === undefined ? undefined : p.notes || undefined } as Partial<Habit> })
      void write(() => patchHabit(ctx, id, p))
    },
    [ctx, write],
  )

  const setHabitPaused = useCallback((id: string, paused: boolean) => updateHabit(id, { paused }), [updateHabit])

  const deleteHabit = useCallback(
    (id: string) => {
      if (!ctx) return
      dispatch({ type: 'habitRemove', id })
      void write(() => removeHabit(ctx, id))
    },
    [ctx, write],
  )

  const syncInfo = useMemo<SyncInfo>(
    () => ({ remote: true, state: offline ? 'offline' : sync === 'live' ? 'live' : 'polling', loading, loadError, actionError, retry: () => void refetch() }),
    [offline, sync, loading, loadError, actionError, refetch],
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
    }),
    [syncInfo, users, me, partner, now, today, state, toggleTask, toggleHabit, setHabitPaused, addTask, addHabit, updateTask, deleteTask, updateHabit, deleteHabit, markHabitMissed],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
