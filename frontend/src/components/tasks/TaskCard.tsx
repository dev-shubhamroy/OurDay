import { StickyNote } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatClock, formatTime } from '../../services/dates'
import type { Task } from '../../types'
import { Avatar } from '../ui/Avatar'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'
import { NotifyBell } from './NotifyBell'
import { SwipeRow } from './SwipeRow'

/** Ordinary daily task. Stays in place after completion for the rest of the day. */
export function TaskCard({ task }: { task: Task }) {
  const { toggleTask, userById } = useApp()
  const done = task.status === 'completed'
  const owner = userById(task.createdBy)
  return (
    <SwipeRow onComplete={() => toggleTask(task.id)} disabled={done}>
      <article className={cn('lift flex items-center gap-3.5 rounded-tile border border-line/10 bg-card/70 p-4 shadow-card', done && 'bg-card/40 opacity-70')}>
        <CheckButton checked={done} onToggle={() => toggleTask(task.id)} label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} />
        <div className="min-w-0 flex-1">
          <h3 className={cn('truncate text-[15px] font-medium', done && 'text-muted line-through decoration-muted/60')}>{task.title}</h3>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            {done ? <span className="font-medium text-ok">Completed at {formatTime(task.completedAt!)}</span> : <span>{task.time ? formatClock(task.time) : 'Anytime today'}</span>}
            {task.notes && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <StickyNote className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.notes}</span>
              </span>
            )}
          </p>
        </div>
        {task.notifySecondUser && <NotifyBell />}
        <Avatar user={owner} size="xs" />
      </article>
    </SwipeRow>
  )
}
