import { useCallback, useMemo, useReducer, type ReactNode } from 'react'
import { createSeed, ME, USERS } from '../data/mock'
import { useNow } from '../hooks/useNow'
import { toKey } from '../services/dates'
import type { Habit, Task } from '../types'
import { AppContext, type NewHabitInput, type NewTaskInput } from './appContext'

interface State {
  tasks: Task[]
  habits: Habit[]
  pulse: number
}

type Action =
  | { type: 'toggleTask'; id: string; at: string }
  | { type: 'toggleHabit'; id: string; day: string; at: string }
  | { type: 'pauseHabit'; id: string; paused: boolean }
  | { type: 'addTask'; task: Task }
  | { type: 'addHabit'; habit: Habit }

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
      let completed = false
      const habits = state.habits.map((h) => {
        if (h.id !== action.id) return h
        const log = { ...h.log }
        if (log[action.day]?.status === 'done') delete log[action.day]
        else {
          log[action.day] = { status: 'done', at: action.at, by: ME }
          completed = true
        }
        return { ...h, log }
      })
      return { ...state, habits, pulse: completed ? state.pulse + 1 : state.pulse }
    }
    case 'pauseHabit':
      return { ...state, habits: state.habits.map((h) => (h.id === action.id ? { ...h, paused: action.paused } : h)) }
    case 'addTask':
      return { ...state, tasks: [...state.tasks, action.task] }
    case 'addHabit':
      return { ...state, habits: [...state.habits, action.habit] }
  }
}

let counter = 0
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${counter++}`

export function AppProvider({ children }: { children: ReactNode }) {
  const now = useNow()
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...createSeed(new Date()), pulse: 0 }))
  const today = toKey(now)

  const toggleTask = useCallback((id: string) => dispatch({ type: 'toggleTask', id, at: new Date().toISOString() }), [])
  const toggleHabit = useCallback((id: string) => dispatch({ type: 'toggleHabit', id, day: toKey(new Date()), at: new Date().toISOString() }), [])
  const setHabitPaused = useCallback((id: string, paused: boolean) => dispatch({ type: 'pauseHabit', id, paused }), [])
  const addTask = useCallback(
    (input: NewTaskInput) =>
      dispatch({ type: 'addTask', task: { ...input, id: newId('t'), createdBy: ME, createdAt: new Date().toISOString(), status: 'open' } }),
    [],
  )
  const addHabit = useCallback(
    (input: NewHabitInput) => dispatch({ type: 'addHabit', habit: { ...input, id: newId('h'), createdBy: ME, paused: false, log: {} } }),
    [],
  )

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
    }
  }, [now, today, state, toggleTask, toggleHabit, setHabitPaused, addTask, addHabit])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
