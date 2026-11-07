import type { Habit, Task } from '../../types'

export interface State {
  tasks: Task[]
  habits: Habit[]
  pulse: number
}

export type Action =
  | { type: 'replace'; tasks: Task[]; habits: Habit[] }
  | { type: 'pulse' }
  | { type: 'task'; task: Task }
  | { type: 'taskPatch'; id: string; patch: Partial<Task> }
  | { type: 'taskRemove'; id: string }
  | { type: 'habit'; habit: Habit }
  | { type: 'habitPatch'; id: string; patch: Partial<Habit> }
  | { type: 'habitRemove'; id: string }
  | { type: 'log'; id: string; user: string; day: string; entry: { status: 'done' | 'missed'; at?: string } | null }

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'replace':
      return { ...s, tasks: a.tasks, habits: a.habits }
    case 'pulse':
      return { ...s, pulse: s.pulse + 1 }
    case 'task':
      return { ...s, tasks: s.tasks.some((t) => t.id === a.task.id) ? s.tasks : [...s.tasks, a.task] }
    case 'taskPatch':
      return { ...s, tasks: s.tasks.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) }
    case 'taskRemove':
      return { ...s, tasks: s.tasks.filter((t) => t.id !== a.id) }
    case 'habit':
      return { ...s, habits: s.habits.some((h) => h.id === a.habit.id) ? s.habits : [...s.habits, a.habit] }
    case 'habitPatch':
      return { ...s, habits: s.habits.map((h) => (h.id === a.id ? { ...h, ...a.patch } : h)) }
    case 'habitRemove':
      return { ...s, habits: s.habits.filter((h) => h.id !== a.id) }
    case 'log':
      return {
        ...s,
        habits: s.habits.map((h) => {
          if (h.id !== a.id) return h
          // Only this person's own record changes; the partner's record is left exactly as it was.
          const mine = { ...(h.log[a.user] ?? {}) }
          if (a.entry) mine[a.day] = a.entry
          else delete mine[a.day]
          return { ...h, log: { ...h.log, [a.user]: mine } }
        }),
      }
  }
}
