import type { Habit, Task } from '../../types'
import type { WorkspaceMember } from '../../store/workspaceContext'

/** Last server-confirmed data, kept so the app opens and can be read with no connection. One entry per signed-in user. */
export interface DataCache {
  tasks: Task[]
  habits: Habit[]
  at: string
}
export interface WorkspaceCache {
  workspace: { id: string; name: string }
  members: WorkspaceMember[]
}

const VERSION = 1
const dataKey = (uid: string) => `ourday:cache:v${VERSION}:data:${uid}`
const wsKey = (uid: string) => `ourday:cache:v${VERSION}:ws:${uid}`

function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* quota or storage disabled: offline cache is best effort */
  }
}

export const loadDataCache = (uid: string): DataCache | null => {
  const c = read<DataCache>(dataKey(uid))
  return c && Array.isArray(c.tasks) && Array.isArray(c.habits) ? c : null
}
export const saveDataCache = (uid: string, tasks: Task[], habits: Habit[]) => write(dataKey(uid), { tasks, habits, at: new Date().toISOString() } satisfies DataCache)
export const loadWorkspaceCache = (uid: string): WorkspaceCache | null => {
  const c = read<WorkspaceCache>(wsKey(uid))
  return c?.workspace?.id && Array.isArray(c.members) ? c : null
}
export const saveWorkspaceCache = (uid: string, c: WorkspaceCache) => write(wsKey(uid), c)

/** Removes everything cached for this person (called on sign-out so a shared phone never keeps someone's data). */
export function clearUserCache(uid: string): void {
  try {
    localStorage.removeItem(dataKey(uid))
    localStorage.removeItem(wsKey(uid))
    localStorage.removeItem(`ourday:queue:${uid}`)
  } catch {
    /* ignore */
  }
}
