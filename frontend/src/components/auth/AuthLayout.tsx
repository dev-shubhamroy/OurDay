import type { ReactNode } from 'react'
import { AuroraCard } from '../ui/AuroraCard'
import { BrandMark } from '../ui/RanaMark'

/** Shared frame for sign-in, registration, recovery and workspace screens. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="app-backdrop relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex animate-fade items-center gap-3">
        <BrandMark className="h-11 w-11" />
        <div className="leading-tight">
          <p className="font-display text-2xl font-bold tracking-tight">OurDay</p>
          <p className="text-xs text-muted">Plan together. Stay in sync.</p>
        </div>
      </div>
      <AuroraCard variant="rana" large className="w-full max-w-md animate-rise p-6 sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </AuroraCard>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  )
}
