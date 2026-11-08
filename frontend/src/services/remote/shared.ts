import type { SupabaseClient } from '@supabase/supabase-js'

/** Error codes raised by the shared-task functions in the database (short, stable, never user text). */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  not_found: 'That task isn’t available any more.',
  not_shared_task: 'That isn’t a shared task.',
  task_completed: 'That task is already completed.',
  already_pending: 'A completion request is already waiting for approval.',
  no_pending_request: 'There’s no completion request to review. It may already have been handled.',
  cannot_review_own_request: 'Your partner has to review your request.',
  not_completed: 'That task isn’t completed.',
  empty_message: 'Write a message first.',
  message_too_long: 'Keep the reminder under 200 characters.',
  no_partner: 'Your partner hasn’t joined yet.',
  cooldown: 'You just sent a reminder for this task. Try again in a few minutes.',
  daily_limit: 'That’s a lot of reminders for today. Try again tomorrow.',
}

interface ErrLike {
  message?: string
  details?: string | null
  code?: string
}

export const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i

/** Turns a database/network error into something kind and actionable. */
export function sharedErrorMessage(e: ErrLike | null | undefined): string {
  const msg = (e?.message ?? '').trim()
  if (MESSAGES[msg]) {
    if (msg === 'cooldown' && e?.details && /^\d+$/.test(e.details)) {
      const mins = Math.max(1, Math.ceil(Number(e.details) / 60))
      return `You just sent a reminder for this task. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
    }
    return MESSAGES[msg]
  }
  if (NETWORK.test(msg)) return 'You’re offline. Shared approvals and reminders need a connection. Try again when you’re back online.'
  if (e?.code === 'PGRST202' || /could not find the function/i.test(msg)) return 'Shared tasks aren’t available yet. Please try again shortly.'
  return 'That didn’t go through. Please try again.'
}

type State = 'active' | 'awaiting_approval' | 'completed'
export const requestCompletionRpc = (c: SupabaseClient, taskId: string) => c.rpc('request_shared_completion', { p_task: taskId })
export const reviewCompletionRpc = (c: SupabaseClient, taskId: string, approve: boolean) => c.rpc('review_shared_completion', { p_task: taskId, p_approve: approve })
export const reopenSharedRpc = (c: SupabaseClient, taskId: string) => c.rpc('reopen_shared_task', { p_task: taskId })
export const sendReminderRpc = (c: SupabaseClient, taskId: string, message: string) => c.rpc('send_task_reminder', { p_task: taskId, p_message: message })
export type { State as SharedStateName }
