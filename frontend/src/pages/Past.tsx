import { Flag, History, ListChecks, Repeat } from 'lucide-react'
import { Chip, TaskRow } from '../components/tasks/TaskRow'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, SectionHeader } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { formatDayLabel, formatDeadline } from '../services/dates'
import { missedItems } from '../services/selectors'

export default function Past() {
  const { tasks, habits, now, today, userById } = useApp()
  const { deadlines, daily, missedHabits } = missedItems(tasks, habits, now)
  const empty = deadlines.length + daily.length + missedHabits.length === 0

  return (
    <>
      <PageHeader eyebrow="Look back" title="Past / Missed" subtitle="A record of what slipped by. Nothing here is overdue — reminders have stopped." />
      {empty ? (
        <EmptyState icon={<History className="h-6 w-6" />} title="Nothing missed" hint="Beautiful." />
      ) : (
        <div className="space-y-8">
          {deadlines.length > 0 && (
            <section className="animate-rise">
              <SectionHeader icon={<Flag className="h-4 w-4" />} title="Expired deadlines" meta={`${deadlines.length}`} />
              <div className="space-y-2.5">
                {deadlines.map((t) => (
                  <TaskRow key={t.id} kind="deadline" title={t.title} owner={userById(t.createdBy)} muted meta={`Expired ${formatDeadline(t.dueAt!, today)}`} right={<Chip tone="muted">Missed</Chip>} />
                ))}
              </div>
            </section>
          )}
          {daily.length > 0 && (
            <section className="animate-rise">
              <SectionHeader icon={<ListChecks className="h-4 w-4" />} title="Unfinished daily tasks" meta={`${daily.length}`} />
              <div className="space-y-2.5">
                {daily.map((t) => (
                  <TaskRow key={t.id} kind="daily" title={t.title} owner={userById(t.createdBy)} muted meta={`Planned ${formatDayLabel(t.date, today)}`} right={<Chip tone="muted">Not done</Chip>} />
                ))}
              </div>
            </section>
          )}
          {missedHabits.length > 0 && (
            <section className="animate-rise">
              <SectionHeader icon={<Repeat className="h-4 w-4" />} title="Missed habit days" meta={`${missedHabits.length}`} />
              <div className="space-y-2.5">
                {missedHabits.map(({ habit, user, date }) => (
                  <TaskRow key={`${habit.id}-${user}-${date}`} kind="habit" title={habit.title} owner={userById(user)} muted meta={`${userById(user).name} · ${formatDayLabel(date, today)}`} right={<Chip tone="muted">Missed</Chip>} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  )
}
