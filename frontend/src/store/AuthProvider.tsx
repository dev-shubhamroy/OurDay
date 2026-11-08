import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAuthConfigured, supabase } from '../lib/supabase'
import { friendlyAuthError } from '../lib/authErrors'
import { clearUserCache } from '../services/offline/cache'
import { AuthContext, type AuthResult, type AuthStatus, type AuthUser } from './authContext'

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
    if (user?.id) clearUserCache(user.id) // a signed-out phone keeps none of this person's data
    // Local scope: ends this browser's session without needing the network to succeed.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    setUser(null)
    setStatus('signedOut')
  }, [user])

  const signUp = useCallback(async (name: string, email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Sign-in isn’t set up yet.' }
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } })
      if (error) return { error: friendlyAuthError(error) }
      // With "Confirm email" off, Supabase returns a session immediately and the auth listener signs us in.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: friendlyAuthError({ code: 'user_already_exists' }) }
      }
      if (!data.session) {
        return { error: null, notice: 'Your account was created, but this project still asks for email confirmation. Turn off “Confirm email” in Supabase (Authentication → Sign In / Providers → Email) and sign in.' }
      }
      return { error: null }
    } catch (e) {
      return { error: friendlyAuthError(e) }
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Sign-in isn’t set up yet.' }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return { error: error ? friendlyAuthError(error) : null }
    } catch (e) {
      return { error: friendlyAuthError(e) }
    }
  }, [])

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Sign-in isn’t set up yet.' }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
      // Only surface network/rate-limit problems; never reveal whether the email has an account.
      if (error && (error.status === 429 || /rate limit/i.test(error.message))) return { error: friendlyAuthError(error) }
      if (error && /fetch|network/i.test(error.message)) return { error: friendlyAuthError(error) }
      return { error: null }
    } catch (e) {
      return { error: friendlyAuthError(e) }
    }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!supabase) return { error: 'Sign-in isn’t set up yet.' }
    try {
      const { error } = await supabase.auth.updateUser({ password })
      return { error: error ? friendlyAuthError(error) : null }
    } catch (e) {
      return { error: friendlyAuthError(e) }
    }
  }, [])

  const value = useMemo(() => ({ status, user, recovering, signUp, signIn, requestPasswordReset, updatePassword, signOut }), [status, user, recovering, signUp, signIn, requestPasswordReset, updatePassword, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
