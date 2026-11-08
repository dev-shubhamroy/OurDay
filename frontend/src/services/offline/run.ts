import { insertHabit, insertTask, patchHabit, patchTask, removeHabit, removeTask, setTaskCompleted, writeMyHabitLog, type Ctx } from '../remote/data'
import type { Op } from './queue'

type Fail = { message: string; code?: string } | null

/** Sends one op to Supabase. Replaying an already-applied op is a success, never a duplicate. */
export async function runOp(ctx: Ctx, op: Op): Promise<Fail> {
  switch (op.type) {
    case 'task.insert': {
      const e = (await insertTask(ctx, op.id, op.input)) as Fail
      return e?.code === '23505' ? null : e // same id already stored: an earlier attempt succeeded
    }
    case 'task.patch':
      return patchTask(ctx, op.id, op.patch, op.kind)
    case 'task.complete':
      return setTaskCompleted(ctx, op.id, op.completed)
    case 'task.delete':
      return removeTask(ctx, op.id)
    case 'habit.insert': {
      const e = (await insertHabit(ctx, op.id, op.input, op.startDate)) as Fail
      return e?.code === '23505' ? null : e
    }
    case 'habit.patch':
      return patchHabit(ctx, op.id, op.patch)
    case 'habit.delete':
      return removeHabit(ctx, op.id)
    case 'habit.log':
      return writeMyHabitLog(ctx, op.habitId, op.day, op.status)
  }
}
