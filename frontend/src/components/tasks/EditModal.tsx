import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useApp } from '../../hooks/useApp'
import { atTime, toKey } from '../../services/dates'
import { canManageHabit } from '../../services/habits'
import { dayName } from '../../services/habits'
import type { Habit, Task } from '../../types'
import type { EditTarget } from '../../store/uiContext'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Field, Segmented, Switch, fieldCls } from '../ui/Controls'
import { Modal } from '../ui/Modal'
import { TimePicker } from '../ui/TimePicker'

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function DeleteRow({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return confirm ? (
    <div className="flex items-center gap-2 rounded-tile border border-danger/30 bg-danger/10 p-3">
      <p className="min-w-0 flex-1 text-sm text-danger">Delete this {label} for both of you? This can’t be undone.</p>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        Keep
      </Button>
      <Button type="button" size="sm" className="!bg-danger !from-danger !to-danger !text-white !shadow-none" onClick={onDelete}>
        Delete
      </Button>
    </div>
  ) : (
    <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)} className="text-danger hover:!text-danger">
      Delete {label}
    </Button>
  )
}

function EditTaskForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const { updateTask, deleteTask, partner, today, toggleTask } = useApp()
  const dueLocal = task.dueAt ? new Date(task.dueAt) : null
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [date, setDate] = useState(dueLocal ? toKey(dueLocal) : task.date)
  const [time, setTime] = useState(dueLocal ? `${String(dueLocal.getHours()).padStart(2, '0')}:${String(dueLocal.getMinutes()).padStart(2, '0')}` : (task.time ?? ''))
  const [notify, setNotify] = useState(task.notifySecondUser)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Give your task a title.')
    if (!date) return setError('Choose a date.')
    if (task.kind === 'deadline') {
      if (!time) return setError('Choose a deadline time.')
      updateTask(task.id, { title, notes, date, dueAt: atTime(date, time).toISOString(), notifySecondUser: notify })
    } else {
      updateTask(task.id, { title, notes, date, time, notifySecondUser: notify })
    }
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate>
      <Field label="Title" htmlFor="et-title" error={error ?? undefined}>
        <input id="et-title" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} maxLength={200} />
      </Field>
      <Field label={task.kind === 'deadline' ? 'Deadline date' : 'Planned date'} htmlFor="et-date">
        <input id="et-date" type="date" value={date} min={task.status === 'open' ? today : undefined} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
      </Field>
      <Field label={task.kind === 'deadline' ? 'Deadline time' : 'Time (optional)'} htmlFor="et-time">
        <TimePicker id="et-time" label="Time" value={time} onChange={setTime} clearable={task.kind === 'daily'} />
      </Field>
      <Field label="Notes (optional)" htmlFor="et-notes">
        <textarea id="et-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(fieldCls, 'h-auto min-h-[3.25rem] resize-none py-2.5')} maxLength={1000} />
      </Field>
      <div className="flex items-center gap-3 rounded-tile border border-line/10 bg-card/60 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notify {partner.name}</p>
          <p className="text-xs text-muted">Controls notifications only. Both of you can always see and edit it.</p>
        </div>
        <Switch checked={notify} onChange={setNotify} label={`Notify ${partner.name}`} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <DeleteRow
          label="task"
          onDelete={() => {
            deleteTask(task.id)
            onClose()
          }}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </div>
      {task.status === 'completed' && (
        <button type="button" onClick={() => { toggleTask(task.id); onClose() }} className="text-xs font-semibold text-accent hover:underline">
          Mark as not done
        </button>
      )}
    </form>
  )
}

function EditHabitForm({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { updateHabit, deleteHabit, partner } = useApp()
  const [title, setTitle] = useState(habit.title)
  const [notes, setNotes] = useState(habit.notes ?? '')
  const [recurrence, setRecurrence] = useState<'daily' | 'weekdays'>(habit.schedule.type)
  const [days, setDays] = useState<number[]>(habit.schedule.type === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5])
  const [notify, setNotify] = useState(habit.notifySecondUser)
  const [error, setError] = useState<string | null>(null)
  const shared = habit.participants.length > 1

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Give your habit a name.')
    if (recurrence === 'weekdays' && days.length === 0) return setError('Pick at least one day.')
    updateHabit(habit.id, { title, notes, schedule: recurrence === 'daily' ? { type: 'daily' } : { type: 'weekdays', days: [...days].sort() }, ...(shared ? {} : { notifySecondUser: notify }) })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate>
      <Field label="Habit name" htmlFor="eh-title" error={error ?? undefined}>
        <input id="eh-title" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} maxLength={120} />
      </Field>
      <Field label="Repeats" hint="Editing the schedule never rewrites past history.">
        <Segmented label="Recurrence" value={recurrence} onChange={setRecurrence} options={[{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Selected days' }]} />
      </Field>
      {recurrence === 'weekdays' && (
        <div className="flex gap-1.5">
          {WEEK_ORDER.map((d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))} className={cn('h-11 flex-1 rounded-ctl border text-xs font-semibold transition', days.includes(d) ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line/15 text-muted hover:text-fg')}>
              {dayName(d)}
            </button>
          ))}
        </div>
      )}
      <Field label="Notes (optional)" htmlFor="eh-notes">
        <textarea id="eh-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(fieldCls, 'h-auto min-h-[3.25rem] resize-none py-2.5')} maxLength={1000} />
      </Field>
      {!shared && (
        <div className="flex items-center gap-3 rounded-tile border border-line/10 bg-card/60 p-3">
          <p className="min-w-0 flex-1 text-sm font-semibold">Notify {partner.name}</p>
          <Switch checked={notify} onChange={setNotify} label={`Notify ${partner.name}`} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <DeleteRow
          label="habit"
          onDelete={() => {
            deleteHabit(habit.id)
            onClose()
          }}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </div>
    </form>
  )
}

/** Edit or delete a task or habit. Both people have full access to each other's items. */
export function EditModal({ target, onClose }: { target: EditTarget | null; onClose: () => void }) {
  const { tasks, habits } = useApp()
  const task = target?.type === 'task' ? tasks.find((t) => t.id === target.id) : undefined
  const { me } = useApp()
  // A partner's personal habit is read-only, so its editor never opens.
  const habit = target?.type === 'habit' ? habits.find((h) => h.id === target.id && canManageHabit(h, me.id)) : undefined
  const open = !!(task || habit)
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'Edit habit'}>
      {task ? <EditTaskForm key={task.id} task={task} onClose={onClose} /> : habit ? <EditHabitForm key={habit.id} habit={habit} onClose={onClose} /> : null}
    </Modal>
  )
}

