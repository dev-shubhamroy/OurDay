import { Check, Copy, Link2, RefreshCw, ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '../../hooks/useWorkspace'
import { inviteLink } from '../../services/invite'
import type { InvitationInfo, InvitationStatus } from '../../store/workspaceContext'
import { FormMessage, Spinner } from '../auth/FormParts'
import { Button } from '../ui/Button'

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <p className="eyebrow mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-ctl border border-line/15 bg-bg/50 px-3 py-2.5 text-xs">{value}</code>
        <Button
          type="button"
          variant="soft"
          size="sm"
          icon={done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={async () => {
            if (await copy(value)) {
              setDone(true)
              setTimeout(() => setDone(false), 1800)
            }
          }}
        >
          {done ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

/** Owner-only: create, copy and revoke the invitation. The code is only ever shown right after creating it. */
export function InvitePartner() {
  const ws = useWorkspace()
  const [status, setStatus] = useState<InvitationStatus | null>(null)
  const [invite, setInvite] = useState<InvitationInfo | null>(null)
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await ws.invitationStatus()
    if (r.data) setStatus(r.data)
    else if (r.error) setError(r.error)
  }, [ws])

  const memberCount = ws.members.length
  const { isOwner, invitationStatus } = ws
  useEffect(() => {
    if (!isOwner || memberCount >= 2) return
    let cancelled = false
    void (async () => {
      const r = await invitationStatus()
      if (cancelled) return
      if (r.data) setStatus(r.data)
      else if (r.error) setError(r.error)
    })()
    return () => {
      cancelled = true
    }
  }, [isOwner, memberCount, invitationStatus])

  if (memberCount >= 2) return <FormMessage tone="success">You’re both connected. No more invitations are needed.</FormMessage>
  if (!ws.isOwner) return null

  const create = async () => {
    setError(null)
    setBusy('create')
    const r = await ws.createInvitation()
    setBusy(null)
    if (r.error || !r.data) return setError(r.error ?? 'Something went wrong. Please try again.')
    setInvite(r.data)
    void load()
  }

  const revoke = async () => {
    setError(null)
    setBusy('revoke')
    const r = await ws.revokeInvitation()
    setBusy(null)
    if (r.error) return setError(r.error)
    setInvite(null)
    void load()
  }

  const expires = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })

  return (
    <div className="space-y-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {invite ? (
        <div className="space-y-3">
          <FormMessage tone="info">Send this to your partner. It works once and expires on {expires(invite.expiresAt)}. It can’t be shown again after you leave this screen.</FormMessage>
          <CopyRow label="Invitation link" value={inviteLink(window.location.origin, invite.code)} />
          <CopyRow label="Invitation code" value={invite.code} />
        </div>
      ) : status?.hasActive ? (
        <p className="text-sm text-muted">An invitation is active until {status.expiresAt ? expires(status.expiresAt) : 'soon'}. For security the code can’t be shown again — create a new one to get a fresh link.</p>
      ) : (
        <p className="text-sm text-muted">Invite your partner with a private, one-time link. It expires after 7 days.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={create} disabled={busy !== null} icon={busy === 'create' ? <Spinner /> : invite || status?.hasActive ? <RefreshCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}>
          {invite || status?.hasActive ? 'Create a new invitation' : 'Create invitation'}
        </Button>
        {(invite || status?.hasActive) && (
          <Button type="button" variant="ghost" onClick={revoke} disabled={busy !== null} icon={busy === 'revoke' ? <Spinner /> : <ShieldOff className="h-4 w-4" />}>
            Revoke
          </Button>
        )}
      </div>
    </div>
  )
}
