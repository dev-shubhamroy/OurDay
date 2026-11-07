import { CalendarClock } from 'lucide-react'
import { Chip, TaskRow } from '../components/tasks/TaskRow'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { useViewData } from '../hooks/useView'
import { formatClock, formatDayLabel, formatDeadline } from '../services/dates'
import { upcomingTasks } from '../services/selectors'
import type { Task } from '../types'

export default function Upcoming() {
  const { now, today, userById } = useApp()
  const { tasks } = useViewData()
  const groups = new Map<string, Task[]>()
  upcomingTasks(tasks, now).forEach((t) => groups.set(t.date, [...(groups.get(t.date) ?? []), t]))

  return (
    <>
      <PageHeader eyebrow="Plan ahead" title="Upcoming" subtitle="Tomorrow and beyond. These appear on Today when their day arrives." />
      {groups.size === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nothing scheduled ahead" hint="Use Add Task to plan a future day." />
      ) : (
        <div className="space-y-8">
          {[...groups].map(([date, list]) => (
            <section key={date} className="animate-rise">
              <h2 className="mb-3 flex items-baseline gap-2 text-base font-semibold">
                {formatDayLabel(date, today)}
                <span className="text-xs font-normal text-muted">{list.length} {list.length === 1 ? 'item' : 'items'}</span>
              </h2>
              <div className="space-y-2.5">
                {list.map((t) => (
                  <TaskRow
                    key={t.id}
                    kind={t.kind}
                    title={t.title}
                    owner={userById(t.createdBy)}
                    bell={t.notifySecondUser}
                    meta={t.kind === 'deadline' ? `Due ${formatDeadline(t.dueAt!, today)}` : t.time ? formatClock(t.time) : 'Anytime'}
                    right={t.kind === 'deadline' ? <Chip tone="accent">Deadline</Chip> : undefined}
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
