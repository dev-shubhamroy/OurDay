import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { latestBundle, runningBundle, updateAvailable } from '../../services/appVersion'

const CHECK_MS = 5 * 60_000
const IDLE_RELOAD_MS = 30 * 60_000

/**
 * Tells the person when a newer OurDay has been deployed than the one this window is running (and refreshes quietly if
 * the window was in the background for a long time). Without it a window that is never closed, like the Mac dashboard,
 * would keep showing old screens indefinitely.
 */
export function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const running = runningBundle()
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0
    let stopped = false
    const check = async () => {
      const latest = await latestBundle()
      if (stopped || !updateAvailable(running, latest)) return
      if (hiddenAt && Date.now() - hiddenAt > IDLE_RELOAD_MS) return window.location.reload() // nobody is looking: update silently
      setStale(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else {
        void check().finally(() => (hiddenAt = 0))
      }
    }
    const onFocus = () => void check()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    const first = setTimeout(() => void check(), 15_000)
    const timer = setInterval(() => void check(), CHECK_MS)
    return () => {
      stopped = true
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!stale) return null
  return (
    <div role="status" className="glass fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-3 rounded-tile px-4 py-3 text-sm shadow-float lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0">
      <RefreshCw className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">A new version of OurDay is ready.</span>
      <button onClick={() => window.location.reload()} className="inline-flex h-11 items-center rounded-ctl bg-accent/15 px-3.5 font-semibold text-accent hover:bg-accent/25">
        Reload
      </button>
    </div>
  )
}
