import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { useBackClose } from '../../hooks/useBackClose'

/** Floating glass dialog on desktop, bottom sheet on mobile. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useBackClose(open, onClose)

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
      <div onClick={onClose} className="absolute inset-0 animate-fade bg-bg/70 backdrop-blur-sm" />
      <div ref={panel} className="glass relative flex max-h-[92dvh] bg-surface/95 w-full max-w-lg animate-rise flex-col rounded-t-card shadow-float sm:rounded-card">
        <div className="flex items-center justify-between px-5 pb-1.5 pt-4 sm:px-6 sm:pt-5">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="border-transparent">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6 safe-bottom">{children}</div>
      </div>
    </div>
  )
}
