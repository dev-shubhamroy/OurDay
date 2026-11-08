import { useEffect, useRef } from 'react'

let skip = 0

/**
 * Makes the Android system Back button (and the browser back button) close an open overlay (drawer, sheet)
 * instead of leaving the screen. While `open`, one history entry is pushed; Back pops it and calls `onClose`.
 * Closing by tapping removes that entry again so history stays clean.
 */
export function useBackClose(open: boolean, onClose: () => void): void {
  const cb = useRef(onClose)
  useEffect(() => {
    cb.current = onClose
  })
  useEffect(() => {
    if (!open) return
    window.history.pushState({ ...(window.history.state ?? {}), ourdayOverlay: true }, '')
    let popped = false
    const onPop = () => {
      if (skip > 0) {
        skip--
        return
      }
      popped = true
      cb.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!popped && (window.history.state as { ourdayOverlay?: boolean } | null)?.ourdayOverlay) {
        skip++
        window.history.back()
      }
    }
  }, [open])
}
