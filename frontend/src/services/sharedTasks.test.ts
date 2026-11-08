import { describe, expect, it } from 'vitest'
import { A, B, daily, deadline } from '../test/fixtures'
import { taskFromRow, type TaskRow } from './remote/mappers'
import { sharedErrorMessage } from './remote/shared'
import { targetFor } from './remote/notifications'
import { enqueue, opActions } from './offline/queue'
import { reducer, type State } from './remote/state'
import { actionsFor, cleanReminder, countByState, filterShared, sharedTasks, stateOf } from './sharedTasks'
import { tasksOwnedBy } from './selectors'
import type { Task } from '../types'

const shared = (id: string, over: Partial<Task> = {}): Task => ({ id, kind: 'shared', title: `Shared ${id}`, createdBy: A, createdAt: `2026-11-0${id.length}T00:00:00Z`, notifySecondUser: true, date: '2026-11-09', status: 'open', sharedState: 'active', ...over })
const row = (over: Partial<TaskRow> = {}): TaskRow => ({ id: 's1', kind: 'shared', title: 'Plan trip', notes: null, created_by: A, notify_second_user: true, task_date: '2026-11-09', planned_time: null, due_at: null, status: 'open', completed_at: null, completed_by: null, created_at: '2026-11-09T08:00:00Z', shared_state: 'active', ...over })

describe('shared task mapping', () => {
  it('a shared task without a deadline is valid and keeps its creator and creation time', () => {
    const t = taskFromRow(row())
    expect(t.kind).toBe('shared')
    expect(t.dueAt).toBeUndefined()
    expect(t.createdBy).toBe(A)
    expect(t.createdAt).toBe('2026-11-09T08:00:00Z')
    expect(stateOf(t)).toBe('active')
  })
  it('a deadline is carried when present', () => {
    expect(taskFromRow(row({ due_at: '2026-11-10T10:00:00Z' })).dueAt).toBe('2026-11-10T10:00:00Z')
  })
  it('maps the approval workflow columns', () => {
    const t = taskFromRow(row({ shared_state: 'awaiting_approval', completion_requested_by: A, completion_requested_at: '2026-11-09T09:00:00Z' }))
    expect(stateOf(t)).toBe('awaiting_approval')
    expect(t.completionRequestedBy).toBe(A)
    const done = taskFromRow(row({ shared_state: 'completed', status: 'completed', completed_at: 'x', completed_by: A, approved_by: B, approved_at: 'y' }))
    expect([done.approvedBy, done.completedBy, stateOf(done)]).toEqual([B, A, 'completed'])
    expect(taskFromRow(row({ rejected_by: B, rejected_at: 'z' })).rejectedBy).toBe(B)
  })
  it('personal tasks carry no shared fields', () => {
    expect(taskFromRow(row({ kind: 'daily', shared_state: null })).sharedState).toBeUndefined()
  })
})

describe('visibility and filters', () => {
  const tasks = [shared('s1'), shared('s22', { sharedState: 'awaiting_approval', completionRequestedBy: A }), shared('s333', { sharedState: 'completed', status: 'completed' }), daily('d1', 'Mine', 0), deadline('p1', 'Partner deadline', 2, '10:00', { createdBy: B })]
  it('lists only shared tasks, newest first', () => {
    expect(sharedTasks(tasks).map((t) => t.id)).toEqual(['s333', 's22', 's1'])
  })
  it('shared tasks stay visible in My Mode AND Partner Mode (personal tasks are filtered, shared are not)', () => {
    const asMe = tasksOwnedBy(tasks, A)
    const asPartner = tasksOwnedBy(tasks, B)
    expect(asMe.some((t) => t.id === 'p1')).toBe(false)
    expect(asPartner.some((t) => t.id === 'd1')).toBe(false)
    expect(sharedTasks(tasks)).toHaveLength(3) // independent of either mode
  })
  it('the Shared filter splits by state', () => {
    const s = sharedTasks(tasks)
    expect(filterShared(s, 'active').map((t) => t.id)).toEqual(['s1'])
    expect(filterShared(s, 'awaiting_approval').map((t) => t.id)).toEqual(['s22'])
    expect(filterShared(s, 'completed').map((t) => t.id)).toEqual(['s333'])
    expect(filterShared(s, 'all')).toHaveLength(3)
    expect(countByState(s)).toEqual({ all: 3, active: 1, awaiting_approval: 1, completed: 1 })
  })
})

describe('who can do what', () => {
  it('active: either person can request completion or remind; nobody can approve', () => {
    const t = shared('s1')
    for (const me of [A, B]) expect(actionsFor(t, me, true)).toEqual({ requestCompletion: true, review: false, waiting: false, remind: true, reopen: false })
  })
  it('awaiting approval: the requester waits, only the OTHER person can approve or reject', () => {
    const t = shared('s1', { sharedState: 'awaiting_approval', completionRequestedBy: A })
    expect(actionsFor(t, A, true)).toMatchObject({ review: false, waiting: true, requestCompletion: false, remind: true })
    expect(actionsFor(t, B, true)).toMatchObject({ review: true, waiting: false, requestCompletion: false, remind: true })
  })
  it('completed: no reminders, no new request, an explicit reopen is offered', () => {
    expect(actionsFor(shared('s1', { sharedState: 'completed', status: 'completed' }), A, true)).toEqual({ requestCompletion: false, review: false, waiting: false, remind: false, reopen: true })
  })
  it('without a partner nobody can be reminded', () => {
    expect(actionsFor(shared('s1'), A, false).remind).toBe(false)
  })
})

describe('reminder message', () => {
  it('rejects empty or blank text and trims/collapses whitespace', () => {
    expect(cleanReminder('   ')).toEqual({ error: 'Write a message first.' })
    expect(cleanReminder('  Hey,   let’s finish this today! ')).toEqual({ text: 'Hey, let’s finish this today!' })
    expect('error' in cleanReminder('x'.repeat(201))).toBe(true)
  })
})

describe('error messages from the database', () => {
  it('explains each rule in plain words', () => {
    expect(sharedErrorMessage({ message: 'cannot_review_own_request' })).toMatch(/partner has to review/)
    expect(sharedErrorMessage({ message: 'already_pending' })).toMatch(/already waiting/)
    expect(sharedErrorMessage({ message: 'task_completed' })).toMatch(/already completed/)
    expect(sharedErrorMessage({ message: 'cooldown', details: '181' })).toMatch(/4 minutes/)
    expect(sharedErrorMessage({ message: 'cooldown', details: '30' })).toMatch(/1 minute\./)
  })
  it('handles being offline and unknown failures gracefully', () => {
    expect(sharedErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/offline/i)
    expect(sharedErrorMessage({ message: 'something odd' })).toBe('That didn’t go through. Please try again.')
    expect(sharedErrorMessage(null)).toBe('That didn’t go through. Please try again.')
  })
})

describe('notifications open the shared task', () => {
  it('routes shared-task notifications to /shared?task=…', () => {
    expect(targetFor({ kind: 'partner', habit_id: null, task_id: 't9', subtype: 'reminder' })).toBe('/shared?task=t9')
    expect(targetFor({ kind: 'partner', habit_id: null, task_id: null, subtype: 'completion_request' })).toBe('/shared')
    expect(targetFor({ kind: 'partner', habit_id: null, task_id: 't9', subtype: null })).toBe('/home')
  })
})

describe('offline queue + shared tasks', () => {
  it('a shared task created offline appears immediately as active, with its optional deadline, and edits fold into the create', () => {
    const input = { kind: 'shared' as const, title: 'Trip', date: '2026-11-09', notifySecondUser: true }
    const op = { type: 'task.insert' as const, id: 's1', input, createdBy: A, at: '2026-11-09T08:00:00Z' }
    let st: State = { tasks: [], habits: [], pulse: 0 }
    for (const a of opActions(op, { memberIds: [A, B] })) st = reducer(st, a)
    expect(st.tasks[0]).toMatchObject({ kind: 'shared', sharedState: 'active', status: 'open', notifySecondUser: true })
    const q = enqueue(enqueue([], { qid: '1', op }), { qid: '2', op: { type: 'task.patch', id: 's1', patch: { title: 'Trip!' }, kind: 'shared' } })
    expect(q).toHaveLength(1)
  })
})
