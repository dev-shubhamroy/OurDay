/**
 * Turns Supabase/network errors into short, friendly, non-revealing messages.
 * Never echoes raw server text, so nothing sensitive can leak into the UI.
 */
interface ErrorLike {
  message?: string
  status?: number
  code?: string
  name?: string
}

const NETWORK = /failed to fetch|network|load failed|fetch failed|timeout|offline/i

export function isNetworkError(e: unknown): boolean {
  const err = (e ?? {}) as ErrorLike
  return err.name === 'AuthRetryableFetchError' || err.status === 0 || NETWORK.test(err.message ?? '')
}

export function friendlyAuthError(e: unknown): string {
  const err = (e ?? {}) as ErrorLike
  const msg = err.message ?? ''
  if (isNetworkError(e)) return 'Can’t reach the server. Check your connection and try again.'
  if (/invalid login credentials/i.test(msg) || err.code === 'invalid_credentials') return 'That email and password don’t match. Please try again.'
  if (/already registered|already been registered|user_already_exists/i.test(msg) || err.code === 'user_already_exists') return 'An account with this email already exists. Try signing in instead.'
  if (/password should be|weak_password|at least \d+ characters/i.test(msg) || err.code === 'weak_password') return 'Please choose a stronger password (at least 8 characters).'
  if (/rate limit|too many|over_.*_rate_limit/i.test(msg) || err.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  if (/invalid.*email|email_address_invalid|validation_failed/i.test(msg)) return 'Please enter a valid email address.'
  if (/same password|same_password/i.test(msg)) return 'Choose a password different from your current one.'
  if (/session.*(missing|not found|expired)|jwt expired|refresh_token/i.test(msg)) return 'Your session has expired. Please sign in again.'
  return 'Something went wrong. Please try again.'
}

/** Workspace/invitation function codes (raised by the database) -> friendly text. */
export function friendlyWorkspaceError(e: unknown): string {
  const err = (e ?? {}) as ErrorLike
  if (isNetworkError(e)) return 'Can’t reach the server. Check your connection and try again.'
  switch ((err.message ?? '').trim()) {
    case 'invalid_invitation':
      return 'This invitation isn’t valid. Ask your partner for a new one.'
    case 'invitation_expired':
      return 'This invitation has expired. Ask your partner to create a new one.'
    case 'invitation_used':
      return 'This invitation has already been used. Ask your partner for a new one.'
    case 'workspace_full':
      return 'This workspace already has two members.'
    case 'already_in_workspace':
      return 'You’re already part of a workspace.'
    case 'own_invitation':
      return 'You can’t join your own workspace with its own invitation.'
    case 'not_owner':
      return 'Only the workspace owner can do that.'
    case 'not_authenticated':
      return 'Your session has expired. Please sign in again.'
    case 'invalid_name':
      return 'Please choose a shorter workspace name.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
