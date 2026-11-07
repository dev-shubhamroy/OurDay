import { describe, expect, it } from 'vitest'
import { A, B } from '../../test/fixtures'
import { toKey } from '../dates'
import { habitFromRow, initialsOf, logsByUser, taskFromRow, weekdaysToDb, type HabitLogRow, type HabitRow, type TaskRow } from './mappers'
import { mapMembers } from './workspace'

const baseTask: TaskRow = { id: 't', kind: 'daily', title: 'x', notes: null, created_by: A, notify_second_user: true, task_date: '2026-11-07', planned_time: '14:30:00', due_at: null, status: 'open', completed_at: null, completed_by: null, created_at: '2026-11-01T00:00:00Z' }
const baseHabit: HabitRow = { id: 'h', title: 'Read', notes: null, created_by: A, is_shared: true, owner_id: null, schedule_days: null, paused: false, start_date: '2026-10-01', notify_second_user: false }

describe('task mapping', () => {
  it('keeps the single completion record and the notify flag (not access)', () => {
    const t = taskFromRow({ ...baseTask, status: 'completed', completed_at: '2026-11-07T10:00:00Z', completed_by: B })
    expect(t.completedBy).toBe(B)
    expect(t.createdBy).toBe(A)
    expect(t.notifySecondUser).toBe(true)
  })

  it('shows planned time as HH:mm', () => {
    expect(taskFromRow(baseTask).time).toBe('14:30')
  })

  it("derives a deadline's day from the exact instant in the viewer's time zone", () => {
    const due = new Date(2026, 10, 8, 23, 30) // local 11:30 PM
    const t = taskFromRow({ ...baseTask, kind: 'deadline', planned_time: null, task_date: '1999-01-01', due_at: due.toISOString() })
    expect(t.date).toBe(toKey(due))
  })
})

describe('habit mapping', () => {
  it('shared habits include both members; personal only the owner', () => {
    expect(habitFromRow(baseHabit, [A, B], undefined).participants).toEqual([A, B])
    expect(habitFromRow({ ...baseHabit, is_shared: false, owner_id: B }, [A, B], undefined).participants).toEqual([B])
  })

  it('null days = every day; a partial set = selected weekdays; all seven = every day', () => {
    expect(habitFromRow(baseHabit, [A, B], undefined).schedule).toEqual({ type: 'daily' })
    expect(habitFromRow({ ...baseHabit, schedule_days: [1, 3, 5] }, [A, B], undefined).schedule).toEqual({ type: 'weekdays', days: [1, 3, 5] })
    expect(habitFromRow({ ...baseHabit, schedule_days: [0, 1, 2, 3, 4, 5, 6] }, [A, B], undefined).schedule).toEqual({ type: 'daily' })
  })

  it('round-trips schedules to the database form', () => {
    expect(weekdaysToDb({ type: 'daily' })).toBeNull()
    expect(weekdaysToDb({ type: 'weekdays', days: [5, 1] })).toEqual([1, 5])
  })
})

describe('habit log mapping keeps each person separate', () => {
  const rows: HabitLogRow[] = [
    { habit_id: 'h', user_id: A, day: '2026-11-06', status: 'done', done_at: '2026-11-06T20:00:00Z' },
    { habit_id: 'h', user_id: B, day: '2026-11-06', status: 'missed', done_at: null },
    { habit_id: 'h', user_id: B, day: '2026-11-05', status: 'done', done_at: '2026-11-05T21:00:00Z' },
  ]
  const grouped = logsByUser(rows).get('h')!

  it('A and B have independent statuses on the same date', () => {
    expect(grouped[A]['2026-11-06'].status).toBe('done')
    expect(grouped[B]['2026-11-06'].status).toBe('missed')
  })

  it('preserves completion timestamps and does not leak across people', () => {
    expect(grouped[A]['2026-11-06'].at).toBe('2026-11-06T20:00:00Z')
    expect(grouped[A]['2026-11-05']).toBeUndefined()
    expect(grouped[B]['2026-11-05'].at).toBe('2026-11-05T21:00:00Z')
  })
})

describe('workspace members', () => {
  it('puts the owner first and uses profile names', () => {
    const m = mapMembers(
      [
        { user_id: B, role: 'partner', joined_at: '2026-11-02T00:00:00Z' },
        { user_id: A, role: 'owner', joined_at: '2026-11-01T00:00:00Z' },
      ],
      [{ id: A, name: 'Asha' }, { id: B, name: 'Ben' }],
    )
    expect(m.map((x) => x.name)).toEqual(['Asha', 'Ben'])
    expect(m[0].role).toBe('owner')
  })

  it('makes sensible initials', () => {
    expect(initialsOf('Asha Rao')).toBe('AR')
    expect(initialsOf('ben')).toBe('BE')
    expect(initialsOf('  ')).toBe('?')
  })
})
