import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewHabitInput, NewTaskInput, UpdateHabitInput, UpdateTaskInput } from '../../store/appContext'
import type { Habit, Task } from '../../types'
import { weekdaysToDb, habitFromRow, logsByUser, taskFromRow, type HabitLogRow, type HabitRow, type TaskRow } from './mappers'

const PAGE = 1000

/** Reads every row (PostgREST caps responses, so page through). */
async function selectAll<T>(client: SupabaseClient, table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select(columns).order(order, { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

export interface Snapshot {
  tasks: Task[]
  habits: Habit[]
}

/** Everything the signed-in member is allowed to see (RLS scopes it to their workspace). */
export async function fetchSnapshot(client: SupabaseClient, memberIds: string[]): Promise<Snapshot> {
  const [tasks, habits, logs] = await Promise.all([
    selectAll<TaskRow>(client, 'tasks', 'id, kind, title, notes, created_by, notify_second_user, task_date, planned_time, due_at, status, completed_at, completed_by, created_at', 'created_at'),
    selectAll<HabitRow>(client, 'habits', 'id, title, notes, created_by, is_shared, owner_id, schedule_days, paused, start_date, notify_second_user', 'created_at'),
    selectAll<HabitLogRow>(client, 'habit_logs', 'habit_id, user_id, day, status, done_at', 'day'),
  ])
  const byHabit = logsByUser(logs)
  return { tasks: tasks.map(taskFromRow), habits: habits.map((h) => habitFromRow(h, memberIds, byHabit.get(h.id))) }
}

type Fail = { message: string } | null
const fail = (e: { message: string } | null): Fail => e

export interface Ctx {
  client: SupabaseClient
  workspaceId: string
  userId: string
}

export async function insertTask(c: Ctx, id: string, i: NewTaskInput): Promise<Fail> {
  const { error } = await c.client.from('tasks').insert({
    id,
    workspace_id: c.workspaceId,
    kind: i.kind,
    title: i.title.trim(),
    notes: i.notes?.trim() || null,
    created_by: c.userId,
    notify_second_user: i.notifySecondUser,
    task_date: i.date,
    planned_time: i.kind === 'daily' && i.time ? i.time : null,
    due_at: i.kind === 'deadline' ? i.dueAt : null,
  })
  return fail(error)
}

export async function patchTask(c: Ctx, id: string, p: UpdateTaskInput, kind: Task['kind']): Promise<Fail> {
  const row: Record<string, unknown> = {}
  if (p.title !== undefined) row.title = p.title.trim()
  if (p.notes !== undefined) row.notes = p.notes.trim() || null
  if (p.notifySecondUser !== undefined) row.notify_second_user = p.notifySecondUser
  if (p.date !== undefined) row.task_date = p.date
  if (kind === 'daily' && p.time !== undefined) row.planned_time = p.time || null
  if (kind === 'deadline' && p.dueAt !== undefined) row.due_at = p.dueAt
  const { error } = await c.client.from('tasks').update(row).eq('id', id)
  return fail(error)
}

export async function setTaskCompleted(c: Ctx, id: string, completed: boolean): Promise<Fail> {
  const { error } = await c.client.from('tasks').update({ status: completed ? 'completed' : 'open' }).eq('id', id)
  return fail(error)
}

export async function removeTask(c: Ctx, id: string): Promise<Fail> {
  const { error } = await c.client.from('tasks').delete().eq('id', id)
  return fail(error)
}

export async function insertHabit(c: Ctx, id: string, i: NewHabitInput, startDate: string): Promise<Fail> {
  const { error } = await c.client.from('habits').insert({
    id,
    workspace_id: c.workspaceId,
    title: i.title.trim(),
    notes: i.notes?.trim() || null,
    created_by: c.userId,
    is_shared: i.shared,
    owner_id: i.shared ? null : c.userId,
    schedule_days: weekdaysToDb(i.schedule),
    start_date: startDate,
    notify_second_user: i.notifySecondUser,
  })
  return fail(error)
}

export async function patchHabit(c: Ctx, id: string, p: UpdateHabitInput): Promise<Fail> {
  const row: Record<string, unknown> = {}
  if (p.title !== undefined) row.title = p.title.trim()
  if (p.notes !== undefined) row.notes = p.notes.trim() || null
  if (p.notifySecondUser !== undefined) row.notify_second_user = p.notifySecondUser
  if (p.schedule !== undefined) row.schedule_days = weekdaysToDb(p.schedule)
  if (p.paused !== undefined) row.paused = p.paused
  const { error } = await c.client.from('habits').update(row).eq('id', id)
  return fail(error)
}

export async function removeHabit(c: Ctx, id: string): Promise<Fail> {
  const { error } = await c.client.from('habits').delete().eq('id', id)
  return fail(error)
}

/** Writes ONLY the current person's own log row. The partner's row is never touched. */
export async function writeMyHabitLog(c: Ctx, habitId: string, day: string, status: 'done' | 'missed' | null): Promise<Fail> {
  if (status === null) {
    const { error } = await c.client.from('habit_logs').delete().eq('habit_id', habitId).eq('user_id', c.userId).eq('day', day)
    return fail(error)
  }
  const { error } = await c.client
    .from('habit_logs')
    .upsert({ habit_id: habitId, user_id: c.userId, workspace_id: c.workspaceId, day, status }, { onConflict: 'habit_id,user_id,day' })
  return fail(error)
}
