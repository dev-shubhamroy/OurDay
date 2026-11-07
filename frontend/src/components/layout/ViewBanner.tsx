import { Eye } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useView } from '../../hooks/useView'
import { Button } from '../ui/Button'

/** Screens whose content follows the selected person. */
const VIEWED = ['/home', '/today', '/upcoming', '/deadlines', '/habits']

/** A clear, quiet reminder that Partner Mode is active (and a one-tap way back). */
export function ViewBanner() {
  const { isPartnerView, subject, setMode } = useView()
  const { pathname } = useLocation()
  if (!isPartnerView || !VIEWED.includes(pathname)) return null
  return (
    <div role="status" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile border border-accent2/30 bg-accent2/10 px-4 py-2.5 text-sm">
      <Eye className="h-4 w-4 shrink-0 text-accent2" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-accent2">Partner Mode</span> · viewing {subject.name}’s deadlines, tasks, habits and progress.
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={() => setMode('me')}>
        Back to My Mode
      </Button>
    </div>
  )
}
