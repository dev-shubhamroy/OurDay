import { Pencil } from 'lucide-react'
import type { EditTarget } from '../../store/uiContext'
import { useUi } from '../../store/uiContext'

/** Small pencil that opens the edit dialog. Visually compact, 44px touch target. */
export function EditButton({ target, label }: { target: EditTarget; label: string }) {
  const { openEdit } = useUi()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openEdit(target)
      }}
      aria-label={label}
      title={label}
      className="hit-44 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-line/10 hover:text-fg"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}
