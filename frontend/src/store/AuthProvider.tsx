import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAuthConfigured, supabase } from '../lib/supabase'
import { AuthContext, type AuthStatus, type AuthUser } from './authContext'

function toUser(session: Session | null): AuthUser | null {
  const u = session?.user
  if (!u) return null
  const meta = (u.user_metadata ?? {}) as { name?: string }
  return { id: u.id, email: u.email ?? '', name: meta.name?.trim() || (u.email ?? '').split('@')[0] }
}

/** Restores the saved session on load and keeps auth state in sync with Supabase (refresh, sign-out, expiry). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isAuthConfigured ? 'loading' : 'disabled')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    const apply = (session: Session | null) => {
      if (!active) return
      const next = toUser(session)
      setUser(next)
      setStatus(next ? 'signedIn' : 'signedOut')
    }

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      // A storage or network problem must never leave the app stuck on the loading screen.
      .catch(() => apply(null))

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') setRecovering(false)
      apply(session)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    // Local scope: ends this browser's session without needing the network to succeed.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    setUser(null)
    setStatus('signedOut')
  }, [])

  const value = useMemo(() => ({ status, user, recovering, signOut }), [status, user, recovering, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
