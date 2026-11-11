import { PartyPopper, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormMessage, Spinner } from '../../components/auth/FormParts'
import { AuthSplash } from '../../components/layout/AuthGuards'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { clearPendingInvite, extractInviteCode, joinPath, joinView, looksLikeInviteCode, parsePreview, savePendingInvite, type InvitePreview } from '../../services/invite'

/**
 * /join/:code: opened from the owner's invitation link, signed in or not.
 *   1. the code is remembered at once (survives sign-in, registration, relaunch);
 *   2. the server says who is inviting and what would happen;
 *   3. only an explicit tap on "Accept invitation" adds the person to the workspace.
 */
export default function Join() {
  const { code: raw = '' } = useParams()
  const code = extractInviteCode(raw)
  const ws = useWorkspace()
  const { status: auth } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<{ for: string; value: InvitePreview | null; error: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signedIn = auth === 'signedIn'
  const valid = looksLikeInviteCode(code)
  const { previewInvitation, status: wsStatus } = ws

  useEffect(() => {
    if (valid) savePendingInvite(code)
  }, [valid, code])

  // Ask the server about this link; again after sign-in (what it means for a signed-in person differs).
  const key = `${code}:${signedIn}:${wsStatus === 'ready' || wsStatus === 'none' ? wsStatus : 'wait'}`
  useEffect(() => {
    if (!valid || auth === 'loading' || (signedIn && (wsStatus === 'idle' || wsStatus === 'loading'))) return
    let cancelled = false
    void previewInvitation(code).then((r) => {
      if (!cancelled) setPreview({ for: key, value: r.error ? null : parsePreview(r.data), error: r.error })
    })
    return () => {
      cancelled = true
    }
  }, [valid, code, auth, signedIn, wsStatus, previewInvitation, key])

  // A link that can never work should not linger as a pending invitation.
  const view = preview && preview.for === key ? joinView(preview.value, signedIn) : null
  useEffect(() => {
    if (view === 'invalid' || view === 'expired' || view === 'used' || view === 'revoked' || view === 'already-connected') clearPendingInvite()
  }, [view])

  if (auth === 'disabled') return <Navigate to="/today" replace />
  if (auth === 'loading') return <AuthSplash />

  if (!valid) {
    return (
      <AuthLayout title="Invitation not valid" subtitle="This link looks incomplete.">
        <div className="space-y-4">
          <FormMessage tone="error">Ask your partner to send the invitation again.</FormMessage>
          <Link to={signedIn ? '/setup' : '/login'}>
            <Button variant="soft" size="lg" className="w-full">
              {signedIn ? 'Enter a code instead' : 'Go to sign in'}
            </Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }
  if (!view) {
    return preview?.error ? (
      <AuthLayout title="Can’t check this invitation" subtitle="Check your connection and try again.">
        <FormMessage tone="error">{preview.error}</FormMessage>
        <Button className="mt-4 w-full" size="lg" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </AuthLayout>
    ) : (
      <AuthSplash />
    )
  }

  const p = preview?.value
  const who = p?.inviterName ?? 'Your partner'
  const home = <Link to="/today"><Button size="lg" className="w-full">Open OurDay</Button></Link>
  const dead = (title: string, msg: string) => (
    <AuthLayout title={title} subtitle={msg}>
      <div className="space-y-3">
        <FormMessage tone="error">Ask {who === 'Your partner' ? 'your partner' : who} to create a new invitation from Settings, then open the new link.</FormMessage>
        {signedIn ? <Link to="/setup"><Button variant="soft" size="lg" className="w-full">Enter a different code</Button></Link> : <Link to="/login"><Button variant="soft" size="lg" className="w-full">Go to sign in</Button></Link>}
      </div>
    </AuthLayout>
  )

  switch (view) {
    case 'invalid': return dead('Invitation not valid', 'This link isn’t valid.')
    case 'expired': return dead('Invitation expired', 'Invitations are valid for 7 days.')
    case 'used': return dead('Invitation already used', 'This invitation was already accepted.')
    case 'revoked': return dead('Invitation replaced', 'A newer invitation was created, so this link no longer works.')
    case 'full': return dead('Workspace is full', 'That workspace already has two people.')
    case 'already-connected':
      return (
        <AuthLayout title="You’re already connected" subtitle="No invitation needed: you’re part of this workspace.">
          {home}
        </AuthLayout>
      )
    case 'own-link':
      return (
        <AuthLayout title="This is your own invitation" subtitle="Send this link to your partner. They open it and accept.">
          {home}
        </AuthLayout>
      )
    case 'blocked':
      return (
        <AuthLayout title="You already have your own workspace" subtitle="This account already has tasks or a partner, so it can’t switch to another workspace.">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-tile border border-warn/30 bg-warn/10 p-3.5 text-sm">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
              <span>Nothing was changed. To join {who}, sign in with a different account that hasn’t started a workspace yet.</span>
            </div>
            {home}
          </div>
        </AuthLayout>
      )
    case 'sign-in': {
      const state = { from: joinPath(code) }
      return (
        <AuthLayout title={`${who} invited you`} subtitle={p?.workspaceName ? `Join “${p.workspaceName}” to plan together and stay in sync.` : 'Join OurDay to plan together and stay in sync.'}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-tile border border-line/10 bg-card/50 p-3.5 text-sm text-muted">
              <PartyPopper className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              Sign in or create an account. We’ll bring you straight back here to accept.
            </div>
            <Link to="/register" state={state}><Button size="lg" className="w-full">Create an account</Button></Link>
            <Link to="/login" state={state}><Button variant="soft" size="lg" className="w-full">I already have an account</Button></Link>
          </div>
        </AuthLayout>
      )
    }
    case 'accept':
    case 'accept-replace': {
      const accept = async () => {
        if (busy) return
        setError(null)
        setBusy(true)
        const r = await ws.acceptInvitation(code)
        setBusy(false)
        if (r.error) return setError(r.error)
        clearPendingInvite()
        navigate('/today', { replace: true })
      }
      return (
        <AuthLayout title={`${who} invited you`} subtitle={p?.workspaceName ? `Join “${p.workspaceName}” to plan together and stay in sync.` : 'Join your partner’s OurDay to plan together and stay in sync.'}>
          <div className="space-y-4">
            {error && <FormMessage tone="error">{error}</FormMessage>}
            <div className="flex items-center gap-3 rounded-tile border border-line/10 bg-card/50 p-3.5 text-sm text-muted">
              <PartyPopper className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              You’ll share tasks, deadlines and habits with {who}.
            </div>
            {view === 'accept-replace' && <FormMessage tone="info">Your own workspace is empty, so it will be replaced by {who}’s. Nothing you’ve created is lost.</FormMessage>}
            <Button size="lg" className="w-full" onClick={() => void accept()} disabled={busy}>
              {busy ? (
                <>
                  <Spinner /> Joining…
                </>
              ) : (
                'Accept invitation'
              )}
            </Button>
            <Link to="/setup" onClick={() => clearPendingInvite()} className="block text-center text-sm font-medium text-accent hover:underline">
              Not now
            </Link>
          </div>
        </AuthLayout>
      )
    }
  }
}
