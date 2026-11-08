import { useApp } from '../../hooks/useApp'
import { useView } from '../../hooks/useView'
import type { ViewMode } from '../../store/viewContext'
import { Avatar } from '../ui/Avatar'
import { cn } from '../ui/cn'

/** Header switch between My Mode and Partner Mode (a viewing filter, not a permission). */
export function ViewModeToggle() {
  const { me, partner } = useApp()
  const { mode, setMode, canViewPartner } = useView()
  const options: { value: ViewMode; label: string; short: string; user: typeof me; disabled?: boolean }[] = [
    { value: 'me', label: 'My Mode', short: 'Me', user: me },
    { value: 'partner', label: 'Partner Mode', short: partner.name.split(' ')[0], user: partner, disabled: !canViewPartner },
  ]
  return (
    <div role="radiogroup" aria-label="Viewing mode" className="flex h-11 shrink-0 items-center overflow-hidden rounded-ctl border border-line/10 bg-line/10">
      {options.map((o) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            aria-disabled={o.disabled || undefined}
            disabled={o.disabled}
            title={o.disabled ? 'Your partner hasn’t joined yet' : o.label}
            onClick={() => setMode(o.value)}
            className={cn(
              'flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-[12px] px-2 text-xs font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5',
              active ? (o.value === 'me' ? 'border border-accent/40 bg-accent/15 text-accent shadow-card' : 'border border-accent2/40 bg-accent2/15 text-accent2 shadow-card') : 'border border-transparent text-muted hover:text-fg',
            )}
          >
            <Avatar user={o.user} size="xs" className={cn('ring-0', !active && 'opacity-80')} />
            <span className="hidden whitespace-nowrap md:inline">{o.label}</span>
            <span className="hidden whitespace-nowrap sm:inline md:hidden">{o.short}</span>
          </button>
        )
      })}
    </div>
  )
}
