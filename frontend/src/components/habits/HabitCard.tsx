import { Flame, Pause, Play, Trophy } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { dayState, habitScope, longestStreak, scheduleLabel, streakOf, weeklyRate } from '../../services/habits'
import type { Habit, HabitScope } from '../../types'
import { NotifyBell } from '../tasks/NotifyBell'
import { Avatar } from '../ui/Avatar'
import { AuroraCard } from '../ui/AuroraCard'
import { Button } from '../ui/Button'
import { CheckButton } from '../ui/CheckButton'
import { EditButton } from '../ui/EditButton'
import { cn } from '../ui/cn'
import { HabitCalendar } from './HabitCalendar'

const SCOPE_LABEL: Record<HabitScope, string> = { personal: 'Personal', partner: 'Partner’s', shared: 'Shared' }

export function ScopeBadge({ scope, className }: { scope: HabitScope; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        scope === 'shared' ? 'border-accent/25 bg-accent/10 text-accent' : scope === 'partner' ? 'border-accent2/30 bg-accent2/10 text-accent2' : 'border-line/15 bg-line/10 text-muted',
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
    <AuroraCard variant="habit" as="article" large className={cn('flex flex-col gap-4 p-4 sm:gap-5 sm:p-5', habit.paused && 'opacity-60')}>
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
        <EditButton target={{ type: 'habit', id: habit.id }} label={`Edit ${habit.title}`} />
        {mine && !habit.paused && (
          <CheckButton checked={myDone} onToggle={() => toggleHabit(habit.id)} label={`${myDone ? 'Undo' : 'Mark done today'}: ${habit.title}`} />
        )}
      </div>

      {/* Today's completion, shown separately for each participant. */}
      {!habit.paused && people.some((u) => dayState(habit, u, today, today) !== 'off') && (
        <ul className="flex flex-wrap gap-2" aria-label="Today's completion">
          {people.map((u) => {
            const st = dayState(habit, u, today, today)
            const user = userById(u)
            return (
              <li
                key={u}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[11px] font-semibold',
                  st === 'done' ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line/15 bg-line/5 text-muted',
                )}
              >
                <Avatar user={user} size="xs" className="ring-0" />
                {u === me.id ? 'You' : user.name}
                <span aria-hidden="true">·</span>
                {st === 'done' ? 'Done today' : st === 'off' ? 'Not scheduled' : 'Pending'}
              </li>
            )
          })}
        </ul>
      )}

      {/* Independent streaks per person */}
      <div className={cn('grid gap-2.5', people.length > 1 ? 'grid-cols-2' : '')}>
        {people.map((u) => {
          const user = userById(u)
          const current = streakOf(habit, u, today)
          return (
            <div key={u} className="tile p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Avatar user={user} size="xs" />
                {u === me.id ? 'You' : user.name}
              </p>
              <div className="flex items-end gap-3 sm:gap-4">
                <div>
                  <p className="eyebrow !tracking-[0.1em]">Current</p>
                  <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                    <Flame className={cn('h-5 w-5', current > 0 ? 'text-warn' : 'text-muted')} />
                    {current}
                  </p>
                </div>
                <div>
                  <p className="eyebrow !tracking-[0.1em]">Longest</p>
                  <p className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                    <Trophy className="h-4 w-4 text-muted" />
                    {longestStreak(habit, u, today)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                <span className="font-semibold tabular-nums text-fg/80">{weeklyRate(habit, u, today)}%</span> this week
              </p>
            </div>
          )
        })}
      </div>

      <HabitCalendar habit={habit} />

      <Button variant="ghost" size="sm" className="mt-auto self-start" icon={habit.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} onClick={() => setHabitPaused(habit.id, !habit.paused)}>
        {habit.paused ? 'Resume habit' : 'Pause habit'}
      </Button>
    </AuroraCard>
  )
}
