import { ArrowRight, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DeadlineGroups } from '../components/tasks/DeadlineGroups'
import { PersonProgress } from '../components/tasks/PersonProgress'
import { TaskRow } from '../components/tasks/TaskRow'
import { Avatar } from '../components/ui/Avatar'
import { PageHeader } from '../components/ui/PageHeader'
import { DailyProgressCard } from '../components/tasks/DailyProgress'
import { EmptyState, SectionHeader } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { useViewData } from '../hooks/useView'
import { formatLongDate, formatTime, greetingFor } from '../services/dates'
import { habitOccurrencesToday, taskProgress, comingUpTasks, todayActivity } from '../services/selectors'

const COMING_UP_MAX = 5

export default function Home() {
  const { tasks, habits, now, today, me, users, userById } = useApp()
  const view = useViewData()
  const t = taskProgress(tasks, now)
  const occ = habitOccurrencesToday(habits, now)
  const activity = todayActivity(tasks, habits, now)
  // Show everything while it's short; if it grows past COMING_UP_MAX, keep just the next 3 deadlines (rest via "See all").
  const comingAll = comingUpTasks(view.tasks, now)
  const nextDeadlines = comingAll.filter((x) => x.kind === 'deadline').slice(0, 3)
  const ahead = comingAll.length <= COMING_UP_MAX ? comingAll : nextDeadlines.length > 0 ? nextDeadlines : comingAll.slice(0, 3)
  const total = t.total + occ.length
  const together = t.done + occ.filter((o) => o.done).length

  return (
    <>
      <PageHeader eyebrow={formatLongDate(now)} title={`${greetingFor(now)}, ${me.name.split(' ')[0]}`} subtitle="Here’s how today is shaping up for both of you." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <DeadlineGroups />

          <section className="animate-rise" style={{ animationDelay: '.12s' }}>
            <SectionHeader icon={<ArrowRight className="h-4 w-4" />} title="Coming up" meta={<Link to="/upcoming" className="inline-flex min-h-11 items-center text-accent hover:underline">See all</Link>} />
            <div className="space-y-2.5">
              {ahead.length === 0 ? (
                <EmptyState icon={<ArrowRight className="h-6 w-6" />} title="Nothing scheduled ahead" />
              ) : (
                ahead.map((x) => <TaskRow key={x.id} kind={x.kind} title={x.title} owner={userById(x.createdBy)} bell={x.notifySecondUser} meta={`${x.date === today ? 'Today' : new Date(`${x.date}T00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}${x.kind === 'deadline' && x.dueAt ? ` · ${formatTime(x.dueAt)}` : ''}`} />)
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <DailyProgressCard />
          <section className="panel animate-rise p-5" style={{ animationDelay: '.04s' }}>
            <SectionHeader icon={<Users className="h-4 w-4" />} title="Together" />
            <div className="mb-4 flex items-center gap-3">
              <div className="flex -space-x-2">
                {users.map((u) => <Avatar key={u.id} user={u} />)}
              </div>
              <p className="text-sm text-muted">
                <span className="font-semibold text-fg tabular-nums">{together}</span> of {total} items done today
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-line/15">
              <div className="h-full rounded-full bg-gradient-to-r from-accent via-accent to-accent2 transition-all duration-700" style={{ width: `${total ? (together / total) * 100 : 0}%` }} />
            </div>
            <PersonProgress />
          </section>

          <section className="animate-rise" style={{ animationDelay: '.1s' }}>
            <SectionHeader icon={<Repeat className="h-4 w-4" />} title="Recent updates" />
            <div className="space-y-2.5">
              {activity.length === 0 ? (
                <EmptyState icon={<Repeat className="h-6 w-6" />} title="No completions yet today" hint="Updates from both of you show up here." />
              ) : (
                activity.slice(0, 5).map((a) => (
                  <TaskRow key={a.id} kind={a.kind} title={a.title} owner={userById(a.completedBy)} muted meta={<span className="text-ok">{userById(a.completedBy).name} completed · {formatTime(a.completedAt)}</span>} />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
