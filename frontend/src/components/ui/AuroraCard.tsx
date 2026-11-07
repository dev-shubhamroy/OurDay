import { createElement, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from './cn'

export type AuroraVariant = 'deadline' | 'task' | 'habit' | 'together' | 'rana' | 'info'
export type AuroraTone = 'critical' | 'approaching' | 'normal' | 'done'

interface Props extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  variant: AuroraVariant
  /** Element to render: article/div for static cards, button for fully clickable cards. */
  as?: 'div' | 'article' | 'button'
  /** Deadline urgency colour. */
  tone?: AuroraTone
  /** Together identity: cyan = you, violet = partner. */
  who?: 'you' | 'partner'
  /** 20px radius for primary surfaces; 14px otherwise. */
  large?: boolean
  completed?: boolean
  /** Only meaningful when rendered as a button. */
  type?: 'button'
  children?: ReactNode
}

/**
 * Aurora card primitive. Colour, glow and geometry come from CSS (`.aurora*` in index.css);
 * state (hover, pressed, focus, selected via aria-expanded/aria-pressed, completed, disabled) is handled there too.
 */
export function AuroraCard({ variant, as = 'div', tone, who, large, completed, className, children, ...rest }: Props) {
  return createElement(
    as,
    {
      ...rest,
      'data-tone': tone,
      'data-who': who,
      'data-completed': completed ? 'true' : undefined,
      className: cn('aurora', `aurora-${variant}`, (large || variant === 'deadline') && 'aurora-lg', className),
    },
    children,
  )
}
