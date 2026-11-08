import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormMessage, PasswordField, Spinner } from '../../components/auth/FormParts'
import { AuthSplash } from '../../components/layout/AuthGuards'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { passwordStrength } from '../../services/password'

/** Reads an error Supabase appended to the reset link (expired / already used). */
function linkProblem(): boolean {
  const raw = `${window.location.search}&${window.location.hash.replace(/^#/, '')}`
  const p = new URLSearchParams(raw)
  return p.has('error') || p.has('error_code') || p.has('error_description')
}

export default function ResetPassword() {
  const { status, recovering, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Give Supabase a moment to exchange the link's code for a recovery session before declaring the link invalid.
  const [waited, setWaited] = useState(false)
  const bad = linkProblem()

  useEffect(() => {
    const id = setTimeout(() => setWaited(true), 4000)
    return () => clearTimeout(id)
  }, [])

  if (status === 'loading' || (!bad && !recovering && status !== 'signedIn' && !waited)) return <AuthSplash />

  // A valid recovery link produces a (recovery) session; without one the link is expired or invalid.
  if (bad || (!recovering && status !== 'signedIn')) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work once and expire after a short time.">
        <div className="space-y-4">
          <FormMessage tone="error">The password reset link is invalid or has expired.</FormMessage>
          <Link to="/forgot-password">
            <Button size="lg" className="w-full">
              Request a new link
            </Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!passwordStrength(password).ok) return setError('Please choose a password with at least 8 characters.')
    setError(null)
    setBusy(true)
    const r = await updatePassword(password)
    setBusy(false)
    if (r.error) return setError(r.error)
    setDone(true)
    setTimeout(() => navigate('/today', { replace: true }), 1200)
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Pick something you haven’t used before.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {done && <FormMessage tone="success">Password updated. Taking you in…</FormMessage>}
        <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" showStrength />
        <Button type="submit" size="lg" className="w-full" disabled={busy || done}>
          {busy ? (
            <>
              <Spinner /> Saving…
            </>
          ) : (
            'Update password'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
