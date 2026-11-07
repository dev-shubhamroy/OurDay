import type { ReactNode } from 'react'

export function SectionHeader({ icon, title, meta }: { icon: ReactNode; title: string; meta?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</span>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {meta && <span className="ml-auto text-sm text-muted">{meta}</span>}
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line/20 px-6 py-8 text-center">
      <span className="mb-2 text-muted">{icon}</span>
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  )
}
