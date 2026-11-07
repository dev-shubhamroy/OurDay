import type { Task, Urgency } from '../types'

export const CRITICAL_MS = 3 * 3600_000
export const APPROACHING_MS = 8 * 3600_000

export function remainingMs(task: Task, now: Date): number {
  return task.dueAt ? new Date(task.dueAt).getTime() - now.getTime() : Infinity
}

/** A completed deadline is never urgent or overdue. */
export function urgencyOf(task: Task, now: Date): Urgency {
  if (task.status === 'completed') return 'done'
  const ms = remainingMs(task, now)
  if (ms <= CRITICAL_MS) return 'critical'
  if (ms <= APPROACHING_MS) return 'approaching'
  return 'normal'
}
