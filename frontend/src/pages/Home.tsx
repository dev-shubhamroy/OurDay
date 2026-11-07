import { ArrowRight, Flag, Repeat, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DeadlineCard } from '../components/tasks/DeadlineCard'
import { TaskRow } from '../components/tasks/TaskRow'
import { Avatar } from '../components/ui/Avatar'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressRing } from '../components/ui/ProgressRing'
import { EmptyState, SectionHeader } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { formatLongDate, formatTime, greetingFor } from '../services/dates'
import { habitOccurrencesToday, habitProgress, taskProgress, todayActivity, todayDeadlines, upcomingTasks } from '../services/selectors'

export default function Home() {
  const { tasks, habits, now, today, me, users, userById } = useApp()
  const t = taskProgress(tasks, now)
  const h = habitProgress(habits, now, me.id)
  const occ = habitOccurrencesToday(habits, now)
  const next = todayDeadlines(tasks, now).find((d) => d.status === 'open')
  const activity = todayActivity(tasks, habits, now)
  const ahead = upcomingTasks(tasks, now).slice(0, 3)
  const total = t.total + occ.length
  const together = t.done + occ.filter((o) => o.done).length

  return (
    <>
      <PageHeader eyebrow={formatLongDate(now)} title={`${greetingFor(now)}, ${me.name}`} subtitle="Here’s how today is shaping up for both of you." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="panel relative animate-rise overflow-hidden p-6">
            <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative flex flex-col items-center gap-6 sm:flex-row">
              <ProgressRing pct={t.pct} size={132} stroke={11}>
                <div className="text-center">
                  <p className="text-3xl font-semibold tabular-nums">{t.pct}%</p>
                  <p className="text-[11px] text-muted">of today</p>
                </div>
              </ProgressRing>
              <div className="flex-1 text-center sm:text-left">
                <p className="eyebrow mb-1.5">Daily progress</p>
                <p className="text-2xl font-semibold tracking-tight" aria-live="polite">{t.done} of {t.total} tasks completed</p>
                <p className="mt-1 text-sm text-muted">{h.done} of {h.total} habits done · {t.total - t.done} tasks to go</p>
                <Link to="/today" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                  Open Today <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          <section className="animate-rise" style={{ animationDelay: '.06s' }}>
            <SectionHeader icon={<Flag className="h-4 w-4" />} title="Next deadline" />
            {next ? <DeadlineCard task={next} /> : <EmptyState icon={<Flag className="h-6 w-6" />} title="No deadlines pressing today" />}
          </section>

          <section className="animate-rise" style={{ animationDelay: '.12s' }}>
            <SectionHeader icon={<ArrowRight className="h-4 w-4" />} title="Coming up" meta={<Link to="/upcoming" className="text-accent hover:underline">See all</Link>} />
            <div className="space-y-2.5">
              {ahead.length === 0 ? (
                <EmptyState icon={<ArrowRight className="h-6 w-6" />} title="Nothing scheduled ahead" />
              ) : (
                ahead.map((x) => <TaskRow key={x.id} kind={x.kind} title={x.title} owner={userById(x.createdBy)} bell={x.notifySecondUser} meta={x.date === today ? 'Today' : new Date(`${x.date}T00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })} />)
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
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
              <div className="h-full rounded-full bg-gradient-to-r from-accent via-accent to-partner transition-all duration-700" style={{ width: `${total ? (together / total) * 100 : 0}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {users.map((u) => (
                <div key={u.id} className="tile p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-muted"><Avatar user={u} size="xs" />{u.name}</p>
                  <p className="text-xl font-semibold tabular-nums">{activity.filter((a) => a.completedBy === u.id).length}<span className="ml-1 text-xs font-normal text-muted">done</span></p>
                </div>
              ))}
            </div>
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
