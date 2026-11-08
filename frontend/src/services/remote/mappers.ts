import type { DateKey, Habit, HabitLogEntry, Task, User, UserId } from '../../types'
import { toKey } from '../dates'

/** Row shapes as returned by Supabase (snake_case, Postgres types as strings). */
export interface TaskRow {
  id: string
  kind: 'daily' | 'deadline' | 'shared'
  title: string
  notes: string | null
  created_by: string
  notify_second_user: boolean
  task_date: string
  planned_time: string | null
  due_at: string | null
  status: 'open' | 'completed'
  completed_at: string | null
  completed_by: string | null
  created_at: string
  shared_state?: 'active' | 'awaiting_approval' | 'completed' | null
  completion_requested_by?: string | null
  completion_requested_at?: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejected_by?: string | null
  rejected_at?: string | null
}

export interface HabitRow {
  id: string
  title: string
  notes: string | null
  created_by: string
  is_shared: boolean
  owner_id: string | null
  schedule_days: number[] | null
  paused: boolean
  start_date: string
  notify_second_user: boolean
}

export interface HabitLogRow {
  habit_id: string
  user_id: string
  day: string
  status: 'done' | 'missed'
  done_at: string | null
}

/**
 * DB row -> app Task.
 * Deadlines take their calendar day from the exact instant in the VIEWER's time zone, so both people see the
 * same moment even if their devices are in different zones. Planned time `HH:mm:ss` is shown as `HH:mm`.
 */
export function taskFromRow(r: TaskRow): Task {
  const deadline = (r.kind === 'deadline' || r.kind === 'shared') && r.due_at
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    notes: r.notes ?? undefined,
    createdBy: r.created_by,
    createdAt: r.created_at,
    notifySecondUser: r.notify_second_user,
    date: deadline ? toKey(new Date(r.due_at as string)) : r.task_date,
    time: r.planned_time ? r.planned_time.slice(0, 5) : undefined,
    dueAt: r.due_at ?? undefined,
    status: r.status,
    completedAt: r.completed_at ?? undefined,
    completedBy: r.completed_by ?? undefined,
    ...(r.kind === 'shared'
      ? {
          sharedState: r.shared_state ?? 'active',
          completionRequestedBy: r.completion_requested_by ?? undefined,
          completionRequestedAt: r.completion_requested_at ?? undefined,
          approvedBy: r.approved_by ?? undefined,
          approvedAt: r.approved_at ?? undefined,
          rejectedBy: r.rejected_by ?? undefined,
          rejectedAt: r.rejected_at ?? undefined,
        }
      : {}),
  }
}

/** Groups habit log rows into the per-person, per-day structure the UI uses. Each person's rows stay separate. */
export function logsByUser(rows: HabitLogRow[]): Map<string, Record<UserId, Record<DateKey, HabitLogEntry>>> {
  const out = new Map<string, Record<UserId, Record<DateKey, HabitLogEntry>>>()
  for (const l of rows) {
    const habit = out.get(l.habit_id) ?? {}
    const person = habit[l.user_id] ?? {}
    person[l.day] = l.status === 'done' ? { status: 'done', at: l.done_at ?? undefined } : { status: 'missed' }
    habit[l.user_id] = person
    out.set(l.habit_id, habit)
  }
  return out
}

export function habitFromRow(r: HabitRow, memberIds: UserId[], logs: Record<UserId, Record<DateKey, HabitLogEntry>> | undefined): Habit {
  const participants = r.is_shared ? memberIds : r.owner_id ? [r.owner_id] : []
  return {
    id: r.id,
    title: r.title,
    notes: r.notes ?? undefined,
    createdBy: r.created_by,
    notifySecondUser: r.notify_second_user,
    participants,
    schedule: r.schedule_days && r.schedule_days.length > 0 && r.schedule_days.length < 7 ? { type: 'weekdays', days: [...r.schedule_days].sort() } : { type: 'daily' },
    paused: r.paused,
    startDate: r.start_date,
    log: logs ?? {},
  }
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const two = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]
  return two.toUpperCase()
}

/** Placeholder shown until the partner has joined. */
export const PENDING_PARTNER_ID = 'pending-partner'
export const pendingPartner = (): User => ({ id: PENDING_PARTNER_ID, name: 'Your partner', initials: '…', tone: 'partner' })

/** Row -> insert/update payloads (the inverse of the mappers). */
export function weekdaysToDb(schedule: Habit['schedule']): number[] | null {
  return schedule.type === 'daily' ? null : [...schedule.days].sort()
}
