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

/**
 * User-facing time is always 12-hour with AM/PM, independent of the device locale:
 * 00:00 → 12:00 AM, 09:30 → 9:30 AM, 12:00 → 12:00 PM, 20:45 → 8:45 PM.
 * Stored values stay 24-hour (`HH:mm`) or ISO timestamps; only display changes.
 * A no-break space keeps "2:25 PM" from wrapping between time and period.
 */
export type Period = 'AM' | 'PM'

export function format12(hour24: number, minute: number): string {
  const period: Period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${pad(minute)}\u00A0${period}`
}

/** Display a Date or ISO timestamp (local time zone). */
export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return format12(d.getHours(), d.getMinutes())
}

/** Display a stored `HH:mm` clock value. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return format12(h, m)
}

export interface TimeParts {
  hour: number // 1–12
  minute: number // 0–59
  period: Period
}

export function toParts(hhmm: string): TimeParts {
  const [h, m] = hhmm.split(':').map(Number)
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m, period: h >= 12 ? 'PM' : 'AM' }
}

/** 12:xx AM → 00:xx and 12:xx PM → 12:xx; everything else adds 12 for PM. */
export function fromParts({ hour, minute, period }: TimeParts): string {
  return `${pad(hour % 12 + (period === 'PM' ? 12 : 0))}:${pad(minute)}`
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
