import { BrandMark } from '../../components/ui/RanaMark'
import { AuroraCard } from '../../components/ui/AuroraCard'

/** Placeholder for Milestone 1. The real sign-in screen arrives in Milestone 3. */
export default function Login() {
  return (
    <div className="app-backdrop grid min-h-dvh place-items-center px-4">
      <AuroraCard variant="rana" large className="w-full max-w-sm p-6 text-center">
        <BrandMark className="mx-auto mb-4 h-12 w-12" />
        <h1 className="text-2xl font-bold">OurDay</h1>
        <p className="mt-1 text-sm text-muted">Plan together. Stay in sync.</p>
        <p className="mt-5 text-sm text-muted">Sign-in is being built in the next milestone.</p>
      </AuroraCard>
    </div>
  )
}
