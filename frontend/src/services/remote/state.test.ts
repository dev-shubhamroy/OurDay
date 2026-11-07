import { describe, expect, it } from 'vitest'
import { A, B, TODAY, daily, habit } from '../../test/fixtures'
import { reducer, type State } from './state'

const base = (): State => ({ tasks: [daily('t1', 'x', 0)], habits: [habit({ log: { [B]: { [TODAY]: { status: 'done', at: 'x' } } } })], pulse: 0 })

describe('remote state reducer', () => {
  it("writing my habit log never touches my partner's log", () => {
    const s = reducer(base(), { type: 'log', id: 'h1', user: A, day: TODAY, entry: { status: 'done', at: 'now' } })
    expect(s.habits[0].log[A][TODAY].status).toBe('done')
    expect(s.habits[0].log[B][TODAY]).toEqual({ status: 'done', at: 'x' })
  })

  it("undoing my completion leaves my partner's completion intact", () => {
    const withMine = reducer(base(), { type: 'log', id: 'h1', user: A, day: TODAY, entry: { status: 'done' } })
    const s = reducer(withMine, { type: 'log', id: 'h1', user: A, day: TODAY, entry: null })
    expect(s.habits[0].log[A][TODAY]).toBeUndefined()
    expect(s.habits[0].log[B][TODAY].status).toBe('done')
  })

  it('a server snapshot replaces local state (server is the source of truth)', () => {
    const s = reducer(base(), { type: 'replace', tasks: [], habits: [] })
    expect(s.tasks).toHaveLength(0)
  })

  it('optimistic add is idempotent (no duplicates if re-applied)', () => {
    const t = daily('new', 'n', 0)
    const once = reducer(base(), { type: 'task', task: t })
    expect(reducer(once, { type: 'task', task: t }).tasks).toHaveLength(2)
  })

  it('patches and removes tasks', () => {
    const s1 = reducer(base(), { type: 'taskPatch', id: 't1', patch: { title: 'renamed' } })
    expect(s1.tasks[0].title).toBe('renamed')
    expect(reducer(s1, { type: 'taskRemove', id: 't1' }).tasks).toHaveLength(0)
  })
})
