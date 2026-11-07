import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { passwordStrength } from '../../services/password'
import { cn } from '../ui/cn'
import { Field, fieldCls } from '../ui/Controls'

export function TextField({ label, error, className, ...rest }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id} error={error}>
      <input id={id} {...rest} aria-invalid={error ? true : undefined} className={cn(fieldCls, className)} />
    </Field>
  )
}

/** Password input with a visibility toggle (44px target) and optional strength guidance. */
export function PasswordField({ label, value, onChange, showStrength, error, autoComplete, placeholder }: { label: string; value: string; onChange: (v: string) => void; showStrength?: boolean; error?: string; autoComplete: string; placeholder?: string }) {
  const id = useId()
  const [show, setShow] = useState(false)
  const s = passwordStrength(value)
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} aria-invalid={error ? true : undefined} className={cn(fieldCls, 'pr-12')} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-ctl text-muted transition hover:text-fg"
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {showStrength && value && (
        <div className="mt-2" aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= s.score ? (s.score <= 1 ? 'bg-danger' : s.score === 2 ? 'bg-warn' : 'bg-ok') : 'bg-line/15')} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {s.label && <span className="font-semibold text-fg/80">{s.label}. </span>}
            {s.hint}
          </p>
        </div>
      )}
    </Field>
  )
}

export function FormMessage({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-tile border px-3.5 py-3 text-sm',
        tone === 'error' && 'border-danger/30 bg-danger/10 text-danger',
        tone === 'success' && 'border-ok/30 bg-ok/10 text-ok',
        tone === 'info' && 'border-accent/25 bg-accent/10 text-fg',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />
}
