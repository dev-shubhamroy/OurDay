import { Bell, Flag, Repeat, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { groupByDay, targetFor, timeOf, type NotificationRow } from '../../services/remote/notifications'
import { useNotifications } from '../../hooks/useNotifications'
import { useNow } from '../../hooks/useNow'
import { cn } from '../ui/cn'

const ICON = { deadline: Flag, habit: Repeat, partner: Users } as const

export function NotificationList({ items, onNavigate, empty = 'No notifications yet.' }: { items: NotificationRow[]; onNavigate?: () => void; empty?: string }) {
  const n = useNotifications()
  const now = useNow()
  const navigate = useNavigate()
  if (!n) return null
  if (items.length === 0) {
    return (
      <div className="grid place-items-center gap-2 px-4 py-10 text-center text-sm text-muted">
        <Bell className="h-6 w-6 opacity-60" />
        {empty}
      </div>
    )
  }
  const groups = groupByDay(items, now)
  return (
    <div>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="eyebrow px-4 pb-1 pt-3">{g.label}</h3>
          <ul>
            {g.rows.map((r) => {
              const Icon = ICON[r.kind]
              const unread = r.read_at === null
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void n.markRead(r.id)
                      navigate(targetFor(r))
                      onNavigate?.()
                    }}
                    className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-line/10', unread && 'bg-accent/5')}
                  >
                    <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl', unread ? 'bg-accent/15 text-accent' : 'bg-line/10 text-muted')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', unread ? 'font-semibold' : 'font-medium text-fg/80')}>{r.title}</span>
                      <span className="block text-xs text-muted">{r.body}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted">
                      {timeOf(r.occurred_at)}
                      {unread && <span aria-label="Unread" className="h-2 w-2 rounded-full bg-accent" />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
