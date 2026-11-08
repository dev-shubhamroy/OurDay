import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useQuotes } from '../../hooks/useQuotes'
import { AUTHOR_MAX, QUOTE_MAX, type Quote } from '../../services/quotes'
import { Button } from '../ui/Button'
import { fieldCls } from '../ui/Controls'
import { IconButton } from '../ui/IconButton'

/** Settings → Inspiration Library: add, edit and delete the quotes RANA brings into briefings. */
export function InspirationLibrary() {
  const { quotes, loading, available, error, add, edit, remove } = useQuotes()
  const [editing, setEditing] = useState<Quote | null>(null)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const reset = () => {
    setEditing(null)
    setText('')
    setAuthor('')
    setFormError(null)
  }
  const startEdit = (q: Quote) => {
    setEditing(q)
    setText(q.text)
    setAuthor(q.author ?? '')
    setFormError(null)
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const err = editing ? await edit(editing.id, text, author) : await add(text, author)
    setBusy(false)
    if (err) setFormError(err)
    else reset()
  }

  if (!available) return <p className="text-sm text-muted">The Inspiration Library isn’t available yet. It will appear once the latest database update is applied.</p>

  return (
    <div>
      <p className="mb-4 text-sm text-muted">Save the words that keep you moving forward. RANA will bring one of them into every briefing.</p>

      <form onSubmit={(e) => void submit(e)} className="space-y-3" aria-label={editing ? 'Edit quote' : 'Add a quote'}>
        <div>
          <label htmlFor="quote-text" className="mb-1.5 block text-sm font-medium">Quote</label>
          <textarea
            id="quote-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={QUOTE_MAX}
            rows={3}
            required
            placeholder="Write something worth remembering"
            className={`${fieldCls} h-auto resize-y py-2.5`}
          />
        </div>
        <div>
          <label htmlFor="quote-author" className="mb-1.5 block text-sm font-medium">Author <span className="font-normal text-muted">(optional)</span></label>
          <input id="quote-author" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={AUTHOR_MAX} placeholder="Who said it?" className={fieldCls} />
        </div>
        {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !text.trim()} icon={editing ? undefined : <Plus className="h-4 w-4" />}>
            {editing ? 'Save changes' : 'Save'}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={reset} icon={<X className="h-4 w-4" />}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted" aria-live="polite">
        {loading ? 'Loading…' : `${quotes.length} ${quotes.length === 1 ? 'quote' : 'quotes'} saved`}
      </p>
      {error && <p role="status" className="mb-2 text-xs text-warn">{error}</p>}
      {quotes.length === 0 && !loading ? (
        <p className="rounded-tile border border-dashed border-line/20 p-4 text-sm text-muted">No quotes yet. RANA only shows words you save here.</p>
      ) : (
        <ul className="divide-y divide-line/10 rounded-tile border border-line/10">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-[15px] leading-snug">“{q.text}”</p>
                {q.author && <p className="mt-1 text-xs text-muted">— {q.author}</p>}
              </div>
              {confirmId === q.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setConfirmId(null)
                      if (editing?.id === q.id) reset()
                      const err = await remove(q.id)
                      if (err) setFormError(err)
                    }}
                    className="!bg-danger !from-danger !to-danger !text-on-fill !shadow-none"
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0">
                  <IconButton label={`Edit quote: ${q.text.slice(0, 30)}`} onClick={() => startEdit(q)} className="border-transparent">
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={`Delete quote: ${q.text.slice(0, 30)}`} onClick={() => setConfirmId(q.id)} className="border-transparent">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
