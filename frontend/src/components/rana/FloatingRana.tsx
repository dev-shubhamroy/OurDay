import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sunrise } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { ranaAck, ranaStatus } from '../../services/rana'
import { RanaRobot, type RanaMood } from './RanaRobot'

/** Small floating companion. Deterministic status + restrained acknowledgement — not a chatbot. */
export function FloatingRana() {
  const { tasks, habits, now, pulse, me } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState<RanaMood>('idle')
  const [ack, setAck] = useState<string | null>(null)
  const last = useRef(pulse)

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
    <div className="pointer-events-none fixed bottom-4 right-3 z-30 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {showBubble && (
        <div className="glass pointer-events-auto max-w-[260px] animate-rise rounded-2xl rounded-br-md p-4 shadow-float" role="status">
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
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Hide RANA' : 'Show RANA'}
        aria-expanded={open}
        className="group pointer-events-auto relative grid h-[84px] w-[84px] place-items-center rounded-full"
      >
        <span className="absolute inset-2 rounded-full bg-accent/20 animate-pulseRing" />
        <span className="glass absolute inset-1.5 rounded-full shadow-float transition group-hover:shadow-glow" />
        <RanaRobot mood={mood} glow={false} className="relative h-[68px] w-[68px]" />
      </button>
    </div>
  )
}
