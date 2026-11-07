import { describe, expect, it } from 'vitest'
import { A, B, NOW, TODAY, day, daily, deadline, done, habit } from '../test/fixtures'
import { comingUpTasks, isExpired, openDeadlinesOn, pastDeadlines, personDay, taskProgress, todayDeadlines } from './selectors'
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
