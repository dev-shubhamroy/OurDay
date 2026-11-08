import { Bell, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNotifications } from '../../hooks/useNotifications'
import { IconButton } from '../ui/IconButton'
import { NotificationList } from './NotificationList'

/** Header bell with an unread badge and a dropdown of recent notifications. Hidden in demo mode. */
export function NotificationBell() {
  const n = useNotifications()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!n || n.unavailable) return null
  return (
    <div ref={box} className="relative">
      <IconButton label={n.unread > 0 ? `Notifications, ${n.unread} unread` : 'Notifications'} onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative">
        <Bell className="h-[18px] w-[18px]" />
        {n.unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[18px] text-bg">{n.unread > 99 ? '99+' : n.unread}</span>
        )}
      </IconButton>
      {open && (
        <div role="dialog" aria-label="Notifications" className="glass fixed inset-x-3 top-[4.5rem] z-50 max-h-[70vh] overflow-hidden rounded-card shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[24rem]">
          <div className="flex items-center justify-between border-b border-line/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications{n.unread > 0 && <span className="ml-2 text-xs font-medium text-accent">{n.unread} unread</span>}</h2>
            <button type="button" onClick={() => void n.markAllRead()} disabled={n.unread === 0} className="inline-flex items-center gap-1 text-xs font-semibold text-accent disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[52vh] overflow-y-auto">
            <NotificationList items={n.items.slice(0, 15)} onNavigate={() => setOpen(false)} />
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line/10 px-4 py-3 text-center text-xs font-semibold text-accent hover:bg-line/10">
            View all and manage settings
          </Link>
        </div>
      )}
    </div>
  )
}
