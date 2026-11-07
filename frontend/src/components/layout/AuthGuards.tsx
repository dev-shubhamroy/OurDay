import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { BrandMark } from '../ui/RanaMark'

/** Shown while the saved session is being restored (avoids a login-screen flash on refresh). */
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

/** Auth screens are for signed-out visitors; signed-in users go straight to the app. */
export function PublicOnly() {
  const { status } = useAuth()
  if (status === 'loading') return <AuthSplash />
  if (status === 'signedIn' || status === 'disabled') return <Navigate to="/home" replace />
  return <Outlet />
}
