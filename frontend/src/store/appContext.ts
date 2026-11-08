import { createContext } from 'react'
import type { SyncState } from '../lib/realtime'
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

export type UpdateTaskInput = Partial<Pick<NewTaskInput, 'title' | 'notes' | 'date' | 'time' | 'dueAt' | 'notifySecondUser'>>

export interface UpdateHabitInput {
  title?: string
  notes?: string
  schedule?: HabitSchedule
  notifySecondUser?: boolean
  paused?: boolean
}

export interface SyncInfo {
  /** False in local demo mode (mock data, nothing is saved). */
  remote: boolean
  /** live = realtime connected; polling = realtime unavailable, refreshing periodically; offline = server unreachable. */
  state: SyncState | 'polling' | 'idle'
  /** First load in progress. */
  loading: boolean
  /** First load failed (no data yet). */
  loadError: string | null
  /** The most recent failed save, for a toast. `id` changes on every new failure. */
  actionError: { id: number; message: string } | null
  /** Changes saved on this device that haven't reached the server yet. */
  pending: number
  /** True while queued changes are being sent. */
  syncing: boolean
  /** When the data on screen was last confirmed by the server (ISO), or null. */
  lastSyncedAt: string | null
  retry: () => void
}

export interface AppCtx {
  sync: SyncInfo
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
  updateTask: (id: string, patch: UpdateTaskInput) => void
  deleteTask: (id: string) => void
  updateHabit: (id: string, patch: UpdateHabitInput) => void
  deleteHabit: (id: string) => void
  /** Records the current user's "No" at the habit check-in. */
  markHabitMissed: (id: string) => void
}

export const AppContext = createContext<AppCtx | null>(null)
