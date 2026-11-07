import { Flame, Pause, Play } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { dayName, dayState, lastDays, scheduleLabel, streakOf, weeklyRate, type DayState } from '../../services/habits'
import { fromKey } from '../../services/dates'
import type { Habit } from '../../types'
import { NotifyBell } from '../tasks/NotifyBell'
import { Button } from '../ui/Button'
import { CheckButton } from '../ui/CheckButton'
import { cn } from '../ui/cn'

const DOT: Record<DayState, string> = {
  done: 'bg-ok border-ok text-white',
  missed: 'bg-danger/15 border-danger/40 text-danger',
  pending: 'border-accent/60 text-accent',
  off: 'border-line/15 text-muted/50 border-dashed',
}

export function HabitCard({ habit }: { habit: Habit }) {
  const { today, toggleHabit, setHabitPaused, userById } = useApp()
  const streak = streakOf(habit, today)
  const rate = weeklyRate(habit, today)
  const week = lastDays(today, 7)
  const month = lastDays(today, 28)
  const todayState = dayState(habit, today, today)
  const owner = userById(habit.createdBy)

  return (
    <article className={cn('panel flex flex-col gap-5 p-5 transition duration-300', habit.paused && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 truncate text-lg font-semibold">
            {habit.title}
            {habit.notifySecondUser && <NotifyBell />}
          </h3>
          <p className="text-xs text-muted">
            {scheduleLabel(habit)} · by {owner.name}
            {habit.paused && ' · Paused'}
          </p>
        </div>
        {todayState !== 'off' && !habit.paused && (
          <CheckButton checked={todayState === 'done'} onToggle={() => toggleHabit(habit.id)} label={`${todayState === 'done' ? 'Mark incomplete' : 'Mark done today'}: ${habit.title}`} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="tile p-3">
          <p className="eyebrow mb-1">Streak</p>
          <p className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
            <Flame className={cn('h-5 w-5', streak > 0 ? 'text-warn' : 'text-muted')} />
            {streak}
            <span className="text-xs font-normal text-muted">{streak === 1 ? 'day' : 'days'}</span>
          </p>
        </div>
        <div className="tile p-3">
          <p className="eyebrow mb-1">This week</p>
          <p className="text-2xl font-semibold tabular-nums">{rate}%</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/15">
            <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${rate}%` }} />
          </div>
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">Last 7 days</p>
        <div className="flex justify-between">
          {week.map((k) => (
            <div key={k} className="flex flex-col items-center gap-1.5">
              <span className={cn('grid h-8 w-8 place-items-center rounded-full border text-[10px] font-semibold', DOT[dayState(habit, k, today)])} title={`${k}: ${dayState(habit, k, today)}`}>
                {dayState(habit, k, today) === 'done' ? '✓' : dayState(habit, k, today) === 'missed' ? '×' : ''}
              </span>
              <span className={cn('text-[10px]', k === today ? 'font-semibold text-accent' : 'text-muted')}>{dayName(fromKey(k).getDay()).slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow mb-2">Last 4 weeks</p>
        <div className="grid grid-cols-14 gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {month.map((k) => {
            const s = dayState(habit, k, today)
            return <span key={k} title={`${k}: ${s}`} className={cn('aspect-square rounded-[5px]', s === 'done' ? 'bg-ok/80' : s === 'missed' ? 'bg-danger/35' : s === 'pending' ? 'bg-accent/35' : 'bg-line/10')} />
          })}
        </div>
      </div>

      <Button variant="ghost" size="sm" className="self-start" icon={habit.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} onClick={() => setHabitPaused(habit.id, !habit.paused)}>
        {habit.paused ? 'Resume habit' : 'Pause habit'}
      </Button>
    </article>
  )
}
