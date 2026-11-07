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
  /** Display name captured at registration (the profile name takes over once the workspace loads). */
  name: string
}

/** `error` is a friendly message, or null on success. */
export interface AuthResult {
  error: string | null
  /** Set when sign-up succeeded but the project still requires email confirmation. */
  notice?: string
}

export interface AuthCtx {
  status: AuthStatus
  user: AuthUser | null
  /** True right after following a password-reset email link. */
  recovering: boolean
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>
  signIn: (email: string, password: string) => Promise<AuthResult>
  requestPasswordReset: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthCtx | null>(null)
