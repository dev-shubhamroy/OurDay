import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useWorkspace } from '../../hooks/useWorkspace'
import { AppData } from '../../store/AppData'
import { Button } from '../ui/Button'
import { AuroraCard } from '../ui/AuroraCard'
import { BrandMark } from '../ui/RanaMark'

/** Shown while the saved session / workspace is being restored (avoids a login-screen flash on refresh). */
export function AuthSplash() {
  return (
    <div className="app-backdrop grid min-h-dvh place-items-center" role="status" aria-label="Loading OurDay">
      <BrandMark className="h-14 w-14 animate-pulse" />
    </div>
  )
}

/** Protects the application. In demo mode (Supabase not configured) everything stays open, as before. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <AuthSplash />
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/** Auth screens are for signed-out visitors; signed-in users continue to where they were headed. */
export function PublicOnly() {
  const { status, recovering } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <AuthSplash />
  if ((status === 'signedIn' && !recovering) || status === 'disabled') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && !from.startsWith('/login') ? from : '/today'} replace />
  }
  return <Outlet />
}

/** The app proper needs a workspace. New users are sent to create or join one. */
export function RequireWorkspace() {
  const { status: auth } = useAuth()
  const { status, refresh } = useWorkspace()
  if (auth === 'disabled') return <AppData />
  if (status === 'idle' || status === 'loading') return <AuthSplash />
  if (status === 'error') {
    return (
      <div className="app-backdrop grid min-h-dvh place-items-center px-4">
        <AuroraCard variant="rana" large className="w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-bold">Can’t reach OurDay</h1>
          <p className="mt-2 text-sm text-muted">Check your connection, then try again.</p>
          <Button className="mt-5 w-full" onClick={() => void refresh()}>
            Try again
          </Button>
        </AuroraCard>
      </div>
    )
  }
  if (status === 'none') return <Navigate to="/setup" replace />
  return <AppData />
}
