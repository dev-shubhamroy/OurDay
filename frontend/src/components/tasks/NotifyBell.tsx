import { BellRing } from 'lucide-react'

/** Shared-notification indicator: both users are notified about this item. */
export function NotifyBell() {
  return (
    <span title="Both of you are notified" className="inline-flex shrink-0 items-center text-accent">
      <BellRing className="h-3.5 w-3.5" aria-label="Shared notifications on" />
    </span>
  )
}
