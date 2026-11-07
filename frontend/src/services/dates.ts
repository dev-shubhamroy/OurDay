import type { DateKey } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

export const toKey = (d: Date): DateKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

/** Local Date for a day key plus `HH:mm`. */
export function atTime(key: DateKey, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = fromKey(key)
  d.setHours(h, m, 0, 0)
  return d
}

export const weekday = (key: DateKey) => fromKey(key).getDay()

export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatShortDate(key: DateKey): string {
  return fromKey(key).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDayLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Today'
  if (key === addDays(today, 1)) return 'Tomorrow'
  if (key === addDays(today, -1)) return 'Yesterday'
  return formatShortDate(key)
}

export function formatDeadline(iso: string, today: DateKey): string {
  const d = new Date(iso)
  return `${formatDayLabel(toKey(d), today)}, ${formatTime(d)}`
}

/** "2h 14m left", "35m left", "3d 4h left". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Time is up'
  const mins = Math.max(1, Math.floor(ms / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

export function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const numberWord = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n))

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}
