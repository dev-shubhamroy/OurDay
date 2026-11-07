import type { CompletionRecord, DateKey, Habit, Task } from '../types'
import { addDays, toKey } from './dates'
import { isScheduled } from './habits'

const byDue = (a: Task, b: Task) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()
/** Stable order for daily tasks: timed first by time, then by creation. */
const byPlan = (a: Task, b: Task) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/** An incomplete deadline whose time has passed is a missed opportunity, not a pending item. */
export const isExpired = (t: Task, now: Date) => t.kind === 'deadline' && t.status === 'open' && new Date(t.dueAt!).getTime() <= now.getTime()

export function todayDeadlines(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks.filter((t) => t.kind === 'deadline' && t.date === today && !isExpired(t, now)).sort(byDue)
}

export function todayDaily(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks.filter((t) => t.kind === 'daily' && t.date === today).sort(byPlan)
}

export function todayHabits(habits: Habit[], now: Date): Habit[] {
  const today = toKey(now)
  return habits.filter((h) => !h.paused && isScheduled(h, today))
}

export interface Progress {
  done: number
  total: number
  pct: number
}
const progress = (done: number, total: number): Progress => ({ done, total, pct: total ? Math.round((done / total) * 100) : 0 })

export function taskProgress(tasks: Task[], now: Date): Progress {
  const all = [...todayDeadlines(tasks, now), ...todayDaily(tasks, now)]
  return progress(all.filter((t) => t.status === 'completed').length, all.length)
}

export function habitProgress(habits: Habit[], now: Date): Progress {
  const today = toKey(now)
  const list = todayHabits(habits, now)
  return progress(list.filter((h) => h.log[today]?.status === 'done').length, list.length)
}

export function upcomingTasks(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks
    .filter((t) => t.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? (a.kind === 'deadline' ? byDue(a, b) : byPlan(a, b)) : a.kind === 'deadline' ? -1 : 1))
}

export const futureDeadlines = (tasks: Task[], now: Date) => upcomingTasks(tasks, now).filter((t) => t.kind === 'deadline')

/** Expired-and-missed deadlines plus completed deadlines from previous days, newest first. */
export function pastDeadlines(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks
    .filter((t) => t.kind === 'deadline' && (isExpired(t, now) || (t.status === 'completed' && t.date < today)))
    .sort((a, b) => byDue(b, a))
}

export interface MissedHabit {
  habit: Habit
  date: DateKey
}

export function missedItems(tasks: Task[], habits: Habit[], now: Date, habitDays = 14) {
  const today = toKey(now)
  const deadlines = tasks.filter((t) => isExpired(t, now)).sort((a, b) => byDue(b, a))
  const daily = tasks.filter((t) => t.kind === 'daily' && t.status === 'open' && t.date < today).sort((a, b) => b.date.localeCompare(a.date))
  const cutoff = addDays(today, -habitDays)
  const missedHabits: MissedHabit[] = habits
    .flatMap((habit) => Object.entries(habit.log).filter(([k, e]) => e.status === 'missed' && k >= cutoff && k < today).map(([date]) => ({ habit, date })))
    .sort((a, b) => b.date.localeCompare(a.date))
  return { deadlines, daily, missedHabits }
}

/** Completion history: everything completed on a previous day (today's stay on Today until the daily reset). */
export function completionHistory(tasks: Task[], habits: Habit[], now: Date): CompletionRecord[] {
  const today = toKey(now)
  const fromTasks: CompletionRecord[] = tasks
    .filter((t) => t.status === 'completed' && t.completedAt && toKey(new Date(t.completedAt)) < today)
    .map((t) => ({ id: `c-${t.id}`, itemId: t.id, kind: t.kind, title: t.title, completedAt: t.completedAt!, completedBy: t.completedBy ?? t.createdBy }))
  const fromHabits: CompletionRecord[] = habits.flatMap((h) =>
    Object.entries(h.log)
      .filter(([k, e]) => e.status === 'done' && e.at && k < today)
      .map(([k, e]) => ({ id: `c-${h.id}-${k}`, itemId: h.id, kind: 'habit' as const, title: h.title, completedAt: e.at!, completedBy: e.by ?? h.createdBy })),
  )
  return [...fromTasks, ...fromHabits].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

/** Today's completions across tasks and habits, newest first (for the activity feed). */
export function todayActivity(tasks: Task[], habits: Habit[], now: Date): CompletionRecord[] {
  const today = toKey(now)
  const t: CompletionRecord[] = tasks
    .filter((x) => x.status === 'completed' && x.completedAt && toKey(new Date(x.completedAt)) === today)
    .map((x) => ({ id: `a-${x.id}`, itemId: x.id, kind: x.kind, title: x.title, completedAt: x.completedAt!, completedBy: x.completedBy ?? x.createdBy }))
  const h: CompletionRecord[] = habits
    .filter((x) => x.log[today]?.status === 'done')
    .map((x) => ({ id: `a-${x.id}`, itemId: x.id, kind: 'habit' as const, title: x.title, completedAt: x.log[today].at!, completedBy: x.log[today].by ?? x.createdBy }))
  return [...t, ...h].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}
