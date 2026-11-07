import { useApp } from '../../hooks/useApp'
import { habitProgress, taskProgress } from '../../services/selectors'
import { ProgressRing } from '../ui/ProgressRing'

/** Dynamic daily progress: "3 of 6 tasks completed". */
export function DailyProgressCard() {
  const { tasks, habits, now } = useApp()
  const t = taskProgress(tasks, now)
  const h = habitProgress(habits, now)
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
      <p className="eyebrow mb-3">Daily progress</p>
      <div className="flex items-center gap-5">
        <ProgressRing pct={t.pct} size={104}>
          <span className="text-2xl font-semibold tabular-nums">{t.pct}%</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-snug" aria-live="polite">
            {t.done} of {t.total} tasks completed
          </p>
          <p className="mt-1 text-sm text-muted">
            {t.total > 0 && t.done === t.total ? 'All clear — nicely done.' : `${t.total - t.done} to go today`}
          </p>
        </div>
      </div>
      {h.total > 0 && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Habits</span>
            <span className="tabular-nums">
              {h.done} of {h.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line/15">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-ok transition-all duration-700" style={{ width: `${h.pct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

export function ProgressStrip() {
  const { tasks, now } = useApp()
  const t = taskProgress(tasks, now)
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold" aria-live="polite">
          {t.done} of {t.total} tasks completed
        </p>
        <span className="text-xs tabular-nums text-muted">{t.pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line/15">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-ok transition-all duration-700" style={{ width: `${t.pct}%` }} />
      </div>
    </div>
  )
}
