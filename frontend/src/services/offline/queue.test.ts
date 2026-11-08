import { describe, expect, it } from 'vitest'
import { reducer, type State } from '../remote/state'
import { enqueue, opActions, type Op, type QueuedOp } from './queue'

const task = { kind: 'daily' as const, title: 'Buy milk', date: '2026-11-08', notifySecondUser: false }
const q = (op: Op, qid: string): QueuedOp => ({ qid, op })
const add = (queue: QueuedOp[], op: Op, qid: string, inflight: string | null = null) => enqueue(queue, q(op, qid), inflight)

describe('offline queue compaction', () => {
  it('keeps only the last completion state per task', () => {
    let s: QueuedOp[] = []
    s = add(s, { type: 'task.complete', id: 't1', completed: true, by: 'u', at: 'a' }, '1')
    s = add(s, { type: 'task.complete', id: 't1', completed: false, by: 'u', at: 'b' }, '2')
    expect(s).toHaveLength(1)
    expect(s[0].op).toMatchObject({ completed: false })
  })

  it('keeps only the last log per habit/day/person', () => {
    let s: QueuedOp[] = []
    s = add(s, { type: 'habit.log', habitId: 'h', day: 'd', status: 'done', by: 'u', at: 'a' }, '1')
    s = add(s, { type: 'habit.log', habitId: 'h', day: 'd', status: 'missed', by: 'u', at: 'b' }, '2')
    s = add(s, { type: 'habit.log', habitId: 'h', day: 'e', status: 'done', by: 'u', at: 'c' }, '3')
    expect(s.map((x) => x.qid)).toEqual(['2', '3'])
  })

  it('folds edits into a task created offline, and a create+delete never reaches the server', () => {
    let s: QueuedOp[] = []
    s = add(s, { type: 'task.insert', id: 't1', input: task, createdBy: 'u', at: 'a' }, '1')
    s = add(s, { type: 'task.patch', id: 't1', patch: { title: 'Buy oat milk' }, kind: 'daily' }, '2')
    expect(s).toHaveLength(1)
    expect(s[0].op).toMatchObject({ type: 'task.insert', input: { title: 'Buy oat milk' } })
    s = add(s, { type: 'task.complete', id: 't1', completed: true, by: 'u', at: 'b' }, '3')
    s = add(s, { type: 'task.delete', id: 't1' }, '4')
    expect(s).toEqual([])
  })

  it('deleting a server task drops its pending edits but still sends the delete', () => {
    let s: QueuedOp[] = []
    s = add(s, { type: 'task.patch', id: 't9', patch: { title: 'x' }, kind: 'daily' }, '1')
    s = add(s, { type: 'task.delete', id: 't9' }, '2')
    expect(s.map((x) => x.op.type)).toEqual(['task.delete'])
  })

  it('never edits or drops the op that is already being sent', () => {
    let s: QueuedOp[] = []
    s = add(s, { type: 'task.insert', id: 't1', input: task, createdBy: 'u', at: 'a' }, '1')
    s = add(s, { type: 'task.patch', id: 't1', patch: { title: 'Changed' }, kind: 'daily' }, '2', '1')
    expect(s.map((x) => x.qid)).toEqual(['1', '2'])
    s = add(s, { type: 'task.delete', id: 't1' }, '3', '1')
    expect(s.map((x) => x.op.type)).toEqual(['task.insert', 'task.delete'])
  })
})

describe('re-applying queued ops on top of server data', () => {
  it('recreates an offline task, completion and habit log', () => {
    const ctx = { memberIds: ['u', 'p'] }
    let st: State = { tasks: [], habits: [], pulse: 0 }
    const ops: Op[] = [
      { type: 'task.insert', id: 't1', input: task, createdBy: 'u', at: '2026-11-08T10:00:00Z' },
      { type: 'task.complete', id: 't1', completed: true, by: 'u', at: '2026-11-08T11:00:00Z' },
      { type: 'habit.insert', id: 'h1', input: { title: 'Read', schedule: { type: 'daily' } as never, notifySecondUser: false, shared: true }, startDate: '2026-11-08', createdBy: 'u' },
      { type: 'habit.log', habitId: 'h1', day: '2026-11-08', status: 'done', by: 'u', at: '2026-11-08T12:00:00Z' },
    ]
    for (const o of ops) for (const a of opActions(o, ctx)) st = reducer(st, a)
    expect(st.tasks[0]).toMatchObject({ id: 't1', status: 'completed', completedBy: 'u' })
    expect(st.habits[0].participants).toEqual(['u', 'p'])
    expect(st.habits[0].log.u['2026-11-08'].status).toBe('done')
    expect(st.habits[0].log.p).toBeUndefined() // the partner's record is never touched
  })
})
