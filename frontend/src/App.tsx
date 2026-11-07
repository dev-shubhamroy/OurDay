import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { NAV_ITEMS } from './components/layout/nav'
import Placeholder from './pages/Placeholder'
import { ThemeProvider } from './store/theme'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/home" replace />} />
            {NAV_ITEMS.map((n) => (
              <Route key={n.to} path={n.to} element={<Placeholder title={n.label} />} />
            ))}
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
