import type { DateKey, Habit, Task, User } from '../types'
import { addDays, atTime, toKey } from '../services/dates'

export const USERS: User[] = [
  { id: 'u1', name: 'Shubham', initials: 'SR', tone: 'you' },
  { id: 'u2', name: 'Aanya', initials: 'AK', tone: 'partner' },
]
export const ME = 'u1'

const HOUR = 3600_000

/** Mock data is generated relative to "now" so the demo always has live countdowns. */
export function createSeed(now: Date): { tasks: Task[]; habits: Habit[] } {
  const today = toKey(now)
  const endOfToday = atTime(today, '23:59').getTime()
  const stamp = (offsetMs: number, floorFromEnd: number) =>
    new Date(Math.min(now.getTime() + offsetMs, endOfToday - floorFromEnd * 60_000)).toISOString()
  const created = new Date(now.getTime() - 26 * HOUR).toISOString()
  const at = (key: DateKey, hhmm: string) => atTime(key, hhmm).toISOString()
  const day = (n: number) => addDays(today, n)

  const base = { createdAt: created, status: 'open' as const }

  const tasks: Task[] = [
    // --- today's deadlines
    { ...base, id: 't-d1', kind: 'deadline', title: 'Submit internship application', notes: 'Attach résumé and cover letter.', createdBy: 'u1', date: today, dueAt: stamp(2.5 * HOUR, 40), notifySecondUser: true },
    { ...base, id: 't-d2', kind: 'deadline', title: 'Complete hackathon registration', createdBy: 'u2', date: today, dueAt: stamp(6 * HOUR, 20), notifySecondUser: true },
    { ...base, id: 't-d3', kind: 'deadline', title: 'Submit project report', createdBy: 'u1', date: today, dueAt: stamp(10 * HOUR, 2), notifySecondUser: false },
    // --- today's daily tasks
    { ...base, id: 't-a1', kind: 'daily', title: 'Practice DSA', notes: 'Two medium problems on graphs.', createdBy: 'u1', date: today, time: '10:00', notifySecondUser: false },
    { ...base, id: 't-a2', kind: 'daily', title: 'Work on portfolio', createdBy: 'u1', date: today, time: '14:00', notifySecondUser: true },
    { ...base, id: 't-a3', kind: 'daily', title: 'Finish assignment', createdBy: 'u2', date: today, notifySecondUser: true },
    // --- upcoming
    { ...base, id: 't-u1', kind: 'daily', title: 'Revise operating systems notes', createdBy: 'u1', date: day(1), time: '19:00', notifySecondUser: false },
    { ...base, id: 't-u2', kind: 'daily', title: 'Prepare mock interview questions', createdBy: 'u2', date: day(1), notifySecondUser: true },
    { ...base, id: 't-u3', kind: 'daily', title: 'Plan weekend trip itinerary', createdBy: 'u2', date: day(3), notifySecondUser: true },
    { ...base, id: 't-f1', kind: 'deadline', title: 'Apply for research fellowship', createdBy: 'u1', date: day(2), dueAt: at(day(2), '18:00'), notifySecondUser: true },
    { ...base, id: 't-f2', kind: 'deadline', title: 'Submit conference abstract', createdBy: 'u2', date: day(6), dueAt: at(day(6), '23:59'), notifySecondUser: false },
    // --- past: expired deadlines (missed) + one completed
    { ...base, id: 't-p1', kind: 'deadline', title: 'Submit scholarship form', createdBy: 'u1', date: day(-1), dueAt: at(day(-1), '17:00'), notifySecondUser: true },
    { ...base, id: 't-p2', kind: 'deadline', title: 'Register for coding contest', createdBy: 'u2', date: day(-4), dueAt: at(day(-4), '12:00'), notifySecondUser: false },
    { ...base, id: 't-p3', kind: 'deadline', title: 'Submit lab record', createdBy: 'u1', date: day(-3), dueAt: at(day(-3), '16:30'), notifySecondUser: true, status: 'completed', completedAt: at(day(-3), '15:10'), completedBy: 'u1' },
    // --- past daily tasks
    { ...base, id: 't-h1', kind: 'daily', title: 'Call the landlord', createdBy: 'u2', date: day(-1), notifySecondUser: true },
    { ...base, id: 't-h2', kind: 'daily', title: 'Practice DSA', createdBy: 'u1', date: day(-1), time: '10:00', notifySecondUser: false, status: 'completed', completedAt: at(day(-1), '11:20'), completedBy: 'u1' },
    { ...base, id: 't-h3', kind: 'daily', title: 'Work on portfolio', createdBy: 'u1', date: day(-1), time: '14:00', notifySecondUser: true, status: 'completed', completedAt: at(day(-1), '16:05'), completedBy: 'u1' },
    { ...base, id: 't-h4', kind: 'daily', title: 'Finish assignment', createdBy: 'u2', date: day(-2), notifySecondUser: true, status: 'completed', completedAt: at(day(-2), '21:40'), completedBy: 'u2' },
    { ...base, id: 't-h5', kind: 'daily', title: 'Practice DSA', createdBy: 'u1', date: day(-2), time: '10:00', notifySecondUser: false, status: 'completed', completedAt: at(day(-2), '10:50'), completedBy: 'u1' },
  ]

  // History patterns run oldest → newest over the 28 days before today:
  // d = completed, m = missed (only applied on scheduled days).
  const HISTORY_DAYS = 28
  const startDate = day(-HISTORY_DAYS)
  const history = (pattern: string, schedule: Habit['schedule'], hour: string): Habit['log'][string] => {
    const log: Habit['log'][string] = {}
    const p = pattern.slice(-HISTORY_DAYS)
    for (let i = 0; i < p.length; i++) {
      const key = day(i - p.length)
      const dow = atTime(key, '00:00').getDay()
      if (schedule.type === 'weekdays' && !schedule.days.includes(dow)) continue
      log[key] = p[i] === 'd' ? { status: 'done', at: at(key, hour) } : { status: 'missed' }
    }
    return log
  }
  // Partner already checked in for one habit today — independent of the current user.
  const earlierToday = new Date(Math.max(atTime(today, '00:01').getTime(), now.getTime() - 2 * HOUR)).toISOString()

  const common = { createdAt: created, paused: false, startDate }
  const exercise: Habit['schedule'] = { type: 'weekdays', days: [1, 2, 4, 5, 6, 0] }
  const journal: Habit['schedule'] = { type: 'weekdays', days: [1, 2, 3, 4, 5] }
  const habits: Habit[] = [
    // Personal habit (current user)
    { ...common, id: 'h-1', title: 'Exercise', createdBy: 'u1', participants: ['u1'], notifySecondUser: true, schedule: exercise, log: { u1: history('ddmddddmdddddmdddddddddmdddd', exercise, '19:10') } },
    // Shared habit — each person has an independent record and streak
    { ...common, id: 'h-2', title: 'Read', notes: '20 pages minimum.', createdBy: 'u1', participants: ['u1', 'u2'], notifySecondUser: true, schedule: { type: 'daily' },
      log: { u1: history('dmddmdddddmdmdddddddmddddmdd', { type: 'daily' }, '21:05'), u2: history('dddddmdddddddddddddddddddmmm', { type: 'daily' }, '22:15') } },
    // Shared habit — partner has already completed today, you have not
    { ...common, id: 'h-3', title: 'Drink water', createdBy: 'u2', participants: ['u1', 'u2'], notifySecondUser: true, schedule: { type: 'daily' },
      log: { u1: history('dddddmddddddddmdddddddddddmd', { type: 'daily' }, '20:30'), u2: { ...history('ddddddddddddddddmddddddddddd', { type: 'daily' }, '20:45'), [today]: { status: 'done', at: earlierToday } } } },
    // Partner's habit (visible to both)
    { ...common, id: 'h-4', title: 'Evening journal', createdBy: 'u2', participants: ['u2'], notifySecondUser: false, schedule: journal, log: { u2: history('ddddmdddddmddddddddddmddddd', journal, '21:40') } },
  ]

  return { tasks, habits }
}
