import { useState } from 'react'
import { fromParts, type Period } from '../../services/dates'
import { cn } from './cn'
import { fieldCls } from './Controls'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const two = (n: number) => String(n).padStart(2, '0')

interface Props {
  /** Stored 24-hour value (`HH:mm`) or '' when unset. */
  value: string
  onChange: (hhmm: string) => void
  id: string
  label: string
  /** When true the time may be cleared (optional field). */
  clearable?: boolean
}

/** 12-hour time entry: hour, minute and a separate AM/PM choice. Emits stored `HH:mm`. */
export function TimePicker({ value, onChange, id, label, clearable }: Props) {
  const initial = value ? { hour: Number(value.slice(0, 2)) % 12 || 12, minute: Number(value.slice(3)), period: (Number(value.slice(0, 2)) >= 12 ? 'PM' : 'AM') as Period } : null
  const [hour, setHour] = useState<number | null>(initial?.hour ?? null)
  const [minute, setMinute] = useState<number | null>(initial?.minute ?? null)
  const [period, setPeriod] = useState<Period | null>(initial?.period ?? null)

  const emit = (h: number | null, m: number | null, p: Period | null) => {
    setHour(h)
    setMinute(m)
    setPeriod(p)
    onChange(h !== null && m !== null && p !== null ? fromParts({ hour: h, minute: m, period: p }) : '')
  }
  // Picking any part fills sensible defaults for the rest so a valid time is always emitted.
  const pickHour = (h: number) => emit(h, minute ?? 0, period ?? 'AM')
  const pickMinute = (m: number) => emit(hour ?? 12, m, period ?? 'AM')
  const pickPeriod = (p: Period) => emit(hour ?? 12, minute ?? 0, p)

  const select = cn(fieldCls, 'appearance-none px-2.5 text-center tabular-nums')
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      <select id={id} aria-label={`${label}: hour`} value={hour ?? ''} onChange={(e) => pickHour(Number(e.target.value))} className={cn(select, 'flex-1')}>
        {hour === null && <option value="">--</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span aria-hidden="true" className="text-muted">:</span>
      <select aria-label={`${label}: minute`} value={minute ?? ''} onChange={(e) => pickMinute(Number(e.target.value))} className={cn(select, 'flex-1')}>
        {minute === null && <option value="">--</option>}
        {MINUTES.map((m) => (
          <option key={m} value={m}>{two(m)}</option>
        ))}
      </select>
      <div role="radiogroup" aria-label={`${label}: AM or PM`} className="flex h-11 shrink-0 gap-0.5 rounded-xl border border-line/15 bg-line/10 p-0.5">
        {(['AM', 'PM'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            onClick={() => pickPeriod(p)}
            className={cn('w-10 rounded-[10px] text-xs font-semibold transition', period === p ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-fg')}
          >
            {p}
          </button>
        ))}
      </div>
      {clearable && value && (
        <button type="button" onClick={() => emit(null, null, null)} className="shrink-0 px-1 text-xs font-semibold text-muted hover:text-fg" aria-label={`Clear ${label}`}>
          Clear
        </button>
      )}
    </div>
  )
}
