import { Clock } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatDeadline, formatRemaining, formatTime } from '../../services/dates'
import { remainingMs, urgencyOf } from '../../services/urgency'
import type { Task } from '../../types'
import { Avatar } from '../ui/Avatar'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'
import { NotifyBell } from './NotifyBell'
import { SwipeRow } from './SwipeRow'
import { UrgencyBadge } from './UrgencyBadge'

const BAR = { critical: 'bg-danger', approaching: 'bg-warn', normal: 'bg-accent', done: 'bg-ok/60' } as const
const TINT = {
  critical: 'border-danger/30 bg-danger/[0.06] shadow-[0_0_0_1px_rgb(var(--danger)/0.08),0_10px_30px_-18px_rgb(var(--danger)/0.5)]',
  approaching: 'border-warn/25 bg-warn/[0.07]',
  normal: 'border-line/10 bg-card/70',
  done: 'border-line/10 bg-card/40',
} as const

export function DeadlineCard({ task }: { task: Task }) {
  const { now, today, toggleTask, userById } = useApp()
  const urgency = urgencyOf(task, now)
  const done = task.status === 'completed'
  const owner = userById(task.createdBy)

  return (
    <SwipeRow onComplete={() => toggleTask(task.id)} disabled={done}>
      <article className={cn('relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 pl-5 sm:gap-3.5 sm:p-4 sm:pl-5 shadow-card transition duration-300', TINT[urgency], done && 'opacity-70')}>
        <span className={cn('absolute inset-y-0 left-0 w-1.5', BAR[urgency])} />
        <CheckButton checked={done} onToggle={() => toggleTask(task.id)} label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} />
        <div className="min-w-0 flex-1">
          <h3 className={cn('line-clamp-2 text-[15px] font-semibold leading-snug', done && 'text-muted line-through decoration-muted/60')}>{task.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDeadline(task.dueAt!, today)}
            </span>
            {done ? (
              <span className="font-medium text-ok">Completed at {formatTime(task.completedAt!)}</span>
            ) : (
              <span className={cn('font-semibold tabular-nums', urgency === 'critical' ? 'text-danger' : urgency === 'approaching' ? 'text-warn' : 'text-accent')}>
                {formatRemaining(remainingMs(task, now))}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <UrgencyBadge urgency={urgency} />
          <div className="flex items-center gap-2">
            {task.notifySecondUser && <NotifyBell />}
            <Avatar user={owner} size="xs" />
          </div>
        </div>
      </article>
    </SwipeRow>
  )
}
