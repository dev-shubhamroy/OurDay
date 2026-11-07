import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

/** Square 44px icon button. `label` is required for accessibility. */
export function IconButton({ label, children, className, ...rest }: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-ctl border border-line/10 text-muted transition duration-200 hover:bg-line/10 hover:text-fg active:scale-95', className)}
    >
      {children}
    </button>
  )
}
