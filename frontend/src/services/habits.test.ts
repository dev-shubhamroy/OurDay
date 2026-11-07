import { describe, expect, it } from 'vitest'
import { A, B, TODAY, day, done, habit } from '../test/fixtures'
import { calendarDays, dayState, isScheduled, longestStreak, streakOf, weeklyRate } from './habits'
import { weekday } from './dates'

describe('habit day state (independent per person)', () => {
  it('a completion by A never completes B', () => {
    const h = habit({ log: { [A]: done(0) } })
    expect(dayState(h, A, TODAY, TODAY)).toBe('done')
    expect(dayState(h, B, TODAY, TODAY)).toBe('pending')
  })

  it('each person can have a different status on the same past date', () => {
    const h = habit({ log: { [A]: done(-1) } })
    expect(dayState(h, A, day(-1), TODAY)).toBe('done')
    expect(dayState(h, B, day(-1), TODAY)).toBe('missed')
  })

  it('a scheduled past day with no completion is missed; today stays pending until midnight', () => {
    const h = habit()
    expect(dayState(h, A, day(-2), TODAY)).toBe('missed')
    expect(dayState(h, A, TODAY, TODAY)).toBe('pending')
  })

  it('an explicit "No" at the check-in marks today missed', () => {
    const h = habit({ log: { [A]: { [TODAY]: { status: 'missed' } } } })
    expect(dayState(h, A, TODAY, TODAY)).toBe('missed')
    expect(dayState(h, B, TODAY, TODAY)).toBe('pending')
  })

  it('days before the habit started are unscheduled', () => {
    const h = habit({ startDate: day(-3) })
    expect(dayState(h, A, day(-5), TODAY)).toBe('off')
  })

  it('weekday schedules mark other days as unscheduled', () => {
    const h = habit({ schedule: { type: 'weekdays', days: [1] } }) // Mondays only
    const monday = Array.from({ length: 14 }, (_, i) => day(-i)).find((k) => weekday(k) === 1)!
    const tuesday = Array.from({ length: 14 }, (_, i) => day(-i)).find((k) => weekday(k) === 2)!
    expect(isScheduled(h, monday)).toBe(true)
    expect(dayState(h, A, tuesday, TODAY)).toBe('off')
  })
})

describe('streaks', () => {
  it('counts consecutive completed scheduled days ending today', () => {
    const h = habit({ log: { [A]: { ...done(0), ...done(-1), ...done(-2) } } })
    expect(streakOf(h, A, TODAY)).toBe(3)
  })

  it('today still pending does not break or count', () => {
    const h = habit({ log: { [A]: { ...done(-1), ...done(-2) } } })
    expect(streakOf(h, A, TODAY)).toBe(2)
  })

  it('a missed scheduled day breaks the streak', () => {
    const h = habit({ log: { [A]: { ...done(0), ...done(-2), ...done(-3) } } }) // -1 missed
    expect(streakOf(h, A, TODAY)).toBe(1)
  })

  it('unscheduled days do not break a streak', () => {
    // Only Saturdays: done on this Saturday and last Saturday, nothing in between should matter.
    const h = habit({ schedule: { type: 'weekdays', days: [6] }, log: { [A]: { ...done(0), ...done(-7) } } })
    expect(streakOf(h, A, TODAY)).toBe(2)
  })

  it('streaks are independent per person', () => {
    const h = habit({ log: { [A]: { ...done(0), ...done(-1), ...done(-2) }, [B]: done(-2) } })
    expect(streakOf(h, A, TODAY)).toBe(3)
    expect(streakOf(h, B, TODAY)).toBe(0) // B missed yesterday
  })

  it('longest streak survives a later miss', () => {
    const h = habit({ startDate: day(-10), log: { [A]: { ...done(-9), ...done(-8), ...done(-7), ...done(-6), ...done(-4), ...done(-3) } } })
    expect(longestStreak(h, A, TODAY)).toBe(4)
    expect(streakOf(h, A, TODAY)).toBe(0)
  })

  it('a missed day never blocks the next scheduled occurrence', () => {
    const h = habit({ log: { [A]: { ...done(0) } } }) // yesterday missed, today done
    expect(dayState(h, A, day(-1), TODAY)).toBe('missed')
    expect(dayState(h, A, TODAY, TODAY)).toBe('done')
    expect(streakOf(h, A, TODAY)).toBe(1)
  })
})

describe('weekly rate and calendar', () => {
  it('computes completion over scheduled days in the last 7 days', () => {
    const h = habit({ log: { [A]: { ...done(0), ...done(-1), ...done(-2), ...done(-3) } } })
    expect(weeklyRate(h, A, TODAY)).toBe(Math.round((4 / 7) * 100))
  })

  it('builds a Monday-aligned five-week grid ending in the current week', () => {
    const days = calendarDays(TODAY, 5)
    expect(days).toHaveLength(35)
    expect(weekday(days[0])).toBe(1)
    expect(days.includes(TODAY)).toBe(true)
  })
})
