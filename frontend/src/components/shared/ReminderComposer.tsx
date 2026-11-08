import { useRef, useState, type FormEvent } from 'react'
import { Send, X } from 'lucide-react'
import { useApp } from '../../hooks/useApp'
import { cleanReminder, REMINDER_MAX } from '../../services/sharedTasks'
import { Button } from '../ui/Button'
import { fieldCls } from '../ui/Controls'

/** Compact one-way reminder: a single line of text and a send button. Not a chat. */
export function ReminderComposer({ taskId, name, onClose, onSent }: { taskId: string; name: string; onClose: () => void; onSent: (note: string) => void }) {
  const { remindPartner } = useApp()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false) // a double tap can never submit twice

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (sending.current) return
    const c = cleanReminder(text)
    if ('error' in c) return setError(c.error)
    sending.current = true
    setBusy(true)
    setError(null)
    const r = await remindPartner(taskId, c.text)
    sending.current = false
    setBusy(false)
    if (typeof r === 'string') return setError(r)
    onSent(r.delivered ? `Reminder sent to ${name}` : `Sent, but ${name} has partner notifications turned off`)
    onClose()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2 rounded-tile border border-line/10 bg-bg/40 p-3" aria-label={`Remind ${name}`}>
      <label htmlFor={`rm-${taskId}`} className="sr-only">Message to {name}</label>
      <input
        id={`rm-${taskId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={REMINDER_MAX}
        placeholder={`Hey ${name}, let’s finish this today!`}
        autoFocus
        className={fieldCls}
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">Only {name} sees this, for 24 hours.</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose} icon={<X className="h-4 w-4" />}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy || !text.trim()} icon={<Send className="h-4 w-4" />}>{busy ? 'Sending…' : 'Send Reminder'}</Button>
        </div>
      </div>
    </form>
  )
}
