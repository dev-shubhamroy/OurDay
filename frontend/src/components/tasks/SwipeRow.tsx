import { useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

const THRESHOLD = 88

/** Swipe right to complete on touch devices. Mouse/pen input is ignored (use the check button). */
export function SwipeRow({ onComplete, disabled, children }: { onComplete: () => void; disabled?: boolean; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null)

  const down = (e: React.PointerEvent) => {
    if (disabled || e.pointerType !== 'touch') return
    start.current = { x: e.clientX, y: e.clientY, locked: false }
  }
  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const mx = e.clientX - s.x
    if (!s.locked && Math.abs(e.clientY - s.y) > 12 && Math.abs(e.clientY - s.y) > Math.abs(mx)) {
      start.current = null
      setDx(0)
      return
    }
    if (Math.abs(mx) > 8) s.locked = true
    setDx(Math.max(0, Math.min(mx, 140)))
  }
  const end = () => {
    if (!start.current) return
    start.current = null
    if (dx >= THRESHOLD) onComplete()
    setDx(0)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        className="absolute inset-0 flex items-center rounded-2xl bg-ok/20 pl-5 text-ok"
        style={{ opacity: Math.min(1, dx / THRESHOLD) }}
        aria-hidden="true"
      >
        <Check className="h-6 w-6" strokeWidth={3} />
      </div>
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform .25s ease' : 'none', touchAction: disabled ? 'auto' : 'pan-y' }}
      >
        {children}
      </div>
    </div>
  )
}
