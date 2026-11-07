import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'ghost' | 'soft'
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-accent to-accent/80 text-accent-fg shadow-glow hover:brightness-110 active:brightness-95',
  soft: 'bg-accent/10 text-accent hover:bg-accent/15 border border-accent/20',
  ghost: 'text-muted hover:bg-line/10 hover:text-fg border border-line/10',
}
const sizes = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' }

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-2xl font-semibold transition duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
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
