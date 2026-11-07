import { CalendarCheck, Flag, ListChecks, PartyPopper, Repeat } from 'lucide-react'
import { HabitCheckIn } from '../components/habits/HabitCheckIn'
import { HabitRow } from '../components/habits/HabitRow'
import { DailyProgressCard } from '../components/tasks/DailyProgress'
import { DeadlineCard } from '../components/tasks/DeadlineCard'
import { TaskCard } from '../components/tasks/TaskCard'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, SectionHeader } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { useViewData } from '../hooks/useView'
import { formatLongDate } from '../services/dates'
import { todayDaily, todayDeadlines, todayHabits } from '../services/selectors'

export default function Today() {
  const { now } = useApp()
  const { tasks, habits, subject, isPartnerView } = useViewData()
  const deadlines = todayDeadlines(tasks, now)
  const daily = todayDaily(tasks, now)
  const todays = todayHabits(habits, now, subject.id)

  return (
    <>
      <PageHeader eyebrow={formatLongDate(now)} title="Today" subtitle="Deadlines first, then the rest of your day." />
      {!isPartnerView && <HabitCheckIn />}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <section aria-label="Today's deadlines" className="animate-rise">
            <SectionHeader icon={<Flag className="h-4 w-4" />} title="Deadlines" meta={`${deadlines.filter((d) => d.status === 'completed').length}/${deadlines.length} done`} />
            <div className="space-y-3">
              {deadlines.length === 0 ? <EmptyState icon={<PartyPopper className="h-6 w-6" />} title="No active deadlines today" hint="Expired deadlines move to Past / Missed." /> : deadlines.map((t) => <DeadlineCard key={t.id} task={t} />)}
            </div>
          </section>

          <section aria-label="Today's tasks" className="animate-rise" style={{ animationDelay: '.08s' }}>
            <SectionHeader icon={<ListChecks className="h-4 w-4" />} title="Daily tasks" meta={`${daily.filter((d) => d.status === 'completed').length}/${daily.length} done`} />
            <div className="space-y-3">
              {daily.length === 0 ? <EmptyState icon={<CalendarCheck className="h-6 w-6" />} title="Nothing planned for today" hint="Use Add Task to plan something." /> : daily.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-8">
          {/* Secondary widget: after the habits on mobile, top of the side column on desktop. */}
          <DailyProgressCard className="order-last lg:order-first" />
          <section aria-label="Today's habits" className="animate-rise" style={{ animationDelay: '.16s' }}>
            <SectionHeader icon={<Repeat className="h-4 w-4" />} title="Habits" />
            <div className="space-y-2.5">
              {todays.length === 0 ? <EmptyState icon={<Repeat className="h-6 w-6" />} title="No habits scheduled today" /> : todays.map((h) => <HabitRow key={h.id} habit={h} />)}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
