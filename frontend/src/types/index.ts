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

export type TaskKind = 'daily' | 'deadline' | 'shared'
export type TaskStatus = 'open' | 'completed'
/** Shared tasks only: one state for both people. Completion needs the other person's approval. */
export type SharedState = 'active' | 'awaiting_approval' | 'completed'

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
  /** Deadline instant (ISO). Required for `deadline`, optional for `shared`. */
  dueAt?: string
  status: TaskStatus
  completedAt?: string
  completedBy?: UserId
  /** `kind === 'shared'` only. */
  sharedState?: SharedState
  /** While awaiting approval: who asked, and when. */
  completionRequestedBy?: UserId
  completionRequestedAt?: string
  /** After approval. */
  approvedBy?: UserId
  approvedAt?: string
  /** After the latest rejection (cleared by the next request). */
  rejectedBy?: UserId
  rejectedAt?: string
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
}

/**
 * A habit has one or two participants.
 * - one participant, the current user  → personal habit
 * - one participant, the other user    → partner's habit (visible to both)
 * - both users                         → shared habit
 * Each participant has an independent completion log; one person's completion
 * never completes or overwrites the other's.
 */
export interface Habit extends NotificationPreference {
  id: string
  title: string
  notes?: string
  createdBy: UserId
  participants: UserId[]
  schedule: HabitSchedule
  paused: boolean
  /** First day the habit counts; earlier days are "unscheduled". */
  startDate: DateKey
  /** Per-user logs. A scheduled past day with no `done` entry counts as missed. */
  log: Record<UserId, Record<DateKey, HabitLogEntry>>
}

export type HabitScope = 'personal' | 'partner' | 'shared'

export interface CompletionRecord {
  id: string
  itemId: string
  kind: TaskType
  title: string
  completedAt: string
  completedBy: UserId
}

export type Urgency = 'critical' | 'approaching' | 'normal' | 'done'
