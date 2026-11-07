import { BellRing } from 'lucide-react'

/** Shared-notification indicator: both users are notified about this item. */
export function NotifyBell() {
  return (
    <span title="Both of you are notified" className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
      <BellRing className="h-3.5 w-3.5" aria-label="Shared notifications on" />
    </span>
  )
}
