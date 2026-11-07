import { CheckCircle2, Info } from 'lucide-react'
import { TaskRow } from '../components/tasks/TaskRow'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { formatDayLabel, formatTime, toKey } from '../services/dates'
import { completionHistory, taskProgress } from '../services/selectors'
import type { CompletionRecord } from '../types'

export default function Completed() {
  const { tasks, habits, now, today, userById } = useApp()
  const history = completionHistory(tasks, habits, now)
  const groups = new Map<string, CompletionRecord[]>()
  history.forEach((r) => {
    const k = toKey(new Date(r.completedAt))
    groups.set(k, [...(groups.get(k) ?? []), r])
  })
  const todayDone = taskProgress(tasks, now).done

  return (
    <>
      <PageHeader eyebrow="History" title="Completed" subtitle="Everything you two have finished on previous days." />
      <p className="mb-6 flex items-start gap-2.5 rounded-2xl border border-line/10 bg-card/50 p-4 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          Today’s {todayDone} completed {todayDone === 1 ? 'task stays' : 'tasks stay'} on the Today screen and join this history at the next daily reset.
        </span>
      </p>
      {groups.size === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="No completion history yet" />
      ) : (
        <div className="space-y-8">
          {[...groups].map(([day, list]) => (
            <section key={day} className="animate-rise">
              <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold">
                {formatDayLabel(day, today)}
                <span className="text-xs font-normal text-muted">{list.length} completed</span>
              </h2>
              <div className="space-y-2.5">
                {list.map((r) => (
                  <TaskRow
                    key={r.id}
                    kind={r.kind}
                    title={r.title}
                    owner={userById(r.completedBy)}
                    meta={<span className="text-ok">Completed {formatTime(r.completedAt)} · {userById(r.completedBy).name}</span>}
                    muted
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
