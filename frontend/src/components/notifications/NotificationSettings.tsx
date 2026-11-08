import { Monitor } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import { Switch } from '../ui/Controls'
import type { NotificationPrefs } from '../../services/remote/notifications'

const ROWS: { key: keyof Omit<NotificationPrefs, 'timezone'>; label: string; hint: string; needsMaster: boolean }[] = [
  { key: 'master', label: 'Notifications', hint: 'Master switch. Off silences everything below, on every device.', needsMaster: false },
  { key: 'deadlines', label: 'Deadline reminders', hint: '24h, 12h, 6h, 3h, 2h, 1h, 30m, 15m, 5m and at the deadline.', needsMaster: true },
  { key: 'habits', label: 'Habit check-ins', hint: 'A 9:30 PM question about each habit scheduled for the day.', needsMaster: true },
  { key: 'partner', label: 'Partner activity', hint: 'When your partner completes your tasks or items they share with you.', needsMaster: true },
  { key: 'unlock_briefing', label: 'RANA briefing when my Mac unlocks', hint: 'Mac companion only. Does not affect notifications.', needsMaster: false },
]

export function NotificationSettings() {
  const n = useNotifications()
  if (!n || n.unavailable) return null
  return (
    <div>
      <ul className="divide-y divide-line/10">
        {ROWS.map((r) => {
          const disabled = r.needsMaster && !n.prefs.master
          return (
            <li key={r.key} className="flex items-center gap-4 py-3">
              <div className={`min-w-0 flex-1 ${disabled ? 'opacity-50' : ''}`}>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {r.label}
                  {r.key === 'unlock_briefing' && <Monitor className="h-3.5 w-3.5 text-muted" aria-hidden />}
                </p>
                <p className="text-xs text-muted">{r.hint}</p>
              </div>
              <Switch checked={n.prefs[r.key]} onChange={(v) => void n.setPref(r.key, v)} label={r.label} />
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">Time zone used for check-ins: {n.prefs.timezone}</p>
      {n.error && <p role="alert" className="mt-2 text-xs text-danger">{n.error}</p>}
    </div>
  )
}
