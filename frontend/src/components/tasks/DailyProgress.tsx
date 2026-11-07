import { useApp } from '../../hooks/useApp'
import { habitProgress, taskProgress, type Progress } from '../../services/selectors'
import { cn } from '../ui/cn'

function Meter({ label, p, className }: { label: string; p: Progress; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums text-fg/80">
          {p.done}/{p.total}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line/15">
        <div className={cn('h-full rounded-full transition-all duration-700', p.pct >= 100 ? 'bg-ok' : 'bg-accent/80')} style={{ width: `${p.pct}%` }} />
      </div>
    </div>
  )
}

/** Compact, secondary daily progress: a glanceable widget, not a feature. */
export function DailyProgressCard({ className }: { className?: string }) {
  const { tasks, habits, now, me } = useApp()
  const t = taskProgress(tasks, now)
  const h = habitProgress(habits, now, me.id)
  return (
    <div className={cn('rounded-2xl border border-line/10 bg-card/40 p-3.5', className)}>
      <p className="mb-2.5 flex items-baseline justify-between">
        <span className="eyebrow">Daily progress</span>
        <span className="text-[11px] tabular-nums text-muted">{t.pct}%</span>
      </p>
      <div className="space-y-2.5">
        <Meter label="Tasks" p={t} />
        {h.total > 0 && <Meter label="Habits" p={h} />}
      </div>
      <span className="sr-only" aria-live="polite">
        {t.done} of {t.total} tasks completed
      </span>
    </div>
  )
}
