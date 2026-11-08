import { useState } from 'react'
import { Archive, Flag } from 'lucide-react'
import { DeadlineCard } from '../components/tasks/DeadlineCard'
import { Chip, TaskRow } from '../components/tasks/TaskRow'
import { UrgencyBadge } from '../components/tasks/UrgencyBadge'
import { Segmented } from '../components/ui/Controls'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, SectionHeader } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { useViewData } from '../hooks/useView'
import { formatDeadline, formatRemaining } from '../services/dates'
import { futureDeadlines, pastDeadlines, todayDeadlines } from '../services/selectors'
import { remainingMs, urgencyOf } from '../services/urgency'

export default function Deadlines() {
  const { now, today, userById } = useApp()
  const { tasks } = useViewData()
  const [view, setView] = useState<'active' | 'past'>('active')
  const todays = todayDeadlines(tasks, now)
  const future = futureDeadlines(tasks, now)
  const past = pastDeadlines(tasks, now)

  return (
    <>
      <PageHeader eyebrow="Time-sensitive" title="Deadlines" subtitle="Active deadlines only. Missed ones move to Past, never to an overdue pile.">
        <div className="w-full sm:w-72">
          <Segmented
            label="Deadline view"
            value={view}
            onChange={setView}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'past', label: `Past (${past.length})`, icon: <Archive className="h-4 w-4" /> },
            ]}
          />
        </div>
      </PageHeader>

      {view === 'active' ? (
        <div className="space-y-8">
          <section className="animate-rise">
            <SectionHeader icon={<Flag className="h-4 w-4" />} title="Today" meta={`${todays.length}`} />
            <div className="space-y-3">{todays.length === 0 ? <EmptyState title="No deadlines today" /> : todays.map((t) => <DeadlineCard key={t.id} task={t} />)}</div>
          </section>
          <section className="animate-rise" style={{ animationDelay: '.08s' }}>
            <SectionHeader icon={<Flag className="h-4 w-4" />} title="Future deadlines" meta={`${future.length}`} />
            <div className="space-y-2.5">
              {future.length === 0 ? (
                <EmptyState icon={<Flag className="h-6 w-6" />} title="No future deadlines" />
              ) : (
                future.map((t) => (
                  <TaskRow
                    key={t.id}
                    kind="deadline"
                    title={t.title}
                    owner={userById(t.createdBy)}
                    bell={t.notifySecondUser}
                    meta={`${formatDeadline(t.dueAt!, today)} · ${formatRemaining(remainingMs(t, now))}`}
                    right={<UrgencyBadge urgency={urgencyOf(t, now)} />}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="animate-rise">
          <p className="mb-4 rounded-2xl border border-line/10 bg-card/50 p-4 text-sm text-muted">
            Past deadlines are a record, not a to-do list. Reminders for missed ones have stopped.
          </p>
          <div className="space-y-2.5">
            {past.length === 0 ? (
              <EmptyState icon={<Archive className="h-6 w-6" />} title="No past deadlines yet" />
            ) : (
              past.map((t) => {
                const done = t.status === 'completed'
                return (
                  <TaskRow
                    key={t.id}
                    kind="deadline"
                    title={t.title}
                    owner={userById(t.createdBy)}
                    muted
                    struck={done}
                    meta={done ? `Completed ${formatDeadline(t.completedAt!, today)}` : `Expired ${formatDeadline(t.dueAt!, today)}`}
                    right={done ? <Chip tone="ok">Completed</Chip> : <Chip tone="muted">Missed</Chip>}
                  />
                )
              })
            )}
          </div>
        </section>
      )}
    </>
  )
}
