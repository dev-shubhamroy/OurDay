import type { DateKey, Habit } from '../types'
import { addDays, weekday } from './dates'

export function isScheduled(habit: Habit, key: DateKey): boolean {
  return habit.schedule.type === 'daily' || habit.schedule.days.includes(weekday(key))
}

export type DayState = 'done' | 'missed' | 'pending' | 'off'

/** State of one calendar day. Each scheduled day is its own fresh occurrence. */
export function dayState(habit: Habit, key: DateKey, today: DateKey): DayState {
  if (!isScheduled(habit, key)) return 'off'
  const entry = habit.log[key]
  if (entry?.status === 'done') return 'done'
  if (key >= today) return 'pending'
  return 'missed'
}

/** Consecutive completed scheduled days ending today (or yesterday if today is still open). */
export function streakOf(habit: Habit, today: DateKey): number {
  let streak = 0
  let key = today
  for (let i = 0; i < 365; i++) {
    const s = dayState(habit, key, today)
    if (s === 'done') streak++
    else if (s === 'missed' || (s === 'pending' && key !== today)) break
    key = addDays(key, -1)
  }
  return streak
}

/** Completion rate across scheduled days in the last 7 days (including today). */
export function weeklyRate(habit: Habit, today: DateKey): number {
  let scheduled = 0
  let done = 0
  for (let i = 0; i < 7; i++) {
    const s = dayState(habit, addDays(today, -i), today)
    if (s === 'off') continue
    scheduled++
    if (s === 'done') done++
  }
  return scheduled ? Math.round((done / scheduled) * 100) : 0
}

export function lastDays(today: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)))
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const dayName = (i: number) => DAY_NAMES[i]

export function scheduleLabel(habit: Habit): string {
  if (habit.schedule.type === 'daily') return 'Every day'
  const days = habit.schedule.days
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays'
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(dayName).join(' · ')
}
