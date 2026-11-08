import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { SharedTaskCard } from '../components/shared/SharedTaskCard'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/SectionHeader'
import { cn } from '../components/ui/cn'
import { useApp } from '../hooks/useApp'
import { countByState, filterShared, FILTERS, sharedTasks, stateOf, type SharedFilter } from '../services/sharedTasks'
import { useUi } from '../store/uiContext'

/** Shared Tasks: shown in full for both people, whichever viewing mode is on. */
export default function Shared() {
  const { tasks, partner } = useApp()
  const ui = useUi()
  const [params] = useSearchParams()
  const focus = params.get('task')
  const all = useMemo(() => sharedTasks(tasks), [tasks])
  const [filter, setFilter] = useState<SharedFilter>('all')
  const counts = countByState(all)
  // Active and awaiting first, completed last; a notification can deep-link to one task.
  const shown = [...filterShared(all, filter)].sort((a, b) => Number(stateOf(a) === 'completed') - Number(stateOf(b) === 'completed'))

  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => document.getElementById(`shared-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
  }, [focus, all.length])

  return (
    <>
      <PageHeader eyebrow="Together" title="Shared" subtitle={`Tasks you and ${partner.name === 'Your partner' ? 'your partner' : partner.name} share. Finishing one needs both of you.`}>
        <Button onClick={ui.openAddTask} icon={<Plus className="h-[18px] w-[18px]" />}>New shared task</Button>
      </PageHeader>

      <div role="tablist" aria-label="Filter shared tasks" className="scroll-thin mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-ctl border px-3.5 text-sm font-medium transition', filter === f.value ? 'border-accent/40 bg-accent/15 text-accent' : 'border-line/15 text-muted hover:text-fg')}
          >
            {f.label}
            <span className="rounded-full bg-line/10 px-1.5 text-[11px] tabular-nums">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title={all.length === 0 ? 'Nothing shared yet' : 'Nothing here'} hint={all.length === 0 ? 'Use New shared task to add something you two do together.' : undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((t) => (
            <SharedTaskCard key={t.id} task={t} highlighted={t.id === focus} />
          ))}
        </div>
      )}
    </>
  )
}
