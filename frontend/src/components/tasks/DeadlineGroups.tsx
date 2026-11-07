import { CalendarClock, Flag, PartyPopper } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { addDays } from '../../services/dates'
import { openDeadlinesOn } from '../../services/selectors'
import type { Task } from '../../types'
import { SectionHeader } from '../ui/SectionHeader'
import { DeadlineCard } from './DeadlineCard'

function Group({ title, tasks, empty, tomorrow }: { title: string; tasks: Task[]; empty: string; tomorrow?: boolean }) {
  return (
    <section aria-label={title} className="panel animate-rise p-4 sm:p-5">
      <SectionHeader icon={tomorrow ? <CalendarClock className="h-4 w-4" /> : <Flag className="h-4 w-4" />} title={title} meta={tasks.length > 0 ? `${tasks.length} open` : undefined} />
      {tasks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-tile border border-dashed border-line/20 px-4 py-5 text-sm text-muted">
          <PartyPopper className="h-5 w-5 shrink-0 text-accent/70" aria-hidden="true" />
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <DeadlineCard key={t.id} task={t} subdued={tomorrow} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Every incomplete deadline due today and tomorrow, each in its own card, earliest first. */
export function DeadlineGroups() {
  const { tasks, now, today } = useApp()
  return (
    <div className="space-y-6">
      <Group title="Today’s Deadlines" tasks={openDeadlinesOn(tasks, now, today)} empty="No deadlines today. Enjoy the breathing room." />
      <Group title="Tomorrow’s Deadlines" tasks={openDeadlinesOn(tasks, now, addDays(today, 1))} empty="Nothing due tomorrow yet." tomorrow />
    </div>
  )
}
