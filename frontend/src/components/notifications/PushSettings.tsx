import { useCallback, useEffect, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { currentPushState, disablePush, enablePush, showLocalTest, type PushState } from '../../services/push'
import { useInstall } from '../../pwa/useInstall'
import { Button } from '../ui/Button'

const COPY: Record<PushState, string> = {
  unsupported: 'This browser can’t receive background notifications. Use Chrome on Android.',
  'needs-install': 'On iPhone, add OurDay to your Home Screen first, then open it from there.',
  blocked: 'Notifications are blocked for OurDay. Allow them in Android Settings → Apps → Chrome (or OurDay) → Notifications.',
  off: 'Get deadline reminders, habit check-ins and partner updates on this phone, even when OurDay is closed.',
  on: 'On for this device. Reminders arrive even when OurDay is closed.',
}

/** Per-device Web Push control. Hidden in demo mode (no account to deliver to). */
export function PushSettings() {
  const { user } = useAuth()
  const { canInstall, installed, install } = useInstall()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = useCallback(() => void currentPushState().then(setState), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  if (!supabase || !user || !state) return null
  const client = supabase

  const toggle = async () => {
    setBusy(true)
    setMsg(null)
    if (state === 'on') await disablePush(client).catch(() => undefined)
    else {
      const r = await enablePush(client, user.id)
      if (!r.ok) setMsg(r.message)
    }
    refresh()
    setBusy(false)
  }

  return (
    <div className="mt-5 rounded-tile border border-line/10 bg-card/50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BellRing className="h-4 w-4 text-accent" aria-hidden /> Phone notifications
      </p>
      <p className="mt-1 text-xs text-muted">{COPY[state]}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(state === 'off' || state === 'on') && (
          <Button size="sm" variant={state === 'on' ? 'soft' : 'primary'} onClick={() => void toggle()} disabled={busy}>
            {state === 'on' ? 'Turn off on this device' : 'Turn on'}
          </Button>
        )}
        {state === 'on' && (
          <Button size="sm" variant="ghost" onClick={() => void showLocalTest().then((ok) => setMsg(ok ? 'Test shown. (This checks display on this phone, not background delivery.)' : 'Couldn’t show a test notification.'))}>
            Show a test
          </Button>
        )}
        {canInstall && !installed && (
          <Button size="sm" variant="soft" icon={<Smartphone className="h-4 w-4" />} onClick={() => void install()}>
            Install app
          </Button>
        )}
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-muted">{msg}</p>}
    </div>
  )
}
