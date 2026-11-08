import { describe, expect, it } from 'vitest'
import { A, B, NOW, TODAY, day, daily, deadline, done, habit } from '../test/fixtures'
import { dayState, streakOf } from './habits'
import { toKey } from './dates'
import type { Task } from '../types'
import { nextDeadlines, comingUpTasks, habitProgress, habitsOf, isExpired, openDeadlinesOn, pastDeadlines, personDay, taskProgress, tasksOwnedBy, todayDeadlines } from './selectors'
import { urgencyOf } from './urgency'

describe('deadline grouping', () => {
  const tasks = [
    deadline('d1', 'Late tonight', 0, '23:00'),
    deadline('d2', 'Evening', 0, '18:00'),
    deadline('d3', 'Tomorrow morning', 1, '09:00'),
    deadline('d4', 'Tomorrow early', 1, '01:00'),
    deadline('d5', 'Next week', 6, '10:00'),
    deadline('d6', 'Already done', 0, '20:00', { status: 'completed', completedAt: NOW.toISOString(), completedBy: B }),
    deadline('d7', 'Expired this morning', 0, '08:00'),
    deadline('d8', 'Missed yesterday', -1, '12:00'),
  ]

  it("today's group lists open, unexpired deadlines earliest first", () => {
    expect(openDeadlinesOn(tasks, NOW, TODAY).map((t) => t.id)).toEqual(['d2', 'd1'])
  })

  it("tomorrow's group is sorted earliest first", () => {
    expect(openDeadlinesOn(tasks, NOW, day(1)).map((t) => t.id)).toEqual(['d4', 'd3'])
  })

  it('completed deadlines never appear in the open groups', () => {
    expect(openDeadlinesOn(tasks, NOW, TODAY).some((t) => t.id === 'd6')).toBe(false)
  })

  it('expired incomplete deadlines leave active lists and move to past', () => {
    expect(isExpired(tasks[6], NOW)).toBe(true)
    expect(todayDeadlines(tasks, NOW).some((t) => t.id === 'd7')).toBe(false)
    const past = pastDeadlines(tasks, NOW).map((t) => t.id)
    expect(past).toContain('d7')
    expect(past).toContain('d8')
  })

  it('Coming up includes today and tomorrow deadlines, hides completed, and excludes expired', () => {
    const ids = comingUpTasks(tasks, NOW).map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['d1', 'd2', 'd3', 'd4', 'd5']))
    expect(ids).not.toContain('d6')
    expect(ids).not.toContain('d7')
    expect(ids).not.toContain('d8')
  })

  it('Coming up also lists future daily tasks but not today\'s', () => {
    const ids = comingUpTasks([...tasks, daily('t1', 'Tomorrow task', 1), daily('t2', 'Today task', 0)], NOW).map((t) => t.id)
    expect(ids).toContain('t1')
    expect(ids).not.toContain('t2')
  })
})

describe('urgency uses the real timestamp', () => {
  it('critical <= 3h, approaching <= 8h, otherwise normal; completed is never urgent', () => {
    expect(urgencyOf(deadline('a', 'x', 0, '17:00'), NOW)).toBe('critical') // 2h
    expect(urgencyOf(deadline('b', 'x', 0, '21:00'), NOW)).toBe('approaching') // 6h
    expect(urgencyOf(deadline('c', 'x', 1, '15:00'), NOW)).toBe('normal') // 24h
    expect(urgencyOf(deadline('d', 'x', 0, '16:00', { status: 'completed' }), NOW)).toBe('done')
  })
})

describe('per-person progress (Together cards)', () => {
  const tasks = [
    daily('t1', 'A open', 0, { createdBy: A }),
    daily('t2', 'B open', 0, { createdBy: B }),
    daily('t3', 'Created by A, completed by B', 0, { createdBy: A, status: 'completed', completedAt: NOW.toISOString(), completedBy: B }),
    daily('t4', 'Tomorrow', 1, { createdBy: A }),
    deadline('d1', 'Expired', 0, '08:00', { createdBy: A }),
  ]
  const habits = [
    habit({ id: 'shared', title: 'Shared', participants: [A, B], log: { [A]: done(0) } }),
    habit({ id: 'mine', title: 'Mine', participants: [A], createdBy: A }),
    habit({ id: 'theirs', title: 'Theirs', participants: [B], createdBy: B }),
    habit({ id: 'paused', title: 'Paused', participants: [A, B], paused: true }),
  ]

  it('shared habit completion is independent: A done, B pending', () => {
    const a = personDay(tasks, habits, NOW, A)
    const b = personDay(tasks, habits, NOW, B)
    expect(a.done.map((i) => i.title)).toContain('Shared')
    expect(b.remaining.map((i) => i.title)).toContain('Shared')
    expect(b.done.map((i) => i.title)).not.toContain('Shared')
  })

  it("partner-only habits appear only in the partner's progress", () => {
    expect([...personDay(tasks, habits, NOW, A).remaining, ...personDay(tasks, habits, NOW, A).done].some((i) => i.title === 'Theirs')).toBe(false)
    expect(personDay(tasks, habits, NOW, B).remaining.some((i) => i.title === 'Theirs')).toBe(true)
  })

  it('a task has a single completion record and is counted once (by who completed it)', () => {
    const a = personDay(tasks, habits, NOW, A)
    const b = personDay(tasks, habits, NOW, B)
    const all = [...a.done, ...a.remaining, ...b.done, ...b.remaining].filter((i) => i.title.startsWith('Created by A'))
    expect(all).toHaveLength(1)
    expect(b.done.some((i) => i.title.startsWith('Created by A'))).toBe(true)
  })

  it('excludes future tasks, expired deadlines and paused habits', () => {
    const titles = [A, B].flatMap((u) => [...personDay(tasks, habits, NOW, u).done, ...personDay(tasks, habits, NOW, u).remaining]).map((i) => i.title)
    expect(titles).not.toContain('Tomorrow')
    expect(titles).not.toContain('Expired')
    expect(titles).not.toContain('Paused')
  })

  it('daily progress counts today\'s tasks only', () => {
    const p = taskProgress(tasks, NOW)
    expect(p.total).toBe(3)
    expect(p.done).toBe(1)
  })
})

describe('viewing mode filters (Partner Mode)', () => {
  const tasks = [
    deadline('a1', 'A deadline', 0, '18:00', { createdBy: A }),
    deadline('b1', 'B deadline', 0, '19:00', { createdBy: B }),
    daily('a2', 'A task', 0, { createdBy: A }),
    daily('b2', 'B task', 1, { createdBy: B, notifySecondUser: true }),
  ]
  const habits = [
    habit({ id: 'mine', participants: [A] }),
    habit({ id: 'theirs', participants: [B] }),
    habit({ id: 'shared', participants: [A, B], log: { [A]: done(0) } }),
  ]

  it('tasks belong to their creator, regardless of the notify flag', () => {
    expect(tasksOwnedBy(tasks, A).map((t) => t.id)).toEqual(['a1', 'a2'])
    expect(tasksOwnedBy(tasks, B).map((t) => t.id)).toEqual(['b1', 'b2'])
  })

  it("each person's deadline groups only contain their own deadlines", () => {
    expect(openDeadlinesOn(tasksOwnedBy(tasks, B), NOW, TODAY).map((t) => t.id)).toEqual(['b1'])
    expect(openDeadlinesOn(tasksOwnedBy(tasks, A), NOW, TODAY).map((t) => t.id)).toEqual(['a1'])
  })

  it("upcoming/coming-up follows the viewed person", () => {
    expect(comingUpTasks(tasksOwnedBy(tasks, B), NOW).map((t) => t.id)).toEqual(['b1', 'b2'])
  })

  it('habits include personal ones plus shared, never the other person\'s personal habits', () => {
    expect(habitsOf(habits, A).map((h) => h.id)).toEqual(['mine', 'shared'])
    expect(habitsOf(habits, B).map((h) => h.id)).toEqual(['theirs', 'shared'])
  })

  it("a shared habit shows the viewed person's own status, not mine", () => {
    const shared = habits[2]
    expect(dayState(shared, A, TODAY, TODAY)).toBe('done')
    expect(dayState(shared, B, TODAY, TODAY)).toBe('pending')
    expect(streakOf(shared, B, TODAY)).toBe(0)
  })

  it("daily progress is for the selected person only", () => {
    expect(habitProgress(habitsOf(habits, A), NOW, A)).toMatchObject({ done: 1, total: 2 })
    expect(habitProgress(habitsOf(habits, B), NOW, B)).toMatchObject({ done: 0, total: 2 })
    expect(taskProgress(tasksOwnedBy(tasks, B), NOW).total).toBe(1)
  })

  it('filtering is a pure view: the shared data is not modified', () => {
    const before = JSON.stringify(tasks) + JSON.stringify(habits)
    tasksOwnedBy(tasks, B)
    habitsOf(habits, B)
    expect(JSON.stringify(tasks) + JSON.stringify(habits)).toBe(before)
  })
})

describe('nextDeadlines (Home: Upcoming Deadlines)', () => {
  const now = new Date(2026, 10, 9, 13, 30) // 9 Nov 2026, 1:30 PM local
  const mk = (id: string, due: Date, over: Partial<Task> = {}): Task => ({
    id, kind: 'deadline', title: id, createdBy: 'u1', createdAt: '2026-11-01T00:00:00Z', notifySecondUser: false,
    date: toKey(due), dueAt: due.toISOString(), status: 'open', ...over,
  } as Task)
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m)

  it('orders today and tomorrow together by actual deadline and caps at three', () => {
    const tasks = [mk('tom-9am', at(10, 9)), mk('today-11pm', at(9, 23)), mk('today-5pm', at(9, 17)), mk('tom-8pm', at(10, 20))]
    expect(nextDeadlines(tasks, now).map((t) => t.id)).toEqual(['today-5pm', 'today-11pm', 'tom-9am'])
  })
  it('shows fewer when fewer exist and nothing when none do', () => {
    expect(nextDeadlines([mk('a', at(9, 18))], now)).toHaveLength(1)
    expect(nextDeadlines([], now)).toEqual([])
  })
  it('excludes completed, expired, later-than-tomorrow and daily tasks; never duplicates', () => {
    const tasks = [
      mk('done', at(9, 18), { status: 'completed', completedAt: at(9, 12).toISOString() }),
      mk('expired', at(9, 9)),
      mk('later', at(11, 10)),
      { ...mk('daily', at(9, 18)), kind: 'daily' } as Task,
      mk('ok', at(9, 19)),
    ]
    const r = nextDeadlines(tasks, now)
    expect(r.map((t) => t.id)).toEqual(['ok'])
    expect(new Set(r.map((t) => t.id)).size).toBe(r.length)
  })
  it('re-orders immediately when a deadline is edited or a task completes/deletes', () => {
    let tasks = [mk('a', at(9, 15)), mk('b', at(9, 16)), mk('c', at(10, 8)), mk('d', at(10, 9))]
    expect(nextDeadlines(tasks, now).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    tasks = tasks.map((t) => (t.id === 'd' ? mk('d', at(9, 14)) : t)) // edit d to 2 PM today
    expect(nextDeadlines(tasks, now).map((t) => t.id)).toEqual(['d', 'a', 'b'])
    tasks = tasks.map((t) => (t.id === 'd' ? { ...t, status: 'completed' as const } : t))
    expect(nextDeadlines(tasks, now).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(nextDeadlines(tasks.filter((t) => t.id !== 'a'), now).map((t) => t.id)).toEqual(['b', 'c'])
  })
  it('uses local calendar days: a 12:10 AM tomorrow deadline is tomorrow, not today', () => {
    const lateNow = new Date(2026, 10, 9, 23, 50)
    expect(nextDeadlines([mk('x', at(10, 0, 10)), mk('y', at(11, 0, 10))], lateNow).map((t) => t.id)).toEqual(['x'])
  })
})
