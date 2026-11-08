import { useState } from 'react'
import { BellRing, CheckCheck, Clock, RotateCcw, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatDeadline, formatTime } from '../../services/dates'
import { actionsFor, stateOf, STATE_LABEL } from '../../services/sharedTasks'
import { useUi } from '../../store/uiContext'
import type { Task } from '../../types'
import { EditButton } from '../ui/EditButton'
import { Chip } from '../tasks/TaskRow'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { ReminderComposer } from './ReminderComposer'

const TONE = { active: 'accent', awaiting_approval: 'warn', completed: 'ok' } as const

/** One shared task: clearly marked as shared, with its state and the actions the current person may take. */
export function SharedTaskCard({ task, highlighted }: { task: Task; highlighted?: boolean }) {
  const { me, partner, userById, today, requestCompletion, reviewCompletion, reopenShared } = useApp()
  const ui = useUi()
  const [composer, setComposer] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const state = stateOf(task)
  const hasPartner = partner.id !== 'pending-partner'
  const act = actionsFor(task, me.id, hasPartner)
  const creator = userById(task.createdBy)
  const requester = task.completionRequestedBy ? userById(task.completionRequestedBy) : null
  const otherFirst = partner.name.split(' ')[0]

  const run = async (key: string, fn: () => Promise<string | null>, done: string) => {
    if (busy) return
    setBusy(key)
    setError(null)
    const e = await fn()
    setBusy(null)
    if (e) setError(e)
    else ui.toast(done)
  }

  return (
    <article
      id={`shared-${task.id}`}
      aria-label={`Shared task: ${task.title}`}
      className={cn('panel relative overflow-hidden p-4 sm:p-5', state === 'awaiting_approval' && 'border-warn/40', state === 'completed' && 'opacity-90', highlighted && 'ring-2 ring-accent/60')}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', state === 'completed' ? 'bg-ok' : state === 'awaiting_approval' ? 'bg-warn' : 'bg-accent')} aria-hidden />
      <div className="flex items-start gap-3 pl-1.5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="accent">Shared</Chip>
            <Chip tone={TONE[state]}>{STATE_LABEL[state]}</Chip>
          </div>
          <h3 className={cn('mt-1.5 break-words text-[17px] font-semibold leading-snug', state === 'completed' && 'text-muted')}>{task.title}</h3>
          {task.notes && <p className="mt-1 whitespace-pre-line break-words text-sm text-muted">{task.notes}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Avatar user={creator} size="xs" /> Created by {creator.id === me.id ? 'you' : creator.name.split(' ')[0]} · {formatTime(task.createdAt)}
            </span>
            {task.dueAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {formatDeadline(task.dueAt, today)}
              </span>
            )}
          </p>
        </div>
        {state !== 'completed' && <EditButton target={{ type: 'task', id: task.id }} label={`Edit ${task.title}`} />}
      </div>

      {state === 'awaiting_approval' && requester && (
        <p className="ml-1.5 mt-3 rounded-tile border border-warn/30 bg-warn/10 px-3 py-2 text-sm">
          {act.review ? (
            <><strong>{requester.name.split(' ')[0]}</strong> says this is done. Do you agree?</>
          ) : (
            <>You asked {otherFirst} to confirm this is done. It isn’t completed until they approve.</>
          )}
        </p>
      )}
      {state === 'active' && task.rejectedBy && (
        <p className="ml-1.5 mt-3 text-xs text-muted">{userById(task.rejectedBy).name.split(' ')[0]} didn’t approve the last completion request{task.rejectedAt ? ` (${formatTime(task.rejectedAt)})` : ''}.</p>
      )}
      {state === 'completed' && (
        <p className="ml-1.5 mt-3 text-xs text-ok">
          Completed {task.approvedAt ? formatTime(task.approvedAt) : ''} · requested by {task.completedBy ? userById(task.completedBy).name.split(' ')[0] : '—'}
          {task.approvedBy ? `, approved by ${userById(task.approvedBy).name.split(' ')[0]}` : ''}
        </p>
      )}

      <div className="ml-1.5 mt-3 flex flex-wrap gap-2">
        {act.requestCompletion && (
          <Button size="sm" icon={<CheckCheck className="h-4 w-4" />} disabled={!!busy || !hasPartner} onClick={() => void run('req', () => requestCompletion(task.id), 'Asked for approval')} title={!hasPartner ? 'Needs your partner to approve' : undefined}>
            {busy === 'req' ? 'Requesting…' : 'Request Completion'}
          </Button>
        )}
        {act.review && (
          <>
            <Button size="sm" icon={<ThumbsUp className="h-4 w-4" />} disabled={!!busy} onClick={() => void run('ok', () => reviewCompletion(task.id, true), 'Completion approved')}>
              {busy === 'ok' ? 'Approving…' : 'Approve Completion'}
            </Button>
            <Button size="sm" variant="ghost" icon={<ThumbsDown className="h-4 w-4" />} disabled={!!busy} onClick={() => void run('no', () => reviewCompletion(task.id, false), 'Sent back to active')}>
              {busy === 'no' ? 'Rejecting…' : 'Reject Completion'}
            </Button>
          </>
        )}
        {act.remind && (
          <Button size="sm" variant="soft" icon={<BellRing className="h-4 w-4" />} onClick={() => setComposer((v) => !v)} aria-expanded={composer}>
            Remind {otherFirst}
          </Button>
        )}
        {act.reopen && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} disabled={!!busy} onClick={() => void run('reopen', () => reopenShared(task.id), 'Task reopened')}>
            Reopen
          </Button>
        )}
      </div>
      {composer && act.remind && (
        <div className="ml-1.5">
          <ReminderComposer taskId={task.id} name={otherFirst} onClose={() => setComposer(false)} onSent={ui.toast} />
        </div>
      )}
      {error && <p role="alert" className="ml-1.5 mt-2 text-sm text-danger">{error}</p>}
    </article>
  )
}
