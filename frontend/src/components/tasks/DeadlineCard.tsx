import { Clock } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatDeadline, formatRemaining, formatTime } from '../../services/dates'
import { remainingMs, urgencyOf } from '../../services/urgency'
import type { Task } from '../../types'
import { Avatar } from '../ui/Avatar'
import { CheckButton } from '../ui/CheckButton'
import { EditButton } from '../ui/EditButton'
import { AuroraCard } from '../ui/AuroraCard'
import { cn } from '../ui/cn'
import { NotifyBell } from './NotifyBell'
import { SwipeRow } from './SwipeRow'
import { UrgencyBadge } from './UrgencyBadge'

export function DeadlineCard({ task, subdued, dayLabel }: { task: Task; subdued?: boolean; dayLabel?: 'Today' | 'Tomorrow' }) {
  const { now, today, toggleTask, userById } = useApp()
  const urgency = urgencyOf(task, now)
  const done = task.status === 'completed'
  const owner = userById(task.createdBy)

  return (
    <SwipeRow onComplete={() => toggleTask(task.id)} disabled={done} radius="rounded-card">
      <AuroraCard variant="deadline" as="article" tone={urgency} completed={done} subdued={subdued} className="flex items-center gap-3 p-4 pl-5 sm:gap-4 sm:p-5 sm:pl-7">
        <CheckButton checked={done} onToggle={() => toggleTask(task.id)} label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} />
        <div className="min-w-0 flex-1">
          <h3 className={cn('line-clamp-2 text-base font-bold leading-snug', subdued ? 'sm:text-[16px]' : 'sm:text-[17px]', done && 'text-muted line-through decoration-muted/60')}>{task.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {dayLabel ? formatTime(task.dueAt!) : formatDeadline(task.dueAt!, today)}
            </span>
            {dayLabel && (
              <span className={cn('rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide', dayLabel === 'Today' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line/20 bg-line/10 text-muted')}>{dayLabel}</span>
            )}
            {done ? (
              <span className="font-medium text-ok">Completed at {formatTime(task.completedAt!)}</span>
            ) : (
              <span className={cn('font-semibold tabular-nums', urgency === 'critical' ? 'text-danger' : urgency === 'approaching' ? 'text-warn' : 'text-accent')}>
                {formatRemaining(remainingMs(task, now))}
              </span>
            )}
          </p>
          <div className="mt-2.5 flex items-center gap-2 sm:hidden">
            <UrgencyBadge urgency={urgency} />
            <EditButton target={{ type: 'task', id: task.id }} label={`Edit ${task.title}`} />
            {task.notifySecondUser && <NotifyBell />}
            <Avatar user={owner} size="xs" />
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
          <UrgencyBadge urgency={urgency} />
          <div className="flex items-center gap-2">
            <EditButton target={{ type: 'task', id: task.id }} label={`Edit ${task.title}`} />
            {task.notifySecondUser && <NotifyBell />}
            <Avatar user={owner} size="xs" />
          </div>
        </div>
      </AuroraCard>
    </SwipeRow>
  )
}
