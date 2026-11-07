import { useState } from 'react'
import { CalendarClock, Repeat } from 'lucide-react'
import { HabitCard } from '../components/habits/HabitCard'
import { Segmented } from '../components/ui/Controls'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/SectionHeader'
import { useApp } from '../hooks/useApp'
import { habitScope, streakOf } from '../services/habits'
import { habitProgress } from '../services/selectors'
import type { HabitScope } from '../types'

type Filter = 'all' | HabitScope

export default function Habits() {
  const { habits, now, today, me } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const p = habitProgress(habits, now, me.id)
  const best = Math.max(0, ...habits.filter((h) => h.participants.includes(me.id)).map((h) => streakOf(h, me.id, today)))
  const shown = habits.filter((h) => filter === 'all' || habitScope(h, me.id) === filter)

  return (
    <>
      <PageHeader eyebrow="Consistency" title="Habits" subtitle="Personal, partner’s and shared. Everyone keeps their own record — completing yours never completes theirs.">
        <div className="flex gap-3">
          <div className="tile px-4 py-2.5">
            <p className="eyebrow">Your today</p>
            <p className="text-lg font-semibold tabular-nums">{p.done}/{p.total}</p>
          </div>
          <div className="tile px-4 py-2.5">
            <p className="eyebrow">Your best current</p>
            <p className="text-lg font-semibold tabular-nums">{best} days</p>
          </div>
        </div>
      </PageHeader>

      <div className="mb-4 max-w-md">
        <Segmented
          label="Filter habits"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'personal', label: 'Mine' },
            { value: 'partner', label: 'Partner’s' },
            { value: 'shared', label: 'Shared' },
          ]}
        />
      </div>

      <p className="mb-6 flex items-start gap-2.5 rounded-2xl border border-line/10 bg-card/50 p-4 text-sm text-muted">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          <span className="font-semibold text-fg">Planned: 9:30 PM check-in.</span> Later, each person will be asked about any incomplete habit at 9:30 PM (local time); no answer by midnight counts as missed. For now, today’s habits stay open until midnight, then show as missed. No reminders are sent yet.
        </span>
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={<Repeat className="h-6 w-6" />} title="No habits here" hint="Use Add Task and choose Habit." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {shown.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}
    </>
  )
}
