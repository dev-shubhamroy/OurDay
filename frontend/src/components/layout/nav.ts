import { CalendarCheck, CalendarClock, CheckCircle2, History, House, Repeat, Settings, Timer, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/today', label: 'Today', icon: CalendarCheck },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarClock },
  { to: '/deadlines', label: 'Deadlines', icon: Timer },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/completed', label: 'Completed', icon: CheckCircle2 },
  { to: '/past', label: 'Past / Missed', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]
