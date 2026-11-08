import type { NewHabitInput, NewTaskInput, UpdateHabitInput, UpdateTaskInput } from '../../store/appContext'
import type { Habit, Task } from '../../types'
import type { Action } from '../remote/state'

/**
 * A change made by the user, described as data so it can be stored while offline and replayed later.
 * Every op is idempotent on the server (client-generated ids, absolute target values), so replaying after an
 * ambiguous failure can never create a duplicate or flip a value.
 */
export type Op =
  | { type: 'task.insert'; id: string; input: NewTaskInput; createdBy: string; at: string }
  | { type: 'task.patch'; id: string; patch: UpdateTaskInput; kind: Task['kind'] }
  | { type: 'task.complete'; id: string; completed: boolean; by: string; at: string }
  | { type: 'task.delete'; id: string }
  | { type: 'habit.insert'; id: string; input: NewHabitInput; startDate: string; createdBy: string }
  | { type: 'habit.patch'; id: string; patch: UpdateHabitInput }
  | { type: 'habit.delete'; id: string }
  | { type: 'habit.log'; habitId: string; day: string; status: 'done' | 'missed' | null; by: string; at: string }

export interface QueuedOp {
  /** Unique per queued change (not an idempotency key; ops carry their own ids). */
  qid: string
  op: Op
}

const entityOf = (o: Op): string | null => {
  switch (o.type) {
    case 'task.insert':
    case 'task.patch':
    case 'task.complete':
    case 'task.delete':
      return `task:${o.id}`
    case 'habit.insert':
    case 'habit.patch':
    case 'habit.delete':
      return `habit:${o.id}`
    case 'habit.log':
      return `habit:${o.habitId}`
  }
}

/**
 * Adds an op and compacts: later state replaces earlier state for the same thing, so the queue stays small and
 * never replays a stale intermediate value.
 */
export function enqueue(queue: QueuedOp[], item: QueuedOp, inflight: string | null = null): QueuedOp[] {
  const { op } = item
  const key = entityOf(op)
  // Never edit the op that is being sent right now; later changes queue behind it.
  const q0 = inflight ? queue.filter((q) => q.qid !== inflight) : queue
  const sent = inflight ? queue.filter((q) => q.qid === inflight) : []
  if (sent.length && op.type !== 'task.delete' && op.type !== 'habit.delete') return [...sent, ...enqueue(q0, item, null)]
  switch (op.type) {
    case 'task.delete':
    case 'habit.delete': {
      // The op currently being sent can't be recalled, so it is kept and the delete follows it.
      const rest = queue.filter((q) => entityOf(q.op) !== key || q.qid === inflight)
      const wasCreatedOffline = queue.some((q) => q.qid !== inflight && entityOf(q.op) === key && (q.op.type === 'task.insert' || q.op.type === 'habit.insert'))
      if (queue.some((q) => q.qid === inflight && entityOf(q.op) === key)) return [...rest, item]
      return wasCreatedOffline ? rest : [...rest, item] // created and deleted offline: nothing ever reaches the server
    }
    case 'task.complete': {
      const i = queue.findIndex((q) => q.op.type === 'task.complete' && q.op.id === op.id)
      if (i >= 0) return queue.map((q, n) => (n === i ? item : q))
      return [...queue, item]
    }
    case 'habit.log': {
      const i = queue.findIndex((q) => q.op.type === 'habit.log' && q.op.habitId === op.habitId && q.op.day === op.day && q.op.by === op.by)
      if (i >= 0) return queue.map((q, n) => (n === i ? item : q))
      return [...queue, item]
    }
    case 'task.patch': {
      // Fold into a pending insert/patch for the same task.
      const i = queue.findIndex((q) => (q.op.type === 'task.insert' || q.op.type === 'task.patch') && q.op.id === op.id)
      if (i >= 0) {
        const prev = queue[i].op
        let merged: Op
        if (prev.type === 'task.insert') merged = { ...prev, input: { ...prev.input, ...op.patch } }
        else if (prev.type === 'task.patch') merged = { ...prev, patch: { ...prev.patch, ...op.patch } }
        else return [...queue, item]
        return queue.map((q, n) => (n === i ? { qid: item.qid, op: merged } : q))
      }
      return [...queue, item]
    }
    case 'habit.patch': {
      const i = queue.findIndex((q) => (q.op.type === 'habit.insert' || q.op.type === 'habit.patch') && q.op.id === op.id)
      if (i >= 0) {
        const prev = queue[i].op
        let merged: Op
        if (prev.type === 'habit.insert') {
          if (op.patch.paused !== undefined) return [...queue, item] // "paused" isn't part of creation; send it as its own change
          merged = { ...prev, input: { ...prev.input, ...op.patch } as NewHabitInput }
        } else if (prev.type === 'habit.patch') merged = { ...prev, patch: { ...prev.patch, ...op.patch } }
        else return [...queue, item]
        return queue.map((q, n) => (n === i ? { qid: item.qid, op: merged } : q))
      }
      return [...queue, item]
    }
    default:
      return [...queue, item]
  }
}

export interface OverlayCtx {
  memberIds: string[]
}

/** The optimistic reducer actions for an op (used for instant UI and to re-apply queued ops on top of server data). */
export function opActions(op: Op, ctx: OverlayCtx): Action[] {
  switch (op.type) {
    case 'task.insert':
      return [{ type: 'task', task: { id: op.id, kind: op.input.kind, title: op.input.title.trim(), notes: op.input.notes?.trim() || undefined, createdBy: op.createdBy, createdAt: op.at, notifySecondUser: op.input.notifySecondUser, date: op.input.date, time: op.input.time, dueAt: op.input.dueAt, status: 'open' } }]
    case 'task.patch':
      return [{ type: 'taskPatch', id: op.id, patch: { ...op.patch, notes: op.patch.notes === undefined ? undefined : op.patch.notes || undefined } as Partial<Task> }]
    case 'task.complete':
      return [{ type: 'taskPatch', id: op.id, patch: op.completed ? { status: 'completed', completedAt: op.at, completedBy: op.by } : { status: 'open', completedAt: undefined, completedBy: undefined } }]
    case 'task.delete':
      return [{ type: 'taskRemove', id: op.id }]
    case 'habit.insert':
      return [{ type: 'habit', habit: { id: op.id, title: op.input.title.trim(), notes: op.input.notes?.trim() || undefined, createdBy: op.createdBy, notifySecondUser: op.input.notifySecondUser, participants: op.input.shared ? ctx.memberIds : [op.createdBy], schedule: op.input.schedule, paused: false, startDate: op.startDate, log: {} } }]
    case 'habit.patch':
      return [{ type: 'habitPatch', id: op.id, patch: { ...op.patch, notes: op.patch.notes === undefined ? undefined : op.patch.notes || undefined } as Partial<Habit> }]
    case 'habit.delete':
      return [{ type: 'habitRemove', id: op.id }]
    case 'habit.log':
      return [{ type: 'log', id: op.habitId, user: op.by, day: op.day, entry: op.status ? { status: op.status, at: op.status === 'done' ? op.at : undefined } : null }]
  }
}

export const isStructuralHabitOp = (o: Op) => o.type === 'habit.insert'

// ---- persistence (localStorage, per signed-in user) -------------------------------------------------

const key = (uid: string) => `ourday:queue:${uid}`

export function loadQueue(uid: string): QueuedOp[] {
  try {
    const raw = localStorage.getItem(key(uid))
    const v = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(v) ? (v as QueuedOp[]).filter((q) => q && typeof q.qid === 'string' && q.op && typeof q.op.type === 'string') : []
  } catch {
    return []
  }
}

export function saveQueue(uid: string, q: QueuedOp[]): void {
  try {
    if (q.length === 0) localStorage.removeItem(key(uid))
    else localStorage.setItem(key(uid), JSON.stringify(q))
  } catch {
    /* storage full or unavailable: the in-memory queue still works for this session */
  }
}
