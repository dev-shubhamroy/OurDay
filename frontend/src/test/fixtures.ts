import type { Habit, Task } from '../types'
import { addDays, atTime, toKey } from '../services/dates'

export const A = 'user-a'
export const B = 'user-b'

/** A fixed "now": Saturday 7 Nov 2026, 3:00 PM local. */
export const NOW = new Date(2026, 10, 7, 15, 0, 0)
export const TODAY = toKey(NOW)
export const day = (n: number) => addDays(TODAY, n)

export function deadline(id: string, title: string, dueDay: number, hhmm: string, over: Partial<Task> = {}): Task {
  const due = atTime(day(dueDay), hhmm)
  return { id, kind: 'deadline', title, createdBy: A, createdAt: '2026-11-01T00:00:00Z', notifySecondUser: false, date: toKey(due), dueAt: due.toISOString(), status: 'open', ...over }
}

export function daily(id: string, title: string, dayOffset: number, over: Partial<Task> = {}): Task {
  return { id, kind: 'daily', title, createdBy: A, createdAt: '2026-11-01T00:00:00Z', notifySecondUser: false, date: day(dayOffset), status: 'open', ...over }
}

export function habit(over: Partial<Habit> = {}): Habit {
  return { id: 'h1', title: 'Read', createdBy: A, notifySecondUser: false, participants: [A, B], schedule: { type: 'daily' }, paused: false, startDate: day(-30), log: {}, ...over }
}

export const done = (dayOffset: number, hh = '20:00') => ({ [day(dayOffset)]: { status: 'done' as const, at: atTime(day(dayOffset), hh).toISOString() } })
