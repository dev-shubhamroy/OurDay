import { Repeat } from 'lucide-react'
import { HabitCard } from '../components/habits/HabitCard'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { streakOf } from '../services/habits'
import { habitProgress } from '../services/selectors'

export default function Habits() {
  const { habits, now, today } = useApp()
  const p = habitProgress(habits, now)
  const best = Math.max(0, ...habits.map((h) => streakOf(h, today)))
  return (
    <>
      <PageHeader eyebrow="Consistency" title="Habits" subtitle="Every scheduled day is a fresh start — a miss never blocks tomorrow.">
        <div className="flex gap-3">
          <div className="tile px-4 py-2.5">
            <p className="eyebrow">Today</p>
            <p className="text-lg font-semibold tabular-nums">{p.done}/{p.total}</p>
          </div>
          <div className="tile px-4 py-2.5">
            <p className="eyebrow">Best streak</p>
            <p className="text-lg font-semibold tabular-nums">{best} days</p>
          </div>
        </div>
      </PageHeader>
      {habits.length === 0 ? (
        <EmptyState icon={<Repeat className="h-6 w-6" />} title="No habits yet" hint="Use Add Task and choose Habit." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}
    </>
  )
}
