import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '../hooks/useApp'
import { PENDING_PARTNER_ID } from '../services/remote/mappers'
import { resolveMode } from '../services/viewMode'
import { ViewContext, type ViewMode } from './viewContext'

const KEY = 'ourday:view-mode'

function readMode(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'partner' ? 'partner' : 'me'
  } catch {
    return 'me'
  }
}

/**
 * Application-level viewing mode. "My Mode" (default) shows my deadlines, tasks, habits and progress;
 * "Partner Mode" shows my partner's. It only chooses whom to display, using real user ids from the
 * workspace profiles. It never changes ownership, access or any completion record.
 */
export function ViewProvider({ children }: { children: ReactNode }) {
  const { me, partner } = useApp()
  const [stored, setStored] = useState<ViewMode>(readMode)
  const canViewPartner = partner.id !== PENDING_PARTNER_ID
  // Without a partner there is nobody to show, so fall back to My Mode (derived, nothing is stored).
  const mode: ViewMode = resolveMode(stored, canViewPartner)

  const setMode = useCallback((m: ViewMode) => {
    setStored(m)
    try {
      localStorage.setItem(KEY, m)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const value = useMemo(() => ({ mode, setMode, subject: mode === 'partner' ? partner : me, isPartnerView: mode === 'partner', canViewPartner }), [mode, setMode, me, partner, canViewPartner])
  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>
}
