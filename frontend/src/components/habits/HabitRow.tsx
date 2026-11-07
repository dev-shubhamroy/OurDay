import { Flame } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatTime } from '../../services/dates'
import { scheduleLabel, streakOf } from '../../services/habits'
import type { Habit } from '../../types'
import { NotifyBell } from '../tasks/NotifyBell'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'

/** Compact habit row for the Today screen. */
export function HabitRow({ habit }: { habit: Habit }) {
  const { today, toggleHabit } = useApp()
  const entry = habit.log[today]
  const done = entry?.status === 'done'
  const streak = streakOf(habit, today)
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border border-line/10 bg-card/70 p-3.5 shadow-card transition duration-300', done && 'bg-card/40 opacity-70')}>
      <CheckButton size="sm" checked={done} onToggle={() => toggleHabit(habit.id)} label={`${done ? 'Mark incomplete' : 'Mark done'}: ${habit.title}`} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', done && 'text-muted line-through decoration-muted/60')}>{habit.title}</p>
        <p className="text-xs text-muted">{done ? <span className="text-ok">Done at {formatTime(entry.at!)}</span> : scheduleLabel(habit)}</p>
      </div>
      {habit.notifySecondUser && <NotifyBell />}
      {streak > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-xs font-semibold text-warn" title={`${streak}-day streak`}>
          <Flame className="h-3 w-3" />
          {streak}
        </span>
      )}
    </div>
  )
}
