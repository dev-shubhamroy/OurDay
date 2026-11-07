import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { PublicOnly, RequireAuth } from './components/layout/AuthGuards'
import { useApp } from './hooks/useApp'
import Login from './pages/auth/Login'
import Briefing from './pages/Briefing'
import Completed from './pages/Completed'
import Deadlines from './pages/Deadlines'
import Habits from './pages/Habits'
import Home from './pages/Home'
import Past from './pages/Past'
import Settings from './pages/Settings'
import Today from './pages/Today'
import Upcoming from './pages/Upcoming'
import { hasSeenBriefing } from './services/briefingSeen'
import { AppProvider } from './store/AppProvider'
import { AuthProvider } from './store/AuthProvider'
import { ThemeProvider } from './store/theme'

/** The first screen each day is RANA's briefing. */
function BriefingGate() {
  const { today } = useApp()
  const { pathname } = useLocation()
  if (!hasSeenBriefing(today) && pathname !== '/briefing') return <Navigate to="/briefing" replace />
  return <Outlet />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicOnly />}>
              <Route path="/login" element={<Login />} />
            </Route>
            <Route element={<RequireAuth />}>
            <Route element={<BriefingGate />}>
              <Route path="/briefing" element={<Briefing />} />
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<Home />} />
                <Route path="/today" element={<Today />} />
                <Route path="/upcoming" element={<Upcoming />} />
                <Route path="/deadlines" element={<Deadlines />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/completed" element={<Completed />} />
                <Route path="/past" element={<Past />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/home" replace />} />
              </Route>
            </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
