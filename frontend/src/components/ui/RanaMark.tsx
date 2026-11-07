/** Compact brand mark: a visor with two glowing eyes. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#223653" />
          <stop offset="1" stopColor="#080d18" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#bm-bg)" />
      <rect x="11" y="19" width="42" height="27" rx="13" fill="#0b1220" stroke="rgb(39 200 255 / .55)" strokeWidth="2" />
      <rect x="21" y="28" width="7" height="10" rx="3.5" fill="#27c8ff" />
      <rect x="36" y="28" width="7" height="10" rx="3.5" fill="#27c8ff" />
    </svg>
  )
}
