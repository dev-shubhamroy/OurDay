import { useCallback, useEffect, useState } from 'react'
import { isStandalone } from './register'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

/** Chrome/Android "Install app" prompt. `canInstall` is false when already installed or the browser can't prompt. */
export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => {
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  const install = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    const d = deferred
    deferred = null
    await d.prompt()
    const { outcome } = await d.userChoice
    listeners.forEach((l) => l())
    return outcome
  }, [])
  return { canInstall: !!deferred, installed: isStandalone(), install }
}
