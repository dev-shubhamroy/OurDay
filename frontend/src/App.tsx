import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { NAV_ITEMS } from './components/layout/nav'
import { useApp } from './hooks/useApp'
import Briefing from './pages/Briefing'
import Placeholder from './pages/Placeholder'
import { hasSeenBriefing } from './services/briefingSeen'
import { AppProvider } from './store/AppProvider'
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
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<BriefingGate />}>
              <Route path="/briefing" element={<Briefing />} />
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/home" replace />} />
                {NAV_ITEMS.map((n) => (
                  <Route key={n.to} path={n.to} element={<Placeholder title={n.label} />} />
                ))}
                <Route path="*" element={<Navigate to="/home" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </ThemeProvider>
  )
}
