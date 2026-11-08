import { Flag, PartyPopper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../../hooks/useApp'
import { useViewData } from '../../hooks/useView'
import { nextDeadlines } from '../../services/selectors'
import { SectionHeader } from '../ui/SectionHeader'
import { DeadlineCard } from './DeadlineCard'

/** One list: the next three incomplete deadlines across today and tomorrow, earliest first. */
export function DeadlineGroups() {
  const { now, today } = useApp()
  const { tasks } = useViewData()
  const next = nextDeadlines(tasks, now, 3)
  return (
    <section aria-label="Upcoming Deadlines" className="animate-rise">
      <SectionHeader icon={<Flag className="h-4 w-4" />} title="Upcoming Deadlines" meta={<Link to="/deadlines" className="inline-flex min-h-11 items-center text-accent hover:underline">See all</Link>} />
      {next.length === 0 ? (
        <div className="flex items-center gap-3 rounded-tile border border-dashed border-line/20 px-4 py-5 text-sm text-muted">
          <PartyPopper className="h-5 w-5 shrink-0 text-accent/70" aria-hidden="true" />
          Nothing coming up. Enjoy the breathing room.
        </div>
      ) : (
        <div className="space-y-3">
          {next.map((t) => (
            <DeadlineCard key={t.id} task={t} dayLabel={t.date === today ? 'Today' : 'Tomorrow'} />
          ))}
        </div>
      )}
    </section>
  )
}
