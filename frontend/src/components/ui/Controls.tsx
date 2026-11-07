import type { ReactNode } from 'react'
import { cn } from './cn'

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('hit-44 relative h-7 w-12 shrink-0 rounded-full border transition duration-200', checked ? 'border-accent/40 bg-accent shadow-glow' : 'border-line/20 bg-line/15')}
    >
      <span className={cn('absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow transition-all duration-200', checked ? 'left-[22px]' : 'left-0.5')} style={{ height: 22, width: 22 }} />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-ctl border border-line/10 bg-line/10 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-medium transition duration-200', value === o.value ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-fg')}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const fieldCls =
  'h-11 w-full rounded-xl border border-line/15 bg-bg/50 px-3.5 text-[15px] text-fg placeholder:text-muted/70 transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25 [color-scheme:inherit]'

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p> : null}
    </div>
  )
}
