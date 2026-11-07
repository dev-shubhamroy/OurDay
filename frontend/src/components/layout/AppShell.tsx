import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { BrandMark } from '../ui/RanaMark'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [drawer, setDrawer] = useState(false)
  const { resolved, toggle } = useTheme()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="app-backdrop relative min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 border-y-0 border-l-0 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden ${drawer ? '' : 'pointer-events-none'}`} aria-hidden={!drawer}>
        <div onClick={() => setDrawer(false)} className={`absolute inset-0 bg-bg/70 backdrop-blur-sm transition-opacity duration-300 ${drawer ? 'opacity-100' : 'opacity-0'}`} />
        <aside className={`glass absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-float transition-transform duration-300 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}>
          <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-line/10">
            <X className="h-5 w-5" />
          </button>
          <Sidebar onNavigate={() => setDrawer(false)} />
        </aside>
      </div>

      <div className="relative z-10 lg:pl-64">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6 lg:px-10">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-line/10 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <BrandMark className="h-8 w-8" />
            <span className="font-semibold tracking-tight">OurDay</span>
          </div>
          <div className="ml-auto flex items-center gap-2" id="topbar-actions">
            <button
              onClick={toggle}
              aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
              className="grid h-10 w-10 place-items-center rounded-xl border border-line/10 text-muted transition hover:bg-line/10 hover:text-fg"
            >
              {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
