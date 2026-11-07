import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CheckCircle2, Menu, Moon, Plus, Sun, X } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { BrandMark } from '../ui/RanaMark'
import { UiContext } from '../../store/uiContext'
import { AddTaskModal } from '../tasks/AddTaskModal'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { FloatingRana } from '../rana/FloatingRana'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [drawer, setDrawer] = useState(false)
  const { resolved, toggle } = useTheme()
  const { pathname } = useLocation()
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToastMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const showToast = useCallback((m: string) => {
    setToastMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToastMsg(null), 2800)
  }, [])
  const ui = useMemo(() => ({ openAddTask: () => setAddOpen(true), toast: showToast }), [showToast])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <UiContext.Provider value={ui}>
    <div className="app-backdrop relative min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 border-y-0 border-l-0 bg-sidebar/80 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden ${drawer ? '' : 'pointer-events-none'}`} aria-hidden={!drawer}>
        <div onClick={() => setDrawer(false)} className={`absolute inset-0 bg-bg/70 backdrop-blur-sm transition-opacity duration-300 ${drawer ? 'opacity-100' : 'opacity-0'}`} />
        <aside className={`glass absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-float transition-transform duration-300 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}>
          <IconButton label="Close menu" onClick={() => setDrawer(false)} className="absolute right-3 top-3 border-transparent">
            <X className="h-5 w-5" />
          </IconButton>
          <Sidebar onNavigate={() => setDrawer(false)} />
        </aside>
      </div>

      <div className="relative z-10 lg:pl-64">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-2 border-x-0 border-t-0 px-3 sm:gap-3 sm:px-6 lg:px-10">
          <IconButton label="Open menu" onClick={() => setDrawer(true)} className="border-transparent lg:hidden">
            <Menu className="h-5 w-5" />
          </IconButton>
          <div className="flex items-center gap-2 lg:hidden">
            <BrandMark className="h-8 w-8" />
            <span className="font-display hidden text-lg font-bold tracking-tight min-[360px]:inline">OurDay</span>
          </div>
          <div className="ml-auto flex items-center gap-2" id="topbar-actions">
            <Button onClick={() => setAddOpen(true)} icon={<Plus className="h-[18px] w-[18px]" />} className="px-3.5 sm:px-5">
              <span className="hidden sm:inline">Add Task</span>
              <span className="sm:hidden">Add</span>
            </Button>
            <IconButton label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`} onClick={toggle}>
              {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </IconButton>
          </div>
        </header>
        <main key={pathname} className="mx-auto w-full max-w-[1200px] animate-fade px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pt-10">
          <Outlet />
        </main>
      </div>
      <FloatingRana />
      <AddTaskModal open={addOpen} onClose={() => setAddOpen(false)} onAdded={showToast} />
      {toast && (
        <div role="status" className="glass fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 animate-rise items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-float sm:bottom-8">
          <CheckCircle2 className="h-4 w-4 text-ok" /> {toast}
        </div>
      )}
    </div>
    </UiContext.Provider>
  )
}
