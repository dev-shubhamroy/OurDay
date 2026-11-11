import { describe, expect, it } from 'vitest'
import { clearPendingInvite, extractInviteCode, inviteCodeFromPath, inviteLink, joinPath, joinView, loadPendingInvite, looksLikeInviteCode, parsePreview, PENDING_TTL_MS, postAuthDestination, savePendingInvite, type InvitePreview } from './invite'

const CODE = 'aB3_dE5-fG7hI9jK1lM3nO5pQ7rS9tU1'
const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('invitation link parsing (same link on every platform)', () => {
  it('produces and reads the same link on web, Mac dashboard, Android PWA and desktop origins', () => {
    for (const origin of ['https://ourdayapp.vercel.app', 'http://localhost:5180', 'https://ourday.example.com']) {
      expect(extractInviteCode(inviteLink(origin, CODE))).toBe(CODE)
    }
  })
  it('tolerates what messaging apps do to links (query, fragment, trailing slash, whitespace, encoding)', () => {
    expect(extractInviteCode(` https://ourdayapp.vercel.app/join/${CODE}?utm_source=whatsapp `)).toBe(CODE)
    expect(extractInviteCode(`https://ourdayapp.vercel.app/join/${CODE}#x`)).toBe(CODE)
    expect(extractInviteCode(`https://ourdayapp.vercel.app/join/${CODE}/`)).toBe(CODE)
    expect(extractInviteCode(`  ${CODE}\n`)).toBe(CODE)
    expect(extractInviteCode(`/join/${encodeURIComponent(CODE)}`)).toBe(CODE)
  })
  it('only plausible codes are accepted client-side', () => {
    expect(looksLikeInviteCode(CODE)).toBe(true)
    expect(looksLikeInviteCode('short')).toBe(false)
    expect(looksLikeInviteCode('has spaces in it 1234567890123456')).toBe(false)
  })
  it('recognises an invitation path (PWA / browser navigation) and ignores everything else', () => {
    expect(inviteCodeFromPath(`/join/${CODE}`)).toBe(CODE)
    expect(inviteCodeFromPath(`/join/${CODE}/`)).toBe(CODE)
    expect(inviteCodeFromPath('/join/short')).toBeNull()
    expect(inviteCodeFromPath('/home')).toBeNull()
    expect(inviteCodeFromPath(`/settings/join/${CODE}`)).toBeNull()
    expect(joinPath(CODE)).toBe(`/join/${CODE}`)
  })
})

describe('keeping the invitation through sign-in (authentication interruption and resumption)', () => {
  it('remembers a code and returns it after a relaunch', () => {
    const s = mem()
    expect(loadPendingInvite(1000, s)).toBeNull()
    savePendingInvite(CODE, 1000, s)
    expect(loadPendingInvite(2000, s)).toBe(CODE)
  })
  it('never stores junk', () => {
    const s = mem()
    savePendingInvite('nope', 1000, s)
    expect(loadPendingInvite(1000, s)).toBeNull()
    s.setItem('ourday:pending-invite', '{bad json')
    expect(loadPendingInvite(1000, s)).toBeNull()
  })
  it('forgets it after the invitation lifetime, or when cleared', () => {
    const s = mem()
    savePendingInvite(CODE, 0, s)
    expect(loadPendingInvite(PENDING_TTL_MS + 1, s)).toBeNull()
    savePendingInvite(CODE, 5, s)
    clearPendingInvite(s)
    expect(loadPendingInvite(6, s)).toBeNull()
  })
  it('after signing in, a remembered invitation is finished first, even when the redirect state was lost', () => {
    expect(postAuthDestination(`/join/${CODE}`, null)).toBe(`/join/${CODE}`) // came straight from the link
    expect(postAuthDestination(undefined, CODE)).toBe(`/join/${CODE}`) // page reloaded / app relaunched / email flow
    expect(postAuthDestination('/login', CODE)).toBe(`/join/${CODE}`)
    expect(postAuthDestination(undefined, null)).toBe('/today') // normal sign-in is unchanged
    expect(postAuthDestination('/habits', null)).toBe('/habits')
  })
})

const valid = (caller: InvitePreview['caller']): InvitePreview => ({ status: 'valid', caller, inviterName: 'Alice', workspaceName: 'Ours' })

describe('which screen a link shows', () => {
  it('not signed in: sign in / create account (never silently accepts)', () => {
    expect(joinView(valid('anonymous'), false)).toBe('sign-in')
  })
  it('signed in: an explicit accept screen, with a note when an empty workspace is replaced', () => {
    expect(joinView(valid('free'), true)).toBe('accept')
    expect(joinView(valid('replaceable'), true)).toBe('accept-replace')
  })
  it('explains every dead end without adding anyone', () => {
    expect(joinView({ status: 'expired' }, true)).toBe('expired')
    expect(joinView({ status: 'used' }, false)).toBe('used')
    expect(joinView({ status: 'revoked' }, true)).toBe('revoked')
    expect(joinView({ status: 'invalid' }, false)).toBe('invalid')
    expect(joinView({ status: 'full', caller: 'free' }, true)).toBe('full')
    expect(joinView(valid('inviter'), true)).toBe('own-link')
    expect(joinView(valid('blocked'), true)).toBe('blocked')
    expect(joinView(valid('member'), true)).toBe('already-connected')
    expect(joinView({ status: 'full', caller: 'member' }, true)).toBe('already-connected')
  })
  it('an older backend without previews still allows a plain accept', () => {
    expect(joinView(null, true)).toBe('accept')
    expect(joinView(null, false)).toBe('sign-in')
  })
})

describe('server preview parsing', () => {
  it('maps the database answer and rejects unknown shapes', () => {
    expect(parsePreview({ status: 'valid', caller: 'free', inviter_name: 'Alice', workspace_name: 'Ours', expires_at: 'x' })).toEqual({ status: 'valid', caller: 'free', inviterName: 'Alice', workspaceName: 'Ours', expiresAt: 'x' })
    expect(parsePreview({ status: 'invalid' })).toEqual({ status: 'invalid', caller: undefined, inviterName: undefined, workspaceName: undefined, expiresAt: undefined })
    expect(parsePreview({ status: 'weird' })).toBeNull()
    expect(parsePreview(null)).toBeNull()
  })
})
