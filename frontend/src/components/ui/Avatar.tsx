import type { User } from '../../types'
import { cn } from './cn'

export function Avatar({ user, size = 'md', className }: { user: User; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const dims = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs' }[size]
  return (
    <span
      title={user.name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-surface',
        user.tone === 'you' ? 'bg-accent/20 text-accent' : 'bg-accent2/20 text-accent2',
        dims,
        className,
      )}
    >
      {user.initials}
    </span>
  )
}
