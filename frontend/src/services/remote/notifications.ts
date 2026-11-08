import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationKind = 'deadline' | 'habit' | 'partner'

/** Row as stored in `public.notifications` (created only by the database, never by clients). */
export interface NotificationRow {
  id: string
  kind: NotificationKind
  title: string
  body: string
  task_id: string | null
  habit_id: string | null
  actor_id: string | null
  occurred_at: string
  read_at: string | null
  /** Shared-task notifications: reminder, completion_request, completion_approved, completion_rejected, shared_task. */
  subtype?: string | null
  /** Reminders disappear after this moment (24 hours). */
  expires_at?: string | null
}

/** Row of `public.notification_preferences`. Synced between the web app and the Mac companion. */
export interface NotificationPrefs {
  master: boolean
  deadlines: boolean
  habits: boolean
  partner: boolean
  unlock_briefing: boolean
  timezone: string
}

export const DEFAULT_PREFS: NotificationPrefs = { master: true, deadlines: true, habits: true, partner: true, unlock_briefing: true, timezone: 'UTC' }

export const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export const unreadCount = (rows: NotificationRow[]): number => rows.filter((r) => r.read_at === null).length

/** Where a notification points: the habit, the deadline, or the home screen for partner task activity. */
export function targetFor(n: Pick<NotificationRow, 'kind' | 'habit_id' | 'task_id'> & { subtype?: string | null }): string {
  // Shared-task notifications open that task on the Shared screen.
  if (n.subtype) return n.task_id ? `/shared?task=${n.task_id}` : '/shared'
  if (n.habit_id || n.kind === 'habit') return '/habits'
  if (n.kind === 'deadline') return '/deadlines'
  return '/home'
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (dayKey(d) === dayKey(now)) return 'Today'
  if (dayKey(d) === dayKey(y)) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Newest first, grouped by local calendar day. */
export function groupByDay(rows: NotificationRow[], now: Date): { label: string; rows: NotificationRow[] }[] {
  const sorted = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  const groups: { label: string; rows: NotificationRow[] }[] = []
  for (const r of sorted) {
    const label = dayLabel(r.occurred_at, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.rows.push(r)
    else groups.push({ label, rows: [r] })
  }
  return groups
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Missing columns fall back to defaults, so an older row never breaks the UI. */
export const withDefaults = (p: Partial<NotificationPrefs> | null | undefined): NotificationPrefs => ({ ...DEFAULT_PREFS, ...(p ?? {}) })

/** The database function or tables may not exist yet (migration not applied). */
export const isMissingBackend = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883' || /could not find the (function|table)/i.test(e.message ?? ''))

const COLUMNS = 'id, kind, title, body, task_id, habit_id, actor_id, occurred_at, read_at, subtype, expires_at'

export async function fetchNotifications(client: SupabaseClient, limit = 100) {
  return client.from('notifications').select(COLUMNS).order('occurred_at', { ascending: false }).limit(limit)
}
export const fetchPrefs = (client: SupabaseClient, uid: string) => client.from('notification_preferences').select('master, deadlines, habits, partner, unlock_briefing, timezone').eq('user_id', uid).maybeSingle()
export const savePrefs = (client: SupabaseClient, uid: string, prefs: NotificationPrefs) => client.from('notification_preferences').upsert({ user_id: uid, ...prefs }, { onConflict: 'user_id' })
export const markRead = (client: SupabaseClient, id: string) => client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null)
export const markAllRead = (client: SupabaseClient, uid: string) => client.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null)
/** Asks the database to create this person's due reminders (idempotent; also run every minute by pg_cron when available). */
export const generateMine = (client: SupabaseClient) => client.rpc('generate_my_notifications')
