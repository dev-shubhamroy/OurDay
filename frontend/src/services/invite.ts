/** Accepts a pasted invitation link or a bare code and returns just the code. */
export function extractInviteCode(input: string): string {
  const v = input.trim()
  const m = v.match(/\/join\/([^/?#\s]+)/)
  let code = m ? m[1] : v
  try {
    code = decodeURIComponent(code)
  } catch {
    /* keep as typed */
  }
  return code.trim()
}

export const inviteLink = (origin: string, code: string) => `${origin}/join/${code}`
export const joinPath = (code: string) => `/join/${encodeURIComponent(code)}`

/** Invitation codes are 32 URL-safe characters; reject obvious typos early (the server validates for real). */
export const looksLikeInviteCode = (code: string) => /^[A-Za-z0-9_-]{16,128}$/.test(code)

/** The code in an app path like `/join/<code>`, or null. */
export function inviteCodeFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/join\/([^/?#]+)\/?$/)
  if (!m) return null
  const code = extractInviteCode(m[1])
  return looksLikeInviteCode(code) ? code : null
}

// ---- keeping the invitation while the person signs in / registers / relaunches the app -----------------------------------
// The link's code lives only in the URL. Sign-in, registration, a password reset, an app relaunch or opening the PWA from its
// icon all replace the URL, so the code is remembered (in this browser only) until it is used, found invalid, or expires.

const KEY = 'ourday:pending-invite'
export const PENDING_TTL_MS = 7 * 24 * 3600 * 1000 // the server-side invitation lifetime

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const store = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function savePendingInvite(code: string, now = Date.now(), s: Store | null = store()): void {
  if (!looksLikeInviteCode(code)) return
  try {
    s?.setItem(KEY, JSON.stringify({ code, at: now }))
  } catch {
    /* storage unavailable: the URL still works for this page view */
  }
}

export function loadPendingInvite(now = Date.now(), s: Store | null = store()): string | null {
  try {
    const v = JSON.parse(s?.getItem(KEY) ?? 'null') as { code?: unknown; at?: unknown } | null
    if (!v || typeof v.code !== 'string' || typeof v.at !== 'number' || !looksLikeInviteCode(v.code)) return null
    if (now - v.at > PENDING_TTL_MS || v.at > now + 60_000) {
      s?.removeItem(KEY)
      return null
    }
    return v.code
  } catch {
    return null
  }
}

export function clearPendingInvite(s: Store | null = store()): void {
  try {
    s?.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// ---- what the server says about a link --------------------------------------------------------------------------------

export type InviteStatus = 'valid' | 'invalid' | 'expired' | 'used' | 'revoked' | 'full'
/** anonymous = not signed in; free = no workspace yet; replaceable = alone in an EMPTY workspace; blocked = has data or a partner. */
export type InviteCaller = 'anonymous' | 'inviter' | 'member' | 'free' | 'replaceable' | 'blocked'

export interface InvitePreview {
  status: InviteStatus
  caller?: InviteCaller
  inviterName?: string
  workspaceName?: string
  expiresAt?: string
}

export function parsePreview(raw: unknown): InvitePreview | null {
  const r = raw as Record<string, unknown> | null
  const status = r?.status
  if (status !== 'valid' && status !== 'invalid' && status !== 'expired' && status !== 'used' && status !== 'revoked' && status !== 'full') return null
  const caller = r?.caller
  const ok = caller === 'anonymous' || caller === 'inviter' || caller === 'member' || caller === 'free' || caller === 'replaceable' || caller === 'blocked'
  return {
    status,
    caller: ok ? (caller as InviteCaller) : undefined,
    inviterName: typeof r?.inviter_name === 'string' ? r.inviter_name : undefined,
    workspaceName: typeof r?.workspace_name === 'string' ? r.workspace_name : undefined,
    expiresAt: typeof r?.expires_at === 'string' ? r.expires_at : undefined,
  }
}

/** Which screen the link should show. `preview` null = the server can't preview yet (older backend): fall back to a plain accept. */
export type JoinView = 'sign-in' | 'accept' | 'accept-replace' | 'own-link' | 'already-connected' | 'blocked' | 'full' | 'expired' | 'used' | 'revoked' | 'invalid'

export function joinView(preview: InvitePreview | null, signedIn: boolean): JoinView {
  if (!preview) return signedIn ? 'accept' : 'sign-in'
  switch (preview.status) {
    case 'invalid': return 'invalid'
    case 'expired': return 'expired'
    case 'used': return 'used'
    case 'revoked': return 'revoked'
    case 'full': return preview.caller === 'member' ? 'already-connected' : 'full'
    case 'valid':
      if (!signedIn) return 'sign-in'
      switch (preview.caller) {
        case 'inviter': return 'own-link'
        case 'member': return 'already-connected'
        case 'blocked': return 'blocked'
        case 'replaceable': return 'accept-replace'
        default: return 'accept'
      }
  }
}

/** After sign-in/registration with no remembered destination: finish the invitation first, otherwise carry on normally. */
export function postAuthDestination(from: string | undefined, pending: string | null): string {
  if (from && !from.startsWith('/login') && !from.startsWith('/register')) return from
  return pending ? joinPath(pending) : '/today'
}
