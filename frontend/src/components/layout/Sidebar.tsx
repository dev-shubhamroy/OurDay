import { NavLink } from 'react-router-dom'
import { useApp } from '../../hooks/useApp'
import { futureDeadlines, taskProgress, todayDeadlines } from '../../services/selectors'
import { Avatar } from '../ui/Avatar'
import { BrandMark } from '../ui/RanaMark'
import { cn } from '../ui/cn'
import { NAV_ITEMS } from './nav'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { tasks, now, users } = useApp()
  const p = taskProgress(tasks, now)
  const badges: Record<string, number | undefined> = {
    '/today': p.total - p.done,
    '/deadlines': todayDeadlines(tasks, now).filter((t) => t.status === 'open').length + futureDeadlines(tasks, now).length,
  }
  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-3 px-2 pt-1">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-lg font-semibold tracking-tight">OurDay</p>
          <p className="text-[11px] text-muted">Plan together. Stay in sync.</p>
        </div>
      </div>

      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        const count = badges[to]
        return (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition duration-200',
                isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-line/10 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-4 h-5 w-1 rounded-r-full bg-accent shadow-glow" />}
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="flex-1">{label}</span>
                {count ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold text-accent">{count}</span>
                ) : null}
              </>
            )}
          </NavLink>
        )
      })}

      <div className="mt-auto rounded-2xl border border-line/10 bg-card/50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {users.map((u) => (
              <Avatar key={u.id} user={u} size="sm" className="ring-card" />
            ))}
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium">{users.map((u) => u.name).join(' & ')}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" /> In sync
            </p>
          </div>
        </div>
      </div>
    </nav>
  )
}
