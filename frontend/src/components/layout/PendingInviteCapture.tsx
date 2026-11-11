import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { inviteCodeFromPath, savePendingInvite } from '../../services/invite'

/**
 * Remembers an invitation code the moment a /join/<code> link is opened, before any redirect to sign-in can drop it.
 * Works the same in Android Chrome, the installed PWA, the Mac dashboard and a desktop browser.
 */
export function PendingInviteCapture() {
  const { pathname } = useLocation()
  useEffect(() => {
    const code = inviteCodeFromPath(pathname)
    if (code) savePendingInvite(code)
  }, [pathname])
  return null
}
