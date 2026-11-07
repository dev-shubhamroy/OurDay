import { createContext } from 'react'
import type { DateKey, Habit, HabitSchedule, Task, User } from '../types'

export interface NewTaskInput {
  kind: 'daily' | 'deadline'
  title: string
  notes?: string
  date: DateKey
  time?: string
  dueAt?: string
  notifySecondUser: boolean
}

export interface NewHabitInput {
  title: string
  notes?: string
  schedule: HabitSchedule
  notifySecondUser: boolean
  /** Shared habits are tracked independently by both users. */
  shared: boolean
}

export interface AppCtx {
  users: User[]
  me: User
  partner: User
  userById: (id: string) => User
  now: Date
  today: DateKey
  tasks: Task[]
  habits: Habit[]
  /** Increments on every completion; drives RANA's acknowledgement. */
  pulse: number
  toggleTask: (id: string) => void
  toggleHabit: (id: string) => void
  setHabitPaused: (id: string, paused: boolean) => void
  addTask: (input: NewTaskInput) => void
  addHabit: (input: NewHabitInput) => void
}

export const AppContext = createContext<AppCtx | null>(null)
