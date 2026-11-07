import type { DateKey, Habit, HabitLogEntry, HabitScope, UserId } from '../types'
import { addDays, fromKey, weekday } from './dates'

export function isScheduled(habit: Habit, key: DateKey): boolean {
  return habit.schedule.type === 'daily' || habit.schedule.days.includes(weekday(key))
}

export const isShared = (h: Habit) => h.participants.length > 1

export function habitScope(h: Habit, me: UserId): HabitScope {
  if (isShared(h)) return 'shared'
  return h.participants[0] === me ? 'personal' : 'partner'
}

export const participates = (h: Habit, user: UserId) => h.participants.includes(user)
export const entryFor = (h: Habit, user: UserId, key: DateKey): HabitLogEntry | undefined => h.log[user]?.[key]

export type DayState = 'done' | 'missed' | 'pending' | 'off'

/**
 * State of one user's occurrence on one calendar day. Every scheduled day is a
 * fresh occurrence; a missed day never affects the next one.
 * A past scheduled day without a completion is missed (this is what the
 * planned midnight auto-miss produces); today stays pending until midnight.
 */
export function dayState(habit: Habit, user: UserId, key: DateKey, today: DateKey): DayState {
  if (key < habit.startDate || !isScheduled(habit, key)) return 'off'
  const e = entryFor(habit, user, key)
  if (e?.status === 'done') return 'done'
  if (key >= today) return e?.status === 'missed' ? 'missed' : 'pending'
  return 'missed'
}

/** Current streak for one user: consecutive completed scheduled days; a miss breaks it, unscheduled days do not. */
export function streakOf(habit: Habit, user: UserId, today: DateKey): number {
  let streak = 0
  for (let key = today; key >= habit.startDate; key = addDays(key, -1)) {
    const s = dayState(habit, user, key, today)
    if (s === 'done') streak++
    else if (s === 'missed') break
    // 'off' never breaks; today's 'pending' neither counts nor breaks.
  }
  return streak
}

export function longestStreak(habit: Habit, user: UserId, today: DateKey): number {
  let best = 0
  let run = 0
  for (let key = habit.startDate; key <= today; key = addDays(key, 1)) {
    const s = dayState(habit, user, key, today)
    if (s === 'done') best = Math.max(best, ++run)
    else if (s === 'missed') run = 0
  }
  return best
}

/** Completion rate over scheduled days in the last 7 days (including today). */
export function weeklyRate(habit: Habit, user: UserId, today: DateKey): number {
  let scheduled = 0
  let done = 0
  for (let i = 0; i < 7; i++) {
    const s = dayState(habit, user, addDays(today, -i), today)
    if (s === 'off') continue
    scheduled++
    if (s === 'done') done++
  }
  return scheduled ? Math.round((done / scheduled) * 100) : 0
}

/** Monday-aligned calendar covering `weeks` weeks, ending with the current week. */
export function calendarDays(today: DateKey, weeks = 5): DateKey[] {
  const dow = (weekday(today) + 6) % 7 // Monday = 0
  const start = addDays(today, -dow - (weeks - 1) * 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}

export const calendarLabel = (key: DateKey) => fromKey(key).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const dayName = (i: number) => DAY_NAMES[i]

export function scheduleLabel(habit: Habit): string {
  if (habit.schedule.type === 'daily') return 'Every day'
  const days = habit.schedule.days
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays'
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(dayName).join(' · ')
}

/**
 * Whether the current person may edit/pause/delete a habit in the UI. A partner's PERSONAL habit is read-only
 * (view only); shared habits and your own personal habits are manageable. Tasks are not affected by this rule.
 */
export const canManageHabit = (h: Habit, me: UserId): boolean => h.participants.length > 1 || h.participants[0] === me
