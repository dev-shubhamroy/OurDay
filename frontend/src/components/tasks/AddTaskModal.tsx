import { useState, type FormEvent } from 'react'
import { BellRing, CalendarCheck, Flag, Repeat } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { atTime } from '../../services/dates'
import { dayName } from '../../services/habits'
import type { TaskType } from '../../types'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Field, Segmented, Switch, fieldCls } from '../ui/Controls'
import { Modal } from '../ui/Modal'

const TYPES: { value: TaskType; label: string; icon: React.ReactNode }[] = [
  { value: 'daily', label: 'Daily Task', icon: <CalendarCheck className="h-4 w-4" /> },
  { value: 'deadline', label: 'Deadline', icon: <Flag className="h-4 w-4" /> },
  { value: 'habit', label: 'Habit', icon: <Repeat className="h-4 w-4" /> },
]
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function AddTaskModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg: string) => void }) {
  // Remount the form each time the dialog opens so it always starts fresh.
  return (
    <Modal open={open} onClose={onClose} title="Add Task">
      <AddTaskForm onClose={onClose} onAdded={onAdded} />
    </Modal>
  )
}

function AddTaskForm({ onClose, onAdded }: { onClose: () => void; onAdded: (msg: string) => void }) {
  const { today, now, addTask, addHabit, partner } = useApp()
  const [type, setType] = useState<TaskType>('daily')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [dueTime, setDueTime] = useState('18:00')
  const [recurrence, setRecurrence] = useState<'daily' | 'weekdays'>('daily')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [notes, setNotes] = useState('')
  const [notify, setNotify] = useState(false)
  const [error, setError] = useState<{ field: string; msg: string } | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = title.trim()
    if (!name) return setError({ field: 'title', msg: type === 'habit' ? 'Give your habit a name.' : 'Give your task a title.' })
    const common = { title: name, notes: notes.trim() || undefined, notifySecondUser: notify }

    if (type === 'habit') {
      if (recurrence === 'weekdays' && days.length === 0) return setError({ field: 'days', msg: 'Pick at least one day.' })
      addHabit({ ...common, schedule: recurrence === 'daily' ? { type: 'daily' } : { type: 'weekdays', days: [...days].sort() } })
      onAdded(`Habit “${name}” added`)
    } else if (type === 'deadline') {
      if (!date || !dueTime) return setError({ field: 'date', msg: 'Choose a deadline date and time.' })
      const due = atTime(date, dueTime)
      if (due.getTime() <= now.getTime()) return setError({ field: 'date', msg: 'The deadline must be in the future.' })
      addTask({ ...common, kind: 'deadline', date, dueAt: due.toISOString() })
      onAdded(`Deadline “${name}” added`)
    } else {
      if (!date) return setError({ field: 'date', msg: 'Choose a planned date.' })
      addTask({ ...common, kind: 'daily', date, time: time || undefined })
      onAdded(`Task “${name}” added`)
    }
    onClose()
  }

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Segmented label="Task type" value={type} options={TYPES} onChange={(v) => { setType(v); setError(null) }} />

      <Field label={type === 'habit' ? 'Habit name' : 'Task title'} htmlFor="at-title" error={error?.field === 'title' ? error.msg : undefined}>
        <input id="at-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'habit' ? 'e.g. Evening walk' : type === 'deadline' ? 'e.g. Submit visa documents' : 'e.g. Revise chapter 4'} className={fieldCls} maxLength={120} />
      </Field>

      {type === 'deadline' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deadline date" htmlFor="at-date" error={error?.field === 'date' ? error.msg : undefined} className="col-span-2 sm:col-span-1">
            <input id="at-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
          </Field>
          <Field label="Deadline time" htmlFor="at-dtime" className="col-span-2 sm:col-span-1">
            <input id="at-dtime" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={fieldCls} />
          </Field>
        </div>
      )}

      {type === 'daily' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Planned date" htmlFor="at-pdate" error={error?.field === 'date' ? error.msg : undefined} className="col-span-2 sm:col-span-1">
            <input id="at-pdate" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
          </Field>
          <Field label="Time (optional)" htmlFor="at-time" className="col-span-2 sm:col-span-1">
            <input id="at-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldCls} />
          </Field>
        </div>
      )}

      {type === 'habit' && (
        <div className="space-y-3">
          <Field label="Repeats">
            <Segmented
              label="Recurrence"
              value={recurrence}
              onChange={setRecurrence}
              options={[
                { value: 'daily', label: 'Every day' },
                { value: 'weekdays', label: 'Selected days' },
              ]}
            />
          </Field>
          {recurrence === 'weekdays' && (
            <Field label="Days" error={error?.field === 'days' ? error.msg : undefined}>
              <div className="flex gap-1.5">
                {WEEK_ORDER.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    onClick={() => toggleDay(d)}
                    className={cn('h-10 flex-1 rounded-xl border text-xs font-semibold transition', days.includes(d) ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line/15 text-muted hover:text-fg')}
                  >
                    {dayName(d)}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      <Field label="Notes (optional)" htmlFor="at-notes">
        <textarea id="at-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering" className={cn(fieldCls, 'h-auto resize-none py-2.5')} maxLength={300} />
      </Field>

      <div className="flex items-center gap-3 rounded-2xl border border-line/10 bg-card/60 p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <BellRing className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notify {partner.name}</p>
          <p className="text-xs leading-snug text-muted">{notify ? 'Both of you get notifications.' : 'Only you get notifications.'} Both of you can always see and edit it.</p>
        </div>
        <Switch checked={notify} onChange={setNotify} label={`Notify ${partner.name}`} />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-[2]">
          {type === 'habit' ? 'Add habit' : type === 'deadline' ? 'Add deadline' : 'Add task'}
        </Button>
      </div>
    </form>
  )
}
