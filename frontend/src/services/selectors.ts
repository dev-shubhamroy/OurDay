import type { CompletionRecord, DateKey, Habit, Task, UserId } from '../types'
import { addDays, toKey } from './dates'
import { dayState, isScheduled, isShared, participates } from './habits'

const byDue = (a: Task, b: Task) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime()
/** Stable order for daily tasks: timed first by time, then by creation. */
const byPlan = (a: Task, b: Task) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/** An incomplete deadline whose time has passed is a missed opportunity, not a pending item. */
export const isExpired = (t: Task, now: Date) => t.kind === 'deadline' && t.status === 'open' && new Date(t.dueAt!).getTime() <= now.getTime()

export function todayDeadlines(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks.filter((t) => t.kind === 'deadline' && t.date === today && !isExpired(t, now)).sort(byDue)
}

/** Incomplete, still-active deadlines due on a given local day, earliest first. Reuses the Today rules. */
export function openDeadlinesOn(tasks: Task[], now: Date, dayKey: DateKey): Task[] {
  return tasks.filter((t) => t.kind === 'deadline' && t.date === dayKey && t.status === 'open' && !isExpired(t, now)).sort(byDue)
}

/** The next `limit` incomplete, still-active deadlines due today or tomorrow (local days), earliest actual deadline first. */
export function nextDeadlines(tasks: Task[], now: Date, limit = 3): Task[] {
  const today = toKey(now)
  const tomorrow = addDays(today, 1)
  return tasks
    .filter((t) => t.kind === 'deadline' && (t.date === today || t.date === tomorrow) && t.status === 'open' && !isExpired(t, now))
    .sort(byDue)
    .slice(0, limit)
}

export function todayDaily(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks.filter((t) => t.kind === 'daily' && t.date === today).sort(byPlan)
}

/** Habits the given user takes part in (personal + shared) that are scheduled today. */
export function todayHabits(habits: Habit[], now: Date, user: UserId): Habit[] {
  const today = toKey(now)
  return habits.filter((h) => !h.paused && participates(h, user) && isScheduled(h, today) && today >= h.startDate)
}

/** The other person's personal habits scheduled today (visible, read-only). */
export function partnerHabitsToday(habits: Habit[], now: Date, partner: UserId): Habit[] {
  const today = toKey(now)
  return habits.filter((h) => !h.paused && !isShared(h) && participates(h, partner) && isScheduled(h, today) && today >= h.startDate)
}

/** Every (habit, user) occurrence scheduled today, for both users. */
export function habitOccurrencesToday(habits: Habit[], now: Date) {
  const today = toKey(now)
  return habits
    .filter((h) => !h.paused && isScheduled(h, today) && today >= h.startDate)
    .flatMap((habit) => habit.participants.map((user) => ({ habit, user, done: habit.log[user]?.[today]?.status === 'done' })))
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

export function habitProgress(habits: Habit[], now: Date, user: UserId): Progress {
  const today = toKey(now)
  const list = todayHabits(habits, now, user)
  return progress(list.filter((h) => h.log[user]?.[today]?.status === 'done').length, list.length)
}

export function upcomingTasks(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks
    .filter((t) => t.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? (a.kind === 'deadline' ? byDue(a, b) : byPlan(a, b)) : a.kind === 'deadline' ? -1 : 1))
}

/**
 * Home "Coming up": every open, still-active deadline from now on (today and tomorrow included, so they also
 * appear in their date groups) plus future daily tasks. Completed deadlines are excluded (see Completed).
 */
export function comingUpTasks(tasks: Task[], now: Date): Task[] {
  const today = toKey(now)
  return tasks
    .filter((t) => (t.kind === 'deadline' ? t.status === 'open' && t.date >= today && !isExpired(t, now) : t.date > today))
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
  user: UserId
  date: DateKey
}

export function missedItems(tasks: Task[], habits: Habit[], now: Date, habitDays = 14) {
  const today = toKey(now)
  const deadlines = tasks.filter((t) => isExpired(t, now)).sort((a, b) => byDue(b, a))
  const daily = tasks.filter((t) => t.kind === 'daily' && t.status === 'open' && t.date < today).sort((a, b) => b.date.localeCompare(a.date))
  const cutoff = addDays(today, -habitDays)
  const missedHabits: MissedHabit[] = habits
    .flatMap((habit) =>
      habit.participants.flatMap((user) =>
        Array.from({ length: habitDays }, (_, i) => addDays(today, -(i + 1)))
          .filter((date) => date >= cutoff && dayState(habit, user, date, today) === 'missed')
          .map((date) => ({ habit, user, date })),
      ),
    )
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
    Object.entries(h.log).flatMap(([user, days]) =>
      Object.entries(days)
        .filter(([k, e]) => e.status === 'done' && e.at && k < today)
        .map(([k, e]) => ({ id: `c-${h.id}-${user}-${k}`, itemId: h.id, kind: 'habit' as const, title: h.title, completedAt: e.at!, completedBy: user })),
    ),
  )
  return [...fromTasks, ...fromHabits].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

/** Today's completions across tasks and habits, newest first (for the activity feed). */
export function todayActivity(tasks: Task[], habits: Habit[], now: Date): CompletionRecord[] {
  const today = toKey(now)
  const t: CompletionRecord[] = tasks
    .filter((x) => x.status === 'completed' && x.completedAt && toKey(new Date(x.completedAt)) === today)
    .map((x) => ({ id: `a-${x.id}`, itemId: x.id, kind: x.kind, title: x.title, completedAt: x.completedAt!, completedBy: x.completedBy ?? x.createdBy }))
  const h: CompletionRecord[] = habits.flatMap((x) =>
    x.participants
      .filter((u) => x.log[u]?.[today]?.status === 'done')
      .map((u) => ({ id: `a-${x.id}-${u}`, itemId: x.id, kind: 'habit' as const, title: x.title, completedAt: x.log[u][today].at!, completedBy: u })),
  )
  return [...t, ...h].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

export interface DayItem {
  id: string
  title: string
  kind: 'daily' | 'deadline' | 'habit'
  done: boolean
  /** ISO completion time, when done. */
  at?: string
  shared?: boolean
}

/**
 * One person's items for today, counted independently.
 * - Tasks have a single completion record: an open task belongs to its creator, a completed one to whoever
 *   completed it, so no task is ever counted twice. Only today's active items count (no future tasks,
 *   no expired deadlines).
 * - Habits use per-user logs: a shared habit yields one occurrence per participant; a personal habit only
 *   its owner's. Paused habits and unscheduled days are excluded.
 */
export function personDay(tasks: Task[], habits: Habit[], now: Date, user: UserId): { done: DayItem[]; remaining: DayItem[] } {
  const today = toKey(now)
  const items: DayItem[] = []
  for (const t of [...todayDeadlines(tasks, now), ...todayDaily(tasks, now)]) {
    const owner = t.status === 'completed' ? (t.completedBy ?? t.createdBy) : t.createdBy
    if (owner !== user) continue
    items.push({ id: t.id, title: t.title, kind: t.kind, done: t.status === 'completed', at: t.completedAt })
  }
  for (const h of habits) {
    if (h.paused || !isScheduled(h, today) || today < h.startDate || !participates(h, user)) continue
    const e = h.log[user]?.[today]
    items.push({ id: `${h.id}:${user}`, title: h.title, kind: 'habit', done: e?.status === 'done', at: e?.at, shared: isShared(h) })
  }
  return {
    done: items.filter((i) => i.done).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')),
    remaining: items.filter((i) => !i.done),
  }
}

/** Tasks created by the given person. Viewing filter only: ownership is never changed. */
export const tasksOwnedBy = (tasks: Task[], userId: UserId): Task[] => tasks.filter((t) => t.createdBy === userId)

/** Habits the given person takes part in (their personal habits plus shared ones). */
export const habitsOf = (habits: Habit[], userId: UserId): Habit[] => habits.filter((h) => participates(h, userId))
