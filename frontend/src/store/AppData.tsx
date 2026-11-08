import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApp } from '../hooks/useApp'
import { Button } from '../components/ui/Button'
import { AuroraCard } from '../components/ui/AuroraCard'
import { AuthSplash } from '../components/layout/AuthGuards'
import { AppProvider } from './AppProvider'
import { NotificationProvider } from './NotificationProvider'
import { QuoteProvider } from './QuoteProvider'
import { RemoteAppProvider } from './RemoteAppProvider'
import { ViewProvider } from './ViewProvider'

/** First-load gate for real data: splash while loading, retry card if the very first load fails. */
function LoadGate() {
  const { sync } = useApp()
  if (sync.loading && sync.remote) return <AuthSplash />
  if (sync.loadError) {
    return (
      <div className="app-backdrop grid min-h-dvh place-items-center px-4">
        <AuroraCard variant="rana" large className="w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-bold">Can’t load your data</h1>
          <p className="mt-2 text-sm text-muted">{sync.loadError}</p>
          <Button className="mt-5 w-full" onClick={sync.retry}>
            Try again
          </Button>
        </AuroraCard>
      </div>
    )
  }
  return (
    <ViewProvider>
      <Outlet />
    </ViewProvider>
  )
}

/**
 * Chooses the data source: real shared data when Supabase is configured and the user is in a workspace;
 * local mock data (demo mode) otherwise. Everything below this uses the same `useApp()` interface.
 */
export function AppData() {
  const { status } = useAuth()
  if (status === 'disabled') {
    return (
      <AppProvider>
        <QuoteProvider>
          <ViewProvider>
            <Outlet />
          </ViewProvider>
        </QuoteProvider>
      </AppProvider>
    )
  }
  return (
    <RemoteAppProvider>
      <NotificationProvider>
        <QuoteProvider>
          <LoadGate />
        </QuoteProvider>
      </NotificationProvider>
    </RemoteAppProvider>
  )
}
