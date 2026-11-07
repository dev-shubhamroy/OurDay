import { useState } from 'react'
import { CheckCircle2, ChevronDown, Circle } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { formatTime } from '../../services/dates'
import { personDay, type DayItem } from '../../services/selectors'
import type { User } from '../../types'
import { Avatar } from '../ui/Avatar'
import { cn } from '../ui/cn'

const KIND_LABEL = { daily: 'Daily task', deadline: 'Deadline', habit: 'Habit' } as const

function ItemRow({ item }: { item: DayItem }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {item.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-label="Completed" /> : <Circle className="h-4 w-4 shrink-0 text-muted/70" aria-label="Pending" />}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px]', item.done ? 'text-muted' : 'font-medium')}>{item.title}</span>
        <span className="block text-[11px] text-muted/80">
          {KIND_LABEL[item.kind]}
          {item.shared && ' · Shared'}
          {item.done && item.at && ` · ${formatTime(item.at)}`}
        </span>
      </span>
    </li>
  )
}

function Group({ title, count, empty, items }: { title: string; count: number; empty: string; items: DayItem[] }) {
  return (
    <div>
      <p className="eyebrow mb-0.5 flex items-center justify-between">
        {title}
        <span className="tabular-nums">{count}</span>
      </p>
      {items.length === 0 ? (
        <p className="py-1.5 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line/10">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** One person's expandable progress card. Each card expands and collapses independently. */
function PersonCard({ user }: { user: User }) {
  const { tasks, habits, now } = useApp()
  const [open, setOpen] = useState(false)
  const { done, remaining } = personDay(tasks, habits, now, user.id)
  const total = done.length + remaining.length
  const pct = total ? (done.length / total) * 100 : 0
  const panelId = `person-${user.id}`

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn('tile w-full p-3 text-left hover:bg-card/90 active:scale-[0.99]', open && 'border-accent/25')}
      >
        <span className="flex items-center gap-3">
          <Avatar user={user} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{user.name}</span>
            <span className="block text-xs text-muted tabular-nums">
              {done.length} done · {remaining.length} left
            </span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform duration-300', open && 'rotate-180')} aria-hidden="true" />
        </span>
        <span className="mt-2.5 block h-1 overflow-hidden rounded-full bg-line/15">
          <span className={cn('block h-full rounded-full transition-all duration-700', user.tone === 'you' ? 'bg-accent/80' : 'bg-partner/80')} style={{ width: `${pct}%` }} />
        </span>
      </button>

      <div id={panelId} className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')} aria-hidden={!open}>
        <div className="min-h-0 overflow-hidden">
          <div className="scroll-thin mt-2 max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-line/10 bg-card/30 p-3">
            <Group title="Completed today" count={done.length} empty="Nothing completed yet." items={done} />
            <Group title="Remaining" count={remaining.length} empty="All done for today." items={remaining} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function PersonProgress() {
  const { users } = useApp()
  return (
    <div className="mt-4 space-y-2">
      {users.map((u) => (
        <PersonCard key={u.id} user={u} />
      ))}
    </div>
  )
}
