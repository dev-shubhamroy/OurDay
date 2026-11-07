import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { FormMessage, Spinner, TextField } from '../../components/auth/FormParts'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { isValidEmail } from '../../services/password'

const COOLDOWN = 45

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || wait > 0) return
    if (!isValidEmail(email)) return setError('Please enter a valid email address.')
    setError(null)
    setBusy(true)
    const r = await requestPasswordReset(email)
    setBusy(false)
    if (r.error) return setError(r.error)
    setSent(true)
    setWait(COOLDOWN)
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we’ll send you a secure link to choose a new password."
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {sent && <FormMessage tone="success">If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).</FormMessage>}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" />
        <Button type="submit" size="lg" className="w-full" disabled={busy || wait > 0}>
          {busy ? (
            <>
              <Spinner /> Sending…
            </>
          ) : wait > 0 ? (
            `Send again in ${wait}s`
          ) : sent ? (
            'Send again'
          ) : (
            'Send reset link'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
