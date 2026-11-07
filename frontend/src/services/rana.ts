import type { Habit, Task, User } from '../types'
import { formatRemaining, greetingFor, numberWord } from './dates'
import { habitProgress, taskProgress, todayDaily, todayDeadlines, todayHabits } from './selectors'
import { remainingMs, urgencyOf } from './urgency'

/** RANA is deterministic: every sentence below is derived from task data, nothing is generated. */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

export interface Briefing {
  greeting: string
  lines: string[]
  deadlines: Task[]
  tasks: Task[]
  habits: Habit[]
}

export function buildBriefing(tasks: Task[], habits: Habit[], now: Date, me: User): Briefing {
  const deadlines = todayDeadlines(tasks, now).filter((t) => t.status === 'open')
  const daily = todayDaily(tasks, now).filter((t) => t.status === 'open')
  const todays = todayHabits(habits, now, me.id)
  const lines: string[] = []

  const urgent = deadlines.filter((t) => urgencyOf(t, now) !== 'normal')
  if (deadlines.length === 0) {
    lines.push('No deadlines today, so you can focus on the day itself.')
  } else {
    let s = `You have ${numberWord(deadlines.length)} ${plural(deadlines.length, 'deadline')} today.`
    if (urgent.length === 1 && deadlines.length > 1) s += ' One of them is approaching, so let’s make sure you don’t miss it.'
    else if (urgent.length > 1) s += ' A few are approaching, so let’s tackle them first.'
    else if (urgent.length === 1) s += ' It’s approaching, so let’s get it done early.'
    lines.push(s)
    lines.push(`The soonest is “${deadlines[0].title}” — ${formatRemaining(remainingMs(deadlines[0], now))}.`)
  }

  if (daily.length === 0) lines.push('Your daily task list is clear.')
  else lines.push(`You also have ${numberWord(daily.length)} ${plural(daily.length, 'task')} planned for today.`)

  if (todays.length > 0) lines.push(`And ${numberWord(todays.length)} ${plural(todays.length, 'habit')} to keep your streaks going.`)

  return { greeting: `${greetingFor(now)}, ${me.name.split(' ')[0]}!`, lines, deadlines, tasks: daily, habits: todays }
}

/** One-line status for the floating companion. */
export function ranaStatus(tasks: Task[], habits: Habit[], now: Date, meId: string): string {
  const t = taskProgress(tasks, now)
  const h = habitProgress(habits, now, meId)
  const open = todayDeadlines(tasks, now).filter((x) => x.status === 'open')
  if (t.total > 0 && t.done === t.total && h.done === h.total) return 'Everything on today’s list is done. Lovely teamwork.'
  if (open.length > 0) {
    const next = open[0]
    return `${t.total - t.done} ${plural(t.total - t.done, 'task')} left. “${next.title}” is due in ${formatRemaining(remainingMs(next, now)).replace(' left', '')}.`
  }
  if (t.done < t.total) return `${t.total - t.done} ${plural(t.total - t.done, 'task')} left today. No deadlines pressing.`
  return `${h.total - h.done} ${plural(h.total - h.done, 'habit')} still to go today.`
}

const ACKS = ['Nicely done.', 'One more down.', 'Great — you’re in sync.', 'Done and dusted.', 'Keep it going.']
export const ranaAck = (n: number) => cap(ACKS[n % ACKS.length])
