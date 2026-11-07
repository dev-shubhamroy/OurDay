import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, CircleDot, Flag, ListChecks, Repeat } from 'lucide-react'
import { RanaRobot } from '../components/rana/RanaRobot'
import { UrgencyBadge } from '../components/tasks/UrgencyBadge'
import { Button } from '../components/ui/Button'
import { useApp } from '../hooks/useApp'
import { formatDeadline, formatLongDate, formatClock, formatRemaining } from '../services/dates'
import { markBriefingSeen } from '../services/briefingSeen'
import { scheduleLabel } from '../services/habits'
import { buildBriefing } from '../services/rana'
import { remainingMs, urgencyOf } from '../services/urgency'

export default function Briefing() {
  const { tasks, habits, now, today, me } = useApp()
  const navigate = useNavigate()
  const b = useMemo(() => buildBriefing(tasks, habits, now, me), [tasks, habits, now, me])

  const start = () => {
    markBriefingSeen(today)
    navigate('/home', { replace: true })
  }

  return (
    <div className="app-backdrop relative min-h-dvh overflow-x-hidden">
      <div className="relative z-10 mx-auto grid min-h-dvh max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-14 lg:py-12">
        {/* RANA + speech */}
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <p className="eyebrow mb-4">{formatLongDate(now)} · Daily briefing</p>
          <RanaRobot mood="greet" className="h-52 w-52 sm:h-64 sm:w-64" />
          <div className="glass relative mt-4 w-full rounded-3xl p-5 shadow-float lg:mt-6">
            <p className="eyebrow mb-2 text-accent">RANA</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl animate-rise">{b.greeting}</h1>
            <div className="mt-3 space-y-2 text-[15px] leading-relaxed text-fg/90">
              {b.lines.map((line, i) => (
                <p key={i} className="animate-rise" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          <Button size="lg" onClick={start} className="mt-6 w-full sm:w-auto">
            Let’s get started <ArrowRight className="h-5 w-5" />
          </Button>
        </section>

        {/* The briefing content, in the required order */}
        <section className="space-y-5">
          <BriefSection icon={<Flag className="h-4 w-4" />} title="Today’s deadlines" count={b.deadlines.length} empty="No deadlines today.">
            {b.deadlines.map((t) => {
              const u = urgencyOf(t, now)
              return (
                <li key={t.id} className="tile flex items-center gap-3 p-3.5">
                  <span className={`h-10 w-1 rounded-full ${u === 'critical' ? 'bg-danger' : u === 'approaching' ? 'bg-warn' : 'bg-accent'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-muted">{formatDeadline(t.dueAt!, today)} · {formatRemaining(remainingMs(t, now))}</p>
                  </div>
                  {t.notifySecondUser && <Bell className="h-3.5 w-3.5 text-accent" aria-label="Shared notifications" />}
                  <UrgencyBadge urgency={u} />
                </li>
              )
            })}
          </BriefSection>

          <BriefSection icon={<ListChecks className="h-4 w-4" />} title="Today’s tasks" count={b.tasks.length} empty="Nothing planned yet.">
            {b.tasks.map((t) => (
              <li key={t.id} className="tile flex items-center gap-3 p-3.5">
                <span className="h-4 w-4 rounded-md border-2 border-line/30" />
                <p className="min-w-0 flex-1 truncate font-medium">{t.title}</p>
                <span className="text-xs text-muted">{t.time ? formatClock(t.time) : 'Anytime'}</span>
                {t.notifySecondUser && <Bell className="h-3.5 w-3.5 text-accent" aria-label="Shared notifications" />}
              </li>
            ))}
          </BriefSection>

          <BriefSection icon={<Repeat className="h-4 w-4" />} title="Today’s habits" count={b.habits.length} empty="No habits scheduled today.">
            {b.habits.map((h) => (
              <li key={h.id} className="tile flex items-center gap-3 p-3.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 text-accent">
                  <CircleDot className="h-4 w-4" />
                </span>
                <p className="min-w-0 flex-1 truncate font-medium">{h.title}</p>
                <span className="text-xs text-muted">{scheduleLabel(h)}</span>
              </li>
            ))}
          </BriefSection>
        </section>
      </div>
    </div>
  )
}

function BriefSection({ icon, title, count, empty, children }: { icon: React.ReactNode; title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div className="panel animate-rise p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
        <span className="ml-auto rounded-full bg-line/10 px-2 py-0.5 text-xs text-muted">{count}</span>
      </h2>
      {count === 0 ? <p className="py-3 text-sm text-muted">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </div>
  )
}
