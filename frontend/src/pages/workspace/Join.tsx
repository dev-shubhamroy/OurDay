import { PartyPopper } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormMessage, Spinner } from '../../components/auth/FormParts'
import { AuthSplash } from '../../components/layout/AuthGuards'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { extractInviteCode, looksLikeInviteCode } from '../../services/invite'

/** /join/:code — opened from the owner's invitation link. Works after registering or signing in. */
export default function Join() {
  const { code: raw = '' } = useParams()
  const code = extractInviteCode(decodeURIComponent(raw))
  const ws = useWorkspace()
  const { status: auth } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (auth === 'disabled') return <Navigate to="/today" replace />
  if (ws.status === 'idle' || ws.status === 'loading') return <AuthSplash />

  if (ws.status === 'ready') {
    return (
      <AuthLayout title="You’re already connected" subtitle="No invitation needed — you’re part of a workspace.">
        <Link to="/today">
          <Button size="lg" className="w-full">
            Open OurDay
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  if (!looksLikeInviteCode(code)) {
    return (
      <AuthLayout title="Invitation not valid" subtitle="This link looks incomplete.">
        <div className="space-y-4">
          <FormMessage tone="error">Ask your partner to send the invitation again.</FormMessage>
          <Link to="/setup">
            <Button variant="soft" size="lg" className="w-full">
              Enter a code instead
            </Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const join = async () => {
    setError(null)
    setBusy(true)
    const r = await ws.acceptInvitation(code)
    setBusy(false)
    if (r.error) return setError(r.error)
    navigate('/today', { replace: true })
  }

  return (
    <AuthLayout title="You’ve been invited" subtitle="Join your partner’s OurDay to plan together and stay in sync.">
      <div className="space-y-4">
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex items-center gap-3 rounded-tile border border-line/10 bg-card/50 p-3.5 text-sm text-muted">
          <PartyPopper className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          You’ll share tasks, deadlines and habits with them.
        </div>
        <Button size="lg" className="w-full" onClick={join} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Joining…
            </>
          ) : (
            'Join OurDay'
          )}
        </Button>
        <Link to="/setup" className="block text-center text-sm font-medium text-accent hover:underline">
          Not now
        </Link>
      </div>
    </AuthLayout>
  )
}
