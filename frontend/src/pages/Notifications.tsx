import { Bell, CheckCheck } from 'lucide-react'
import { NotificationList } from '../components/notifications/NotificationList'
import { NotificationSettings } from '../components/notifications/NotificationSettings'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useNotifications } from '../hooks/useNotifications'

export default function Notifications() {
  const n = useNotifications()
  if (!n || n.unavailable) {
    return (
      <>
        <PageHeader eyebrow="Activity" title="Notifications" subtitle="Reminders, check-ins and partner activity." />
        <p className="panel max-w-xl p-5 text-sm text-muted">
          <Bell className="mr-2 inline h-4 w-4" />
          Notifications aren’t available in this mode yet. Sign in with a connected workspace to see your history.
        </p>
      </>
    )
  }
  return (
    <>
      <PageHeader eyebrow="Activity" title="Notifications" subtitle="Everything OurDay reminded you about, the same on the web and your Mac." />
      <div className="grid max-w-3xl gap-5">
        <section className="panel animate-rise overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/10 px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold">
              History{n.unread > 0 && <span className="ml-2 text-xs font-medium text-accent">{n.unread} unread</span>}
            </h2>
            <Button variant="ghost" size="sm" icon={<CheckCheck className="h-4 w-4" />} disabled={n.unread === 0} onClick={() => void n.markAllRead()}>
              Mark all read
            </Button>
          </div>
          <NotificationList items={n.items} empty="No notifications yet. Reminders appear here as deadlines approach." />
        </section>
        <section className="panel animate-rise p-5 sm:p-6">
          <h2 className="mb-2 text-base font-semibold">Preferences</h2>
          <NotificationSettings />
        </section>
      </div>
    </>
  )
}
