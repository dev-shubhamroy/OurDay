/** Shared domain types for OurDay. Shapes are chosen to map cleanly onto
 *  the planned Supabase/PostgreSQL schema and IndexedDB stores. */

export type UserId = string
/** Local calendar day, `YYYY-MM-DD`. */
export type DateKey = string

export interface User {
  id: UserId
  name: string
  initials: string
  /** Tailwind-friendly token name used for avatar tinting. */
  tone: 'you' | 'partner'
}

/** Controls notifications only — both users always have full task access. */
export interface NotificationPreference {
  notifySecondUser: boolean
}

export type TaskKind = 'daily' | 'deadline'
export type TaskStatus = 'open' | 'completed'

export interface Task extends NotificationPreference {
  id: string
  kind: TaskKind
  title: string
  notes?: string
  createdBy: UserId
  createdAt: string
  /** Planned day for daily tasks; the due day for deadlines. */
  date: DateKey
  /** Optional planned time (`HH:mm`) for daily tasks. */
  time?: string
  /** Deadline instant (ISO). Only for `kind === 'deadline'`. */
  dueAt?: string
  status: TaskStatus
  completedAt?: string
  completedBy?: UserId
}

export type TaskType = TaskKind | 'habit'

export type HabitSchedule =
  | { type: 'daily' }
  /** Selected weekdays, 0 = Sunday … 6 = Saturday. */
  | { type: 'weekdays'; days: number[] }

export interface HabitLogEntry {
  status: 'done' | 'missed'
  /** ISO timestamp, present when `status === 'done'`. */
  at?: string
  by?: UserId
}

export interface Habit extends NotificationPreference {
  id: string
  title: string
  notes?: string
  createdBy: UserId
  schedule: HabitSchedule
  paused: boolean
  /** One fresh occurrence per scheduled day; a miss never blocks the next day. */
  log: Record<DateKey, HabitLogEntry>
}

export interface CompletionRecord {
  id: string
  itemId: string
  kind: TaskType
  title: string
  completedAt: string
  completedBy: UserId
}

export type Urgency = 'critical' | 'approaching' | 'normal' | 'done'
