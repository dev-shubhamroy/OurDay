import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sunrise } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { ranaAck, ranaStatus } from '../../services/rana'
import { AuroraCard } from '../ui/AuroraCard'
import { RanaRobot, type RanaMood } from './RanaRobot'

/** Small floating companion. Deterministic status + restrained acknowledgement — not a chatbot. */
export function FloatingRana() {
  const { tasks, habits, now, pulse, me } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState<RanaMood>('idle')
  const [ack, setAck] = useState<string | null>(null)
  const last = useRef(pulse)
  // While the page scrolls, RANA fades back so it never covers row details; it returns when scrolling stops.
  const [scrolling, setScrolling] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      setScrolling(true)
      clearTimeout(t)
      t = setTimeout(() => setScrolling(false), 450)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    if (pulse === last.current) return
    last.current = pulse
    // Acknowledge each completion briefly; sync to the external pulse counter.
    const start = setTimeout(() => {
      setMood('happy')
      setAck(ranaAck(pulse))
    }, 0)
    const end = setTimeout(() => {
      setMood('idle')
      setAck(null)
    }, 2400)
    return () => {
      clearTimeout(start)
      clearTimeout(end)
    }
  }, [pulse])

  const message = ack ?? ranaStatus(tasks, habits, now, me.id)
  const showBubble = open || ack !== null

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-30 flex flex-col items-end gap-2 sm:right-6 lg:bottom-6">
      {showBubble && (
        <AuroraCard variant="rana" large className="pointer-events-auto max-w-[260px] animate-rise !rounded-br-md p-4" role="status">
          <p className="eyebrow mb-1 text-accent">RANA</p>
          <p className="text-sm leading-relaxed">{message}</p>
          {open && !ack && (
            <button
              onClick={() => {
                setOpen(false)
                navigate('/briefing')
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
            >
              <Sunrise className="h-3.5 w-3.5" /> Replay today’s briefing
            </button>
          )}
        </AuroraCard>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Hide RANA' : 'Show RANA'}
        aria-expanded={open}
        className={`group pointer-events-auto relative grid h-16 w-16 place-items-center rounded-full transition-opacity duration-300 sm:h-[76px] sm:w-[76px] ${scrolling && !open ? 'opacity-25' : 'opacity-100'}`}
      >
        <span className="absolute inset-1.5 rounded-full bg-accent/20 animate-pulseRing" />
        <span className="glass absolute inset-1 rounded-full shadow-float transition group-hover:shadow-glow" />
        <RanaRobot mood={mood} glow={false} className="relative h-[52px] w-[52px] sm:h-[60px] sm:w-[60px]" />
      </button>
    </div>
  )
}
