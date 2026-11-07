import { Link2, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormMessage, Spinner, TextField } from '../../components/auth/FormParts'
import { AuthSplash } from '../../components/layout/AuthGuards'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { extractInviteCode, looksLikeInviteCode } from '../../services/invite'

/** First-run: the first person creates the workspace; the second joins with an invitation. */
export default function Setup() {
  const { user, signOut, status: auth } = useAuth()
  const ws = useWorkspace()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')

  if (auth === 'disabled') return <Navigate to="/home" replace />
  if (ws.status === 'idle' || ws.status === 'loading') return <AuthSplash />
  if (ws.status === 'ready') return <Navigate to="/home" replace />

  const create = async () => {
    setError(null)
    setBusy('create')
    const r = await ws.createWorkspace()
    setBusy(null)
    if (r.error) return setError(r.error)
    navigate('/home', { replace: true })
  }

  const join = async (e: FormEvent) => {
    e.preventDefault()
    const c = extractInviteCode(code)
    if (!looksLikeInviteCode(c)) return setError('That doesn’t look like an invitation link or code.')
    setError(null)
    setBusy('join')
    const r = await ws.acceptInvitation(c)
    setBusy(null)
    if (r.error) return setError(r.error)
    navigate('/home', { replace: true })
  }

  return (
    <AuthLayout
      title={`Welcome${user?.name ? `, ${user.name}` : ''}`}
      subtitle="OurDay is a private space for two. Start one, or join your partner’s."
      footer={
        <button onClick={() => void signOut()} className="font-semibold text-accent hover:underline">
          Sign out
        </button>
      }
    >
      <div className="space-y-6">
        {error && <FormMessage tone="error">{error}</FormMessage>}

        <section>
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-accent" /> Start OurDay
          </h2>
          <p className="mb-3 text-sm text-muted">You’ll be the owner and can invite your partner right after.</p>
          <Button size="lg" className="w-full" onClick={create} disabled={busy !== null}>
            {busy === 'create' ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              'Create our workspace'
            )}
          </Button>
        </section>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
          <span className="h-px flex-1 bg-line/15" /> or <span className="h-px flex-1 bg-line/15" />
        </div>

        <section>
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <Link2 className="h-4 w-4 text-accent" /> Join with an invitation
          </h2>
          <form onSubmit={join} className="space-y-3" noValidate>
            <TextField label="Invitation link or code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the link or code your partner sent" autoComplete="off" spellCheck={false} />
            <Button type="submit" variant="soft" size="lg" className="w-full" disabled={busy !== null || !code.trim()}>
              {busy === 'join' ? (
                <>
                  <Spinner /> Joining…
                </>
              ) : (
                'Join workspace'
              )}
            </Button>
          </form>
        </section>
      </div>
    </AuthLayout>
  )
}
