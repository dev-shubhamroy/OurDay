import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Floating glass dialog on desktop, bottom sheet on mobile. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('input,textarea,button[data-autofocus]')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={onClose} className="absolute inset-0 animate-rise bg-bg/70 backdrop-blur-sm" />
      <div ref={panel} className="glass relative flex max-h-[92dvh] w-full max-w-lg animate-rise flex-col rounded-t-4xl shadow-float sm:rounded-4xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-line/10 hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-6 pb-6 safe-bottom">{children}</div>
      </div>
    </div>
  )
}
