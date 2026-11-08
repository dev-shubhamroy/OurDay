import { NavLink } from 'react-router-dom'
import { CalendarCheck, House, Repeat, Menu, Timer, type LucideIcon } from 'lucide-react'
import { cn } from '../ui/cn'

const ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/today', label: 'Today', icon: CalendarCheck },
  { to: '/deadlines', label: 'Deadlines', icon: Timer },
  { to: '/habits', label: 'Habits', icon: Repeat },
]

/** Android-style bottom navigation (below the lg breakpoint). "More" opens the full menu drawer. */
export function BottomNav({ onMore, moreActive }: { onMore: () => void; moreActive: boolean }) {
  return (
    <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-1">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              className={({ isActive }) => cn('group relative flex h-16 min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200', isActive ? 'text-accent' : 'text-muted active:text-fg')}
            >
              {({ isActive }) => (
                <>
                  <span className={cn('grid h-8 w-14 place-items-center rounded-full transition-colors duration-200', isActive ? 'bg-accent/15' : 'group-active:bg-line/10')}>
                    <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.3 : 1.8} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li className="min-w-0 flex-1">
          <button onClick={onMore} aria-label="More" aria-haspopup="dialog" className={cn('group flex h-16 min-h-[44px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200', moreActive ? 'text-accent' : 'text-muted active:text-fg')}>
            <span className={cn('grid h-8 w-14 place-items-center rounded-full', moreActive ? 'bg-accent/15' : 'group-active:bg-line/10')}>
              <Menu className="h-[22px] w-[22px]" strokeWidth={1.8} />
            </span>
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
