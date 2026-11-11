import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormMessage, PasswordField, Spinner, TextField } from '../../components/auth/FormParts'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { loadPendingInvite } from '../../services/invite'
import { isValidEmail, passwordStrength } from '../../services/password'

export default function Register() {
  const { signUp } = useAuth()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Please tell us your name.')
    if (name.trim().length > 60) return setError('Please use a shorter name (60 characters or fewer).')
    if (!isValidEmail(email)) return setError('Please enter a valid email address.')
    if (!passwordStrength(password).ok) return setError('Please choose a password with at least 8 characters.')
    setError(null)
    setBusy(true)
    const r = await signUp(name, email, password)
    setBusy(false)
    if (r.error) return setError(r.error)
    if (r.notice) setNotice(r.notice)
    // Otherwise the auth listener signs the new user in and the route guard continues the flow.
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes a few seconds. No email verification needed."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {loadPendingInvite() && <FormMessage tone="info">Create your account to accept your invitation. We’ll bring you straight back to it.</FormMessage>}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {notice && <FormMessage tone="info">{notice}</FormMessage>}
        <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="How your partner sees you" maxLength={60} />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" />
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" showStrength />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
