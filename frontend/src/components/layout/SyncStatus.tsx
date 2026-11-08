import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'
import { useApp } from '../../hooks/useApp'

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`

/** What the person needs to know about saving: offline, waiting changes, or syncing. Null when everything is saved. */
function useSyncLabel(): { text: string; tone: 'warn' | 'info'; syncing: boolean; offline: boolean } | null {
  const { sync } = useApp()
  if (!sync.remote) return null
  const offline = sync.state === 'offline'
  if (offline) return { text: sync.pending ? `Offline · ${plural(sync.pending)} saved on this device` : 'Offline · showing saved data', tone: 'warn', syncing: false, offline }
  if (sync.syncing || sync.pending) return { text: sync.pending ? `Syncing ${plural(sync.pending)}…` : 'Syncing…', tone: 'info', syncing: true, offline }
  return null
}

/** Compact status in the header (sm and up). */
export function SyncPill() {
  const l = useSyncLabel()
  if (!l) return null
  const Icon = l.offline ? WifiOff : RefreshCw
  return (
    <span role="status" className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex ${l.tone === 'warn' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-accent/30 bg-accent/10 text-accent'}`}>
      <Icon className={`h-3.5 w-3.5 ${l.syncing ? 'animate-spin' : ''}`} /> {l.text}
    </span>
  )
}

/** Full-width strip under the header on phones. */
export function SyncBanner() {
  const l = useSyncLabel()
  if (!l) return null
  const Icon = l.offline ? CloudOff : RefreshCw
  return (
    <div role="status" aria-live="polite" className={`fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-20 flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold sm:hidden ${l.tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent'}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${l.syncing ? 'animate-spin' : ''}`} />
      <span>{l.text}</span>
    </div>
  )
}
