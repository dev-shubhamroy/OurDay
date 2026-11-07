import { CalendarCheck, Flag, Repeat } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TaskType, User } from '../../types'
import { Avatar } from '../ui/Avatar'
import { cn } from '../ui/cn'
import { NotifyBell } from './NotifyBell'

const ICONS = { daily: CalendarCheck, deadline: Flag, habit: Repeat }

/** Read-only compact row used by history and future-looking screens. */
export function TaskRow({ kind, title, meta, owner, bell, right, muted, struck }: { kind: TaskType; title: string; meta?: ReactNode; owner?: User; bell?: boolean; right?: ReactNode; muted?: boolean; struck?: boolean }) {
  const Icon = ICONS[kind]
  return (
    <div className={cn('flex items-center gap-3.5 rounded-2xl border border-line/10 bg-card/60 p-3.5 shadow-card', muted && 'opacity-75')}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('line-clamp-2 text-[15px] font-medium leading-snug', struck && 'text-muted line-through decoration-muted/60')}>{title}</p>
        {meta && <p className="mt-0.5 text-xs text-muted">{meta}</p>}
      </div>
      {bell && <NotifyBell />}
      {right}
      {owner && <Avatar user={owner} size="xs" />}
    </div>
  )
}

export function Chip({ tone, children }: { tone: 'ok' | 'danger' | 'accent' | 'warn' | 'muted'; children: ReactNode }) {
  const cls = {
    ok: 'bg-ok/12 text-ok border-ok/25',
    danger: 'bg-danger/10 text-danger border-danger/25',
    accent: 'bg-accent/10 text-accent border-accent/20',
    warn: 'bg-warn/12 text-warn border-warn/25',
    muted: 'bg-line/10 text-muted border-line/15',
  }[tone]
  return <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', cls)}>{children}</span>
}
