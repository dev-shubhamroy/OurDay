import { ArrowRight, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../../hooks/useApp'
import { sharedTasks, stateOf, STATE_LABEL } from '../../services/sharedTasks'
import { Chip } from '../tasks/TaskRow'
import { SectionHeader } from '../ui/SectionHeader'

const TONE = { active: 'accent', awaiting_approval: 'warn', completed: 'ok' } as const

/** Home: the open shared tasks, for both people regardless of My/Partner mode. Hidden when there are none. */
export function SharedPreview() {
  const { tasks } = useApp()
  const open = sharedTasks(tasks).filter((t) => stateOf(t) !== 'completed')
  if (open.length === 0) return null
  const waiting = open.filter((t) => stateOf(t) === 'awaiting_approval').length
  return (
    <section className="animate-rise" aria-label="Shared tasks">
      <SectionHeader icon={<Users className="h-4 w-4" />} title="Shared" meta={<Link to="/shared" className="inline-flex min-h-11 items-center gap-1 text-accent hover:underline">{waiting > 0 ? `${waiting} awaiting approval` : 'See all'} <ArrowRight className="h-3.5 w-3.5" /></Link>} />
      <ul className="space-y-2.5">
        {open.slice(0, 3).map((t) => (
          <li key={t.id}>
            <Link to={`/shared?task=${t.id}`} className="tile flex min-h-11 items-center gap-3 p-3.5 transition hover:bg-line/10">
              <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
              <Chip tone={TONE[stateOf(t)]}>{STATE_LABEL[stateOf(t)]}</Chip>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
