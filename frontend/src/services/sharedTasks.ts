import type { SharedState, Task, UserId } from '../types'

/** Pure rules for Shared Tasks (what to show, which actions each person may take). The database enforces the same rules. */

export const REMINDER_MAX = 200

export const isShared = (t: Task): boolean => t.kind === 'shared'
export const stateOf = (t: Task): SharedState => t.sharedState ?? (t.status === 'completed' ? 'completed' : 'active')

/**
 * Every shared task in the workspace, newest activity first within state. It deliberately ignores the My/Partner
 * viewing mode: shared tasks belong to both people, so switching mode never hides them.
 */
export function sharedTasks(tasks: Task[]): Task[] {
  return tasks.filter(isShared).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export type SharedFilter = 'all' | 'active' | 'awaiting_approval' | 'completed'
export const FILTERS: { value: SharedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'completed', label: 'Completed' },
]

export function filterShared(tasks: Task[], f: SharedFilter): Task[] {
  return f === 'all' ? tasks : tasks.filter((t) => stateOf(t) === f)
}

export const STATE_LABEL: Record<SharedState, string> = { active: 'Active', awaiting_approval: 'Awaiting approval', completed: 'Completed' }

export function countByState(tasks: Task[]): Record<SharedFilter, number> {
  return {
    all: tasks.length,
    active: tasks.filter((t) => stateOf(t) === 'active').length,
    awaiting_approval: tasks.filter((t) => stateOf(t) === 'awaiting_approval').length,
    completed: tasks.filter((t) => stateOf(t) === 'completed').length,
  }
}

export interface SharedActions {
  /** Ask the other person to confirm it's done. */
  requestCompletion: boolean
  /** Approve / reject: only the person who did NOT make the request. */
  review: boolean
  /** The requester is waiting for the other person. */
  waiting: boolean
  remind: boolean
  reopen: boolean
}

/** Which buttons a person gets. Mirrors the database rules; the server is the real gatekeeper. */
export function actionsFor(t: Task, me: UserId, hasPartner: boolean): SharedActions {
  const s = stateOf(t)
  const isRequester = t.completionRequestedBy === me
  return {
    requestCompletion: s === 'active',
    review: s === 'awaiting_approval' && !isRequester,
    waiting: s === 'awaiting_approval' && isRequester,
    remind: s !== 'completed' && hasPartner,
    reopen: s === 'completed',
  }
}

/** Client-side check before sending (the database repeats it). Returns an error message or the cleaned text. */
export function cleanReminder(raw: string): { error: string } | { text: string } {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { error: 'Write a message first.' }
  if (text.length > REMINDER_MAX) return { error: `Keep the reminder under ${REMINDER_MAX} characters.` }
  return { text }
}
