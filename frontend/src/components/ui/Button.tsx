import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

/** primary = main action, soft = secondary, ghost = quiet. */
type Variant = 'primary' | 'soft' | 'ghost'
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-accent to-accent/85 text-accent-fg shadow-glow hover:brightness-110 active:brightness-95',
  soft: 'border border-accent/25 bg-accent/10 text-accent hover:bg-accent/15',
  ghost: 'border border-line/10 text-muted hover:bg-line/10 hover:text-fg',
}
// Touch targets are at least 44px tall on small screens.
const sizes = { sm: 'h-10 px-3.5 text-sm gap-1.5 max-sm:h-11', md: 'h-11 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' }

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-ctl font-semibold transition duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
