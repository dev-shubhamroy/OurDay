import { useState } from 'react'
import { useApp } from '../../hooks/useApp'
import { entryFor, calendarDays, calendarLabel, dayState, isScheduled, type DayState } from '../../services/habits'
import { formatTime, fromKey } from '../../services/dates'
import type { DateKey, Habit, UserId } from '../../types'
import { Avatar } from '../ui/Avatar'
import { cn } from '../ui/cn'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Colour of one user's occurrence: green = you completed, cyan = partner completed, red = missed. */
function tone(state: DayState, isMe: boolean): string {
  switch (state) {
    case 'done':
      return isMe ? 'bg-ok/85' : 'bg-accent/85'
    case 'missed':
      return 'bg-danger/70'
    case 'pending':
      return 'bg-transparent ring-1 ring-inset ring-accent/60'
    default:
      return 'bg-line/10'
  }
}

export function Legend() {
  const items = [
    ['bg-ok', 'You completed'],
    ['bg-accent', 'Partner completed'],
    ['bg-danger/70', 'Missed'],
    ['bg-line/15', 'Not scheduled'],
    ['bg-transparent ring-1 ring-inset ring-accent/60', 'Open today'],
  ]
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted sm:flex sm:flex-wrap">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-[3px]', c)} />
          {l}
        </li>
      ))}
    </ul>
  )
}

/** Five-week history. Shared habits show both users side by side on the same date. */
export function HabitCalendar({ habit }: { habit: Habit }) {
  const { today, me, userById } = useApp()
  const [selected, setSelected] = useState<DateKey | null>(null)
  const days = calendarDays(today, 5)
  // Current user first so their half is always on the left.
  const people: UserId[] = [...habit.participants].sort((a) => (a === me.id ? -1 : 1))

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-muted">
        {WEEK.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={`${habit.title} history`}>
        {days.map((key) => {
          const future = key > today
          const states = people.map((u) => dayState(habit, u, key, today))
          const filled = states.some((s) => s === 'done' || s === 'missed')
          const label = `${calendarLabel(key)}: ${states.every((s) => s === 'off') ? 'not scheduled' : people.map((u, i) => `${userById(u).name} ${states[i]}`).join(', ')}`
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              aria-label={label}
              aria-pressed={selected === key}
              onClick={() => setSelected(selected === key ? null : key)}
              className={cn(
                'relative flex aspect-square overflow-hidden rounded-md transition duration-150 focus-visible:ring-offset-0',
                future ? 'opacity-25' : 'hover:scale-105',
                selected === key && 'outline outline-2 outline-offset-2 outline-fg/80',
                key === today && selected !== key && 'outline outline-1 outline-offset-1 outline-fg/40',
              )}
            >
              {people.map((u, i) => (
                <span key={u} className={cn('flex-1', tone(states[i], u === me.id))} />
              ))}
              <span className={cn('absolute inset-0 grid place-items-center text-[11px] font-semibold', filled ? 'text-[#06131f]/85' : future ? 'text-muted' : 'text-muted/80')}>{fromKey(key).getDate()}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2.5">
        <Legend />
      </div>
      <div className="mt-3 min-h-[6.25rem] rounded-2xl border border-line/10 bg-card/50 p-3 text-sm" aria-live="polite">
        {selected ? <DayDetail habit={habit} dateKey={selected} people={people} /> : <p className="text-xs text-muted">Tap a date to see who completed or missed it.</p>}
      </div>
    </div>
  )
}

function DayDetail({ habit, dateKey, people }: { habit: Habit; dateKey: DateKey; people: UserId[] }) {
  const { today, userById, me } = useApp()
  const scheduled = isScheduled(habit, dateKey) && dateKey >= habit.startDate
  return (
    <div className="space-y-2">
      <p className="flex items-center justify-between gap-2 font-semibold">
        {calendarLabel(dateKey)}
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', scheduled ? 'bg-accent/10 text-accent' : 'bg-line/10 text-muted')}>{scheduled ? 'Scheduled' : 'Not scheduled'}</span>
      </p>
      {!scheduled ? (
        <p className="text-xs text-muted">{dateKey < habit.startDate ? 'This was before the habit started.' : 'This habit wasn’t scheduled that day.'}</p>
      ) : (
        people.map((u) => {
          const s = dayState(habit, u, dateKey, today)
          const e = entryFor(habit, u, dateKey)
          const user = userById(u)
          return (
            <p key={u} className="flex items-center gap-2 text-[13px]">
              <Avatar user={user} size="xs" />
              <span className="font-medium">{u === me.id ? 'You' : user.name}</span>
              <span className={cn('ml-auto', s === 'done' ? 'text-ok' : s === 'missed' ? 'text-danger' : 'text-muted')}>
                {s === 'done' ? `Completed${e?.at ? ` at ${formatTime(e.at)}` : ''}` : s === 'missed' ? 'Missed' : 'Not yet — still open today'}
              </span>
            </p>
          )
        })
      )}
    </div>
  )
}
