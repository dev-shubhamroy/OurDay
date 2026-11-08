import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, groupByDay, isMissingBackend, targetFor, unreadCount, withDefaults, type NotificationRow } from './notifications'

const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: 'n', kind: 'deadline', title: 't', body: 'b', task_id: null, habit_id: null, actor_id: null, occurred_at: '2026-11-08T10:00:00Z', read_at: null, ...over,
})

describe('notification helpers', () => {
  it('counts unread only', () => {
    expect(unreadCount([row({}), row({ id: '2', read_at: '2026-11-08T11:00:00Z' }), row({ id: '3' })])).toBe(2)
    expect(unreadCount([])).toBe(0)
  })

  it('routes to the related screen', () => {
    expect(targetFor({ kind: 'habit', habit_id: 'h', task_id: null })).toBe('/habits')
    expect(targetFor({ kind: 'partner', habit_id: 'h', task_id: null })).toBe('/habits')
    expect(targetFor({ kind: 'deadline', habit_id: null, task_id: 't' })).toBe('/deadlines')
    expect(targetFor({ kind: 'partner', habit_id: null, task_id: 't' })).toBe('/home')
  })

  it('groups newest first by local day', () => {
    const now = new Date(2026, 10, 8, 12, 0, 0)
    const rows = [
      row({ id: 'old', occurred_at: new Date(2026, 10, 5, 9, 0).toISOString() }),
      row({ id: 'a', occurred_at: new Date(2026, 10, 8, 9, 0).toISOString() }),
      row({ id: 'b', occurred_at: new Date(2026, 10, 8, 11, 0).toISOString() }),
      row({ id: 'y', occurred_at: new Date(2026, 10, 7, 20, 0).toISOString() }),
    ]
    const g = groupByDay(rows, now)
    expect(g.map((x) => x.label).slice(0, 2)).toEqual(['Today', 'Yesterday'])
    expect(g[0].rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(g).toHaveLength(3)
  })

  it('falls back to defaults for missing preference fields', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_PREFS)
    expect(withDefaults({ partner: false })).toEqual({ ...DEFAULT_PREFS, partner: false })
  })

  it('recognises a backend without the notification tables/functions', () => {
    expect(isMissingBackend({ code: 'PGRST202' })).toBe(true)
    expect(isMissingBackend({ code: '42P01' })).toBe(true)
    expect(isMissingBackend({ message: 'Could not find the table public.notifications' })).toBe(true)
    expect(isMissingBackend({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingBackend(null)).toBe(false)
  })
})
