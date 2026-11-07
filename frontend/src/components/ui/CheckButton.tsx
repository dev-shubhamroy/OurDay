import { cn } from './cn'

/** Round completion control. Completed state draws a green check with a short pop. */
export function CheckButton({ checked, onToggle, label, size = 'md' }: { checked: boolean; onToggle: () => void; label: string; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full border-2 transition duration-200',
        dim,
        checked ? 'border-ok bg-ok text-white animate-pop' : 'border-line/30 text-transparent hover:border-accent hover:bg-accent/10 hover:text-accent/70',
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" key={String(checked)} strokeDasharray="24" strokeDashoffset={checked ? 24 : 0} className={checked ? 'animate-draw' : ''} />
      </svg>
    </button>
  )
}
