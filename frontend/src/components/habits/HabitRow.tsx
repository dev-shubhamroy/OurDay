import { Check, Flame } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { useView } from '../../hooks/useView'
import { formatTime } from '../../services/dates'
import { canManageHabit, habitScope, isShared, scheduleLabel, streakOf } from '../../services/habits'
import type { Habit } from '../../types'
import { NotifyBell } from '../tasks/NotifyBell'
import { AuroraCard } from '../ui/AuroraCard'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'
import { EditButton } from '../ui/EditButton'
import { ScopeBadge } from './HabitCard'

/**
 * Today row for a habit the viewed person takes part in.
 * My Mode: complete your own record. Partner Mode: read-only — it shows the partner's own record and never
 * writes anything (completion records are only ever written by their owner).
 */
export function HabitRow({ habit }: { habit: Habit }) {
  const { today, me, partner, toggleHabit } = useApp()
  const { subject, isPartnerView } = useView()
  const entry = habit.log[subject.id]?.[today]
  const done = entry?.status === 'done'
  const streak = streakOf(habit, subject.id, today)
  const partnerEntry = habit.log[partner.id]?.[today]
  const who = isPartnerView ? subject.name.split(' ')[0] : 'You'

  return (
    <AuroraCard variant="habit" completed={done} className="flex items-center gap-3 p-3.5 sm:p-4">
      {isPartnerView ? (
        <span
          role="img"
          aria-label={done ? `${subject.name} completed ${habit.title}` : `${subject.name} has not completed ${habit.title}`}
          className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', done ? 'border-ok bg-ok text-white' : 'border-line/30 text-transparent')}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
        </span>
      ) : (
        <CheckButton size="sm" checked={done} onToggle={() => toggleHabit(habit.id)} label={`${done ? 'Undo' : 'Mark done'}: ${habit.title}`} />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', done && 'text-muted line-through decoration-muted/60')}>{habit.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          <ScopeBadge scope={habitScope(habit, me.id)} />
          {done ? <span className={isPartnerView ? 'text-partner' : 'text-ok'}>{who}: done at {formatTime(entry.at!)}</span> : isPartnerView ? `${who}: not yet today` : scheduleLabel(habit)}
          {!isPartnerView && isShared(habit) && (
            <span className={cn('block sm:ml-2 sm:inline', partnerEntry?.status === 'done' ? 'text-partner' : '')}>
              <span className="hidden sm:inline">· </span>
              {partner.name}: {partnerEntry?.status === 'done' ? `done ${formatTime(partnerEntry.at!)}` : 'not yet'}
            </span>
          )}
        </p>
      </div>
      {canManageHabit(habit, me.id) && <EditButton target={{ type: 'habit', id: habit.id }} label={`Edit ${habit.title}`} />}
      {habit.notifySecondUser && <NotifyBell />}
      {streak > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-xs font-semibold text-warn" title={`${isPartnerView ? `${subject.name}’s` : 'Your'} ${streak}-day streak`}>
          <Flame className="h-3 w-3" />
          {streak}
        </span>
      )}
    </AuroraCard>
  )
}
