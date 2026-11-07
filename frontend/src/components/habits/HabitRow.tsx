import { Flame } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatTime } from '../../services/dates'
import { habitScope, isShared, scheduleLabel, streakOf } from '../../services/habits'
import type { Habit } from '../../types'
import { NotifyBell } from '../tasks/NotifyBell'
import { Avatar } from '../ui/Avatar'
import { AuroraCard } from '../ui/AuroraCard'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'
import { EditButton } from '../ui/EditButton'
import { ScopeBadge } from './HabitCard'

/** Today row for a habit the current user takes part in. Completes only the user's own record. */
export function HabitRow({ habit }: { habit: Habit }) {
  const { today, me, partner, toggleHabit } = useApp()
  const entry = habit.log[me.id]?.[today]
  const done = entry?.status === 'done'
  const streak = streakOf(habit, me.id, today)
  const partnerEntry = habit.log[partner.id]?.[today]

  return (
    <AuroraCard variant="habit" completed={done} className="flex items-center gap-3 p-3.5 sm:p-4">
      <CheckButton size="sm" checked={done} onToggle={() => toggleHabit(habit.id)} label={`${done ? 'Undo' : 'Mark done'}: ${habit.title}`} />
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-2 text-sm font-medium', done && 'text-muted line-through decoration-muted/60')}>
          <span className="truncate">{habit.title}</span>
          <ScopeBadge scope={habitScope(habit, me.id)} className="no-underline" />
        </p>
        <p className="text-xs text-muted">
          {done ? <span className="text-ok">You: done at {formatTime(entry.at!)}</span> : scheduleLabel(habit)}
          {isShared(habit) && (
            <span className={cn('block sm:ml-2 sm:inline', partnerEntry?.status === 'done' ? 'text-partner' : '')}>
              <span className="hidden sm:inline">· </span>
              {partner.name}: {partnerEntry?.status === 'done' ? `done ${formatTime(partnerEntry.at!)}` : 'not yet'}
            </span>
          )}
        </p>
      </div>
      <EditButton target={{ type: 'habit', id: habit.id }} label={`Edit ${habit.title}`} />
      {habit.notifySecondUser && <NotifyBell />}
      {streak > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-xs font-semibold text-warn" title={`Your ${streak}-day streak`}>
          <Flame className="h-3 w-3" />
          {streak}
        </span>
      )}
    </AuroraCard>
  )
}

/** Read-only row: the partner's personal habit (visible to both, completed by its owner). */
export function PartnerHabitRow({ habit }: { habit: Habit }) {
  const { today, partner } = useApp()
  const entry = habit.log[partner.id]?.[today]
  const done = entry?.status === 'done'
  return (
    <AuroraCard variant="info" className="aurora-static flex items-center gap-3 p-3.5">
      <Avatar user={partner} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{habit.title}</p>
        <p className="text-xs text-muted">{scheduleLabel(habit)}</p>
      </div>
      <span className={cn('text-xs font-semibold', done ? 'text-partner' : 'text-muted')}>{done ? `Done ${formatTime(entry.at!)}` : 'Not yet'}</span>
    </AuroraCard>
  )
}
