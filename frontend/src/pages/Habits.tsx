import { useState } from 'react'
import { CalendarClock, Repeat } from 'lucide-react'
import { HabitCard } from '../components/habits/HabitCard'
import { Segmented } from '../components/ui/Controls'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { useViewData } from '../hooks/useView'
import { habitScope, streakOf } from '../services/habits'
import { habitProgress } from '../services/selectors'
import type { HabitScope } from '../types'

type Filter = 'all' | HabitScope

export default function Habits() {
  const { now, today } = useApp()
  const { habits, subject } = useViewData()
  const [filter, setFilter] = useState<Filter>('all')
  const p = habitProgress(habits, now, subject.id)
  const best = Math.max(0, ...habits.map((h) => streakOf(h, subject.id, today)))
  const shown = habits.filter((h) => filter === 'all' || habitScope(h, subject.id) === filter)

  return (
    <>
      <PageHeader eyebrow="Consistency" title="Habits" subtitle="Everyone keeps their own record. Completing yours never completes theirs.">
        <p className="flex items-center gap-3 text-sm text-muted">
          <span><span className="text-lg font-semibold tabular-nums text-fg">{p.done}/{p.total}</span> done today</span>
          <span className="h-4 w-px bg-line/20" />
          <span><span className="text-lg font-semibold tabular-nums text-fg">{best}</span>-day best streak</span>
        </p>
      </PageHeader>

      <div className="mb-5 max-w-md">
        <Segmented
          label="Filter habits"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'personal', label: 'Personal' },
            { value: 'shared', label: 'Shared' },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Repeat className="h-6 w-6" />} title="No habits here" hint="Use Add Task and choose Habit." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {shown.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}
      <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span>
          <span className="font-semibold text-fg/80">Planned: 9:30 PM check-in.</span> Later, each person will be asked about any incomplete habit at 9:30 PM; no answer by midnight counts as missed. No reminders are sent yet — today stays open until midnight.
        </span>
      </p>
    </>
  )
}
