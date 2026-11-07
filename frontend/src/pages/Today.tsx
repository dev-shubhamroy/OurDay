import { CalendarCheck, Flag, ListChecks, PartyPopper, Repeat } from 'lucide-react'
import { HabitRow, PartnerHabitRow } from '../components/habits/HabitRow'
import { DailyProgressCard, ProgressStrip } from '../components/tasks/DailyProgress'
import { DeadlineCard } from '../components/tasks/DeadlineCard'
import { TaskCard } from '../components/tasks/TaskCard'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, SectionHeader } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { formatLongDate } from '../services/dates'
import { partnerHabitsToday, todayDaily, todayDeadlines, todayHabits } from '../services/selectors'

export default function Today() {
  const { tasks, habits, now, me, partner } = useApp()
  const deadlines = todayDeadlines(tasks, now)
  const daily = todayDaily(tasks, now)
  const todays = todayHabits(habits, now, me.id)
  const theirs = partnerHabitsToday(habits, now, partner.id)

  return (
    <>
      <PageHeader eyebrow={formatLongDate(now)} title="Today" subtitle="Deadlines first, then the rest of your day." />
      <div className="mb-6 lg:hidden">
        <ProgressStrip />
      </div>
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

        <aside className="space-y-8">
          <div className="hidden lg:block">
            <DailyProgressCard />
          </div>
          <section aria-label="Today's habits" className="animate-rise" style={{ animationDelay: '.16s' }}>
            <SectionHeader icon={<Repeat className="h-4 w-4" />} title="Habits" />
            <div className="space-y-2.5">
              {todays.length === 0 ? <EmptyState icon={<Repeat className="h-6 w-6" />} title="No habits scheduled today" /> : todays.map((h) => <HabitRow key={h.id} habit={h} />)}
            </div>
            {theirs.length > 0 && (
              <div className="mt-4">
                <p className="eyebrow mb-2">{partner.name}’s habits</p>
                <div className="space-y-2">
                  {theirs.map((h) => (
                    <PartnerHabitRow key={h.id} habit={h} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}
