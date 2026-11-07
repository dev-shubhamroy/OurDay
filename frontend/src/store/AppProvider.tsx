import { useCallback, useMemo, useReducer, type ReactNode } from 'react'
import { createSeed, ME, USERS } from '../data/mock'
import { useNow } from '../hooks/useNow'
import { toKey } from '../services/dates'
import type { Habit, Task } from '../types'
import { AppContext, type NewHabitInput, type NewTaskInput, type SyncInfo, type UpdateHabitInput, type UpdateTaskInput } from './appContext'

interface State {
  tasks: Task[]
  habits: Habit[]
  pulse: number
}

type Action =
  | { type: 'toggleTask'; id: string; at: string }
  | { type: 'toggleHabit'; id: string; user: string; day: string; at: string }
  | { type: 'pauseHabit'; id: string; paused: boolean }
  | { type: 'addTask'; task: Task }
  | { type: 'addHabit'; habit: Habit }
  | { type: 'updateTask'; id: string; patch: UpdateTaskInput }
  | { type: 'deleteTask'; id: string }
  | { type: 'updateHabit'; id: string; patch: UpdateHabitInput }
  | { type: 'deleteHabit'; id: string }
  | { type: 'missHabit'; id: string; user: string; day: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'toggleTask': {
      let completed = false
      const tasks = state.tasks.map((t) => {
        if (t.id !== action.id) return t
        if (t.status === 'completed') return { ...t, status: 'open' as const, completedAt: undefined, completedBy: undefined }
        completed = true
        return { ...t, status: 'completed' as const, completedAt: action.at, completedBy: ME }
      })
      return { ...state, tasks, pulse: completed ? state.pulse + 1 : state.pulse }
    }
    case 'toggleHabit': {
      // Only the acting user's own record changes; a partner's record is never touched.
      let completed = false
      const habits = state.habits.map((h) => {
        if (h.id !== action.id || !h.participants.includes(action.user)) return h
        const mine = { ...(h.log[action.user] ?? {}) }
        if (mine[action.day]?.status === 'done') delete mine[action.day]
        else {
          mine[action.day] = { status: 'done', at: action.at }
          completed = true
        }
        return { ...h, log: { ...h.log, [action.user]: mine } }
      })
      return { ...state, habits, pulse: completed ? state.pulse + 1 : state.pulse }
    }
    case 'pauseHabit':
      return { ...state, habits: state.habits.map((h) => (h.id === action.id ? { ...h, paused: action.paused } : h)) }
    case 'addTask':
      return { ...state, tasks: [...state.tasks, action.task] }
    case 'addHabit':
      return { ...state, habits: [...state.habits, action.habit] }
    case 'updateTask':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch, notes: action.patch.notes ?? t.notes } : t)) }
    case 'deleteTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) }
    case 'updateHabit':
      return { ...state, habits: state.habits.map((h) => (h.id === action.id ? { ...h, ...action.patch } : h)) }
    case 'deleteHabit':
      return { ...state, habits: state.habits.filter((h) => h.id !== action.id) }
    case 'missHabit':
      return {
        ...state,
        habits: state.habits.map((h) => (h.id === action.id ? { ...h, log: { ...h.log, [action.user]: { ...(h.log[action.user] ?? {}), [action.day]: { status: 'missed' as const } } } } : h)),
      }
  }
}

let counter = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${counter++}`

export function AppProvider({ children }: { children: ReactNode }) {
  const now = useNow()
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...createSeed(new Date()), pulse: 0 }))
  const today = toKey(now)

  const toggleTask = useCallback((id: string) => dispatch({ type: 'toggleTask', id, at: new Date().toISOString() }), [])
  const toggleHabit = useCallback((id: string) => dispatch({ type: 'toggleHabit', id, user: ME, day: toKey(new Date()), at: new Date().toISOString() }), [])
  const setHabitPaused = useCallback((id: string, paused: boolean) => dispatch({ type: 'pauseHabit', id, paused }), [])
  const addTask = useCallback(
    (input: NewTaskInput) =>
      dispatch({ type: 'addTask', task: { ...input, id: newId('t'), createdBy: ME, createdAt: new Date().toISOString(), status: 'open' } }),
    [],
  )
  const addHabit = useCallback(
    (input: NewHabitInput) => {
      const { shared, ...rest } = input
      dispatch({
        type: 'addHabit',
        habit: { ...rest, id: newId('h'), createdBy: ME, participants: shared ? USERS.map((u) => u.id) : [ME], paused: false, startDate: toKey(new Date()), log: {} },
      })
    },
    [],
  )

  const updateTask = useCallback((id: string, patch: UpdateTaskInput) => dispatch({ type: 'updateTask', id, patch }), [])
  const deleteTask = useCallback((id: string) => dispatch({ type: 'deleteTask', id }), [])
  const updateHabit = useCallback((id: string, patch: UpdateHabitInput) => dispatch({ type: 'updateHabit', id, patch }), [])
  const deleteHabit = useCallback((id: string) => dispatch({ type: 'deleteHabit', id }), [])
  const markHabitMissed = useCallback((id: string) => dispatch({ type: 'missHabit', id, user: ME, day: toKey(new Date()) }), [])
  const sync = useMemo<SyncInfo>(() => ({ remote: false, state: 'idle', loading: false, loadError: null, actionError: null, retry: () => undefined }), [])

  const value = useMemo(() => {
    const me = USERS.find((u) => u.id === ME)!
    const partner = USERS.find((u) => u.id !== ME)!
    return {
      users: USERS,
      me,
      partner,
      userById: (id: string) => USERS.find((u) => u.id === id) ?? me,
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
      sync,
    }
  }, [now, today, state, toggleTask, toggleHabit, setHabitPaused, addTask, addHabit, updateTask, deleteTask, updateHabit, deleteHabit, markHabitMissed, sync])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
