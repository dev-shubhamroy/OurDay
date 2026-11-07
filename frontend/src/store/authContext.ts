import { createContext } from 'react'

/**
 * - loading:    restoring the saved session
 * - disabled:   Supabase isn't configured; the app runs in local demo mode (mock identities)
 * - signedOut:  no valid session
 * - signedIn:   authenticated
 */
export type AuthStatus = 'loading' | 'disabled' | 'signedOut' | 'signedIn'

export interface AuthUser {
  id: string
  email: string
  /** Display name captured at registration (profile name takes over in a later milestone). */
  name: string
}

export interface AuthCtx {
  status: AuthStatus
  user: AuthUser | null
  /** True right after following a password-reset email link. */
  recovering: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthCtx | null>(null)
