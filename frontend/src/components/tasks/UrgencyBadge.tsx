import { AlertTriangle, CheckCircle2, Clock3, Hourglass } from 'lucide-react'
import type { Urgency } from '../../types'
import { cn } from '../ui/cn'

const CONFIG: Record<Urgency, { label: string; cls: string; Icon: typeof Clock3 }> = {
  critical: { label: 'Critical', cls: 'bg-danger/12 text-danger border-danger/25', Icon: AlertTriangle },
  approaching: { label: 'Approaching', cls: 'bg-warn/12 text-warn border-warn/25', Icon: Hourglass },
  normal: { label: 'On track', cls: 'bg-accent/10 text-accent border-accent/20', Icon: Clock3 },
  done: { label: 'Done', cls: 'bg-ok/12 text-ok border-ok/25', Icon: CheckCircle2 },
}

export function UrgencyBadge({ urgency, className }: { urgency: Urgency; className?: string }) {
  const { label, cls, Icon } = CONFIG[urgency]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', cls, className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
