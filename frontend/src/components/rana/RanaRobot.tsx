import { useId } from 'react'
import { cn } from '../ui/cn'

export type RanaMood = 'idle' | 'greet' | 'happy'

/**
 * RANA — a floating machine companion: black metallic body, glowing blue eyes.
 * Purely presentational and deterministic; never human-like.
 */
export function RanaRobot({ mood = 'idle', className, glow = true }: { mood?: RanaMood; className?: string; glow?: boolean }) {
  const id = useId().replace(/:/g, '')
  const happy = mood === 'happy'
  return (
    <svg viewBox="0 0 220 250" className={cn('overflow-visible', className)} role="img" aria-label="RANA, your daily companion">
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#4a5873" />
          <stop offset="0.18" stopColor="#222c3f" />
          <stop offset="0.6" stopColor="#0e1420" />
          <stop offset="1" stopColor="#05070c" />
        </linearGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b3650" />
          <stop offset="0.5" stopColor="#0f1521" />
          <stop offset="1" stopColor="#05070c" />
        </linearGradient>
        <linearGradient id={`${id}-eye`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b6f0ff" />
          <stop offset="0.45" stopColor="#27c8ff" />
          <stop offset="1" stopColor="#1491d6" />
        </linearGradient>
        <radialGradient id={`${id}-visor`} cx="0.5" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#0f1d33" />
          <stop offset="1" stopColor="#02040a" />
        </radialGradient>
        <radialGradient id={`${id}-halo`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#27c8ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#27c8ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* ground shadow / hover glow — stays put while the body floats */}
      {glow && <ellipse cx="110" cy="236" rx="52" ry="8" fill={`url(#${id}-halo)`} />}

      <g className="animate-float">
        <g className={cn(happy && 'origin-center animate-nod')} style={{ transformOrigin: '110px 110px' }}>
          {/* antenna */}
          <rect x="107" y="14" width="6" height="26" rx="3" fill="#1b2434" />
          <circle cx="110" cy="12" r="7" fill="#27c8ff" filter={`url(#${id}-blur)`} opacity="0.8" />
          <circle cx="110" cy="12" r="4.5" fill="#bdf3ff" />

          {/* ear pods */}
          <rect x="14" y="78" width="16" height="42" rx="8" fill={`url(#${id}-body)`} stroke="#27c8ff" strokeOpacity="0.45" />
          <rect x="190" y="78" width="16" height="42" rx="8" fill={`url(#${id}-body)`} stroke="#27c8ff" strokeOpacity="0.45" />
          <rect x="19" y="90" width="6" height="18" rx="3" fill="#27c8ff" opacity="0.7" />
          <rect x="195" y="90" width="6" height="18" rx="3" fill="#27c8ff" opacity="0.7" />

          {/* head shell */}
          <rect x="24" y="38" width="172" height="118" rx="52" fill={`url(#${id}-shell)`} stroke="#5d6f90" strokeOpacity="0.35" strokeWidth="1.5" />
          <path d="M52 50 C 90 40, 140 40, 170 50" stroke="#fff" strokeOpacity="0.16" strokeWidth="3" strokeLinecap="round" fill="none" />

          {/* visor */}
          <rect x="42" y="62" width="136" height="72" rx="36" fill={`url(#${id}-visor)`} stroke="#27c8ff" strokeOpacity="0.35" />
          <rect x="42" y="62" width="136" height="72" rx="36" fill="none" stroke="#27c8ff" strokeOpacity="0.12" strokeWidth="6" />

          {/* eyes */}
          <g className="animate-glance">
            {happy ? (
              <g stroke="#7fe3ff" strokeWidth="9" strokeLinecap="round" fill="none" filter={`url(#${id}-blur)`} opacity="0.7">
                <path d="M72 108 Q 83 90 94 108" />
                <path d="M126 108 Q 137 90 148 108" />
              </g>
            ) : null}
            {happy ? (
              <g stroke={`url(#${id}-eye)`} strokeWidth="8" strokeLinecap="round" fill="none">
                <path d="M72 108 Q 83 90 94 108" />
                <path d="M126 108 Q 137 90 148 108" />
              </g>
            ) : (
              <>
                <g style={{ transformBox: 'fill-box', transformOrigin: 'center' }} className="animate-blink">
                  <rect x="70" y="80" width="26" height="36" rx="13" fill="#27c8ff" opacity="0.55" filter={`url(#${id}-blur)`} />
                  <rect x="72" y="82" width="22" height="32" rx="11" fill={`url(#${id}-eye)`} />
                  <rect x="76" y="86" width="7" height="9" rx="3.5" fill="#fff" opacity="0.75" />
                </g>
                <g style={{ transformBox: 'fill-box', transformOrigin: 'center' }} className="animate-blink">
                  <rect x="124" y="80" width="26" height="36" rx="13" fill="#27c8ff" opacity="0.55" filter={`url(#${id}-blur)`} />
                  <rect x="126" y="82" width="22" height="32" rx="11" fill={`url(#${id}-eye)`} />
                  <rect x="130" y="86" width="7" height="9" rx="3.5" fill="#fff" opacity="0.75" />
                </g>
              </>
            )}
          </g>
          {/* mouth sensor */}
          <rect x="98" y="124" width="24" height="3" rx="1.5" fill="#27c8ff" opacity="0.45" />

          {/* neck + torso */}
          <rect x="94" y="154" width="32" height="12" rx="5" fill="#0b101a" />
          <path d="M70 172 Q 110 160 150 172 L 142 222 Q 110 232 78 222 Z" fill={`url(#${id}-body)`} stroke="#5d6f90" strokeOpacity="0.3" />
          <rect x="94" y="190" width="32" height="5" rx="2.5" fill="#27c8ff" opacity="0.8" />
          <rect x="102" y="201" width="16" height="3" rx="1.5" fill="#27c8ff" opacity="0.4" />

          {/* floating hands */}
          <g className={cn(mood === 'greet' && 'rana-wave')} style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}>
            <circle cx="46" cy="186" r="13" fill={`url(#${id}-body)`} stroke="#27c8ff" strokeOpacity="0.4" />
            <circle cx="46" cy="186" r="4" fill="#27c8ff" opacity="0.7" />
          </g>
          <g>
            <circle cx="174" cy="190" r="13" fill={`url(#${id}-body)`} stroke="#27c8ff" strokeOpacity="0.4" />
            <circle cx="174" cy="190" r="4" fill="#27c8ff" opacity="0.7" />
          </g>
        </g>
      </g>
    </svg>
  )
}
