import { Moon } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { dayState } from '../../services/habits'
import { todayHabits } from '../../services/selectors'
import { AuroraCard } from '../ui/AuroraCard'
import { Button } from '../ui/Button'

const CHECK_IN_MINUTES = 21 * 60 + 30 // 9:30 PM, device-local time

/**
 * In-app 9:30 PM check-in. It only appears while OurDay is open and the device clock is past 9:30 PM.
 * It cannot send reminders when the app is closed — that needs a scheduled backend / native notification
 * (planned). Anything left unanswered still counts as missed at midnight.
 */
export function HabitCheckIn() {
  const { habits, now, today, me, toggleHabit, markHabitMissed } = useApp()
  if (now.getHours() * 60 + now.getMinutes() < CHECK_IN_MINUTES) return null
  const pending = todayHabits(habits, now, me.id).filter((h) => dayState(h, me.id, today, today) === 'pending')
  if (pending.length === 0) return null

  return (
    <AuroraCard variant="rana" large className="mb-6 animate-rise p-4 sm:p-5" aria-label="Habit check-in">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Moon className="h-4 w-4 text-accent" /> 9:30 PM check-in
      </p>
      <p className="mt-0.5 text-xs text-muted">Did you complete these today? Unanswered habits count as missed at midnight.</p>
      <ul className="mt-3 space-y-2">
        {pending.map((h) => (
          <li key={h.id} className="flex items-center gap-2 rounded-tile border border-line/10 bg-surface/60 p-2.5 pl-3.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.title}</span>
            <Button size="sm" variant="ghost" onClick={() => markHabitMissed(h.id)}>
              No
            </Button>
            <Button size="sm" onClick={() => toggleHabit(h.id)}>
              Yes
            </Button>
          </li>
        ))}
      </ul>
    </AuroraCard>
  )
}
