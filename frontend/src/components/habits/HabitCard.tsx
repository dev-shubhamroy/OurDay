import { Flame, Pause, Play, Trophy } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { habitScope, longestStreak, scheduleLabel, streakOf, weeklyRate } from '../../services/habits'
import type { Habit, HabitScope } from '../../types'
import { NotifyBell } from '../tasks/NotifyBell'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'
import { HabitCalendar } from './HabitCalendar'

const SCOPE_LABEL: Record<HabitScope, string> = { personal: 'Personal', partner: 'Partner’s', shared: 'Shared' }

export function ScopeBadge({ scope, className }: { scope: HabitScope; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        scope === 'shared' ? 'border-accent/25 bg-accent/10 text-accent' : scope === 'partner' ? 'border-partner/30 bg-partner/10 text-partner' : 'border-line/15 bg-line/10 text-muted',
        className,
      )}
    >
      {SCOPE_LABEL[scope]}
    </span>
  )
}

export function HabitCard({ habit }: { habit: Habit }) {
  const { today, me, toggleHabit, setHabitPaused, userById } = useApp()
  const scope = habitScope(habit, me.id)
  const mine = habit.participants.includes(me.id)
  const myDone = habit.log[me.id]?.[today]?.status === 'done'
  const people = [...habit.participants].sort((a) => (a === me.id ? -1 : 1))

  return (
    <article className={cn('panel flex flex-col gap-5 p-5 transition duration-300', habit.paused && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <span className="truncate">{habit.title}</span>
            {habit.notifySecondUser && <NotifyBell />}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <ScopeBadge scope={scope} />
            <span>{scheduleLabel(habit)}</span>
            {habit.paused && <span>· Paused</span>}
          </p>
        </div>
        {mine && !habit.paused && (
          <CheckButton checked={myDone} onToggle={() => toggleHabit(habit.id)} label={`${myDone ? 'Undo' : 'Mark done today'}: ${habit.title}`} />
        )}
      </div>

      {/* Independent streaks per person */}
      <div className={cn('grid gap-3', people.length > 1 ? 'sm:grid-cols-2' : '')}>
        {people.map((u) => {
          const user = userById(u)
          const current = streakOf(habit, u, today)
          return (
            <div key={u} className="tile p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Avatar user={user} size="xs" />
                {u === me.id ? 'You' : user.name}
                <span className="ml-auto font-normal tabular-nums">{weeklyRate(habit, u, today)}% this week</span>
              </p>
              <div className="flex items-end gap-4">
                <div>
                  <p className="eyebrow">Current</p>
                  <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                    <Flame className={cn('h-5 w-5', current > 0 ? 'text-warn' : 'text-muted')} />
                    {current}
                  </p>
                </div>
                <div>
                  <p className="eyebrow">Longest</p>
                  <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                    <Trophy className="h-4 w-4 text-muted" />
                    {longestStreak(habit, u, today)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <HabitCalendar habit={habit} />

      <Button variant="ghost" size="sm" className="self-start" icon={habit.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} onClick={() => setHabitPaused(habit.id, !habit.paused)}>
        {habit.paused ? 'Resume habit' : 'Pause habit'}
      </Button>
    </article>
  )
}
