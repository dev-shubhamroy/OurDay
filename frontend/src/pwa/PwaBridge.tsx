import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/** Lets the service worker steer the running app (e.g. a notification tap while OurDay is already open). */
export function PwaBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null
      if (d?.type === 'ourday:navigate' && typeof d.url === 'string' && d.url.startsWith('/')) navigate(d.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
  return null
}
