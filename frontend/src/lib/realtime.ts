import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncState = 'connecting' | 'live' | 'offline'

/** Coalesces bursts of events (e.g. several rows changing at once) into one callback. */
export function createDebouncer(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return {
    trigger() {
      clearTimeout(t)
      t = setTimeout(fn, ms)
    },
    cancel() {
      clearTimeout(t)
    },
  }
}

export interface TableWatch {
  table: string
  /** e.g. `workspace_id=eq.<id>` (not applicable to DELETE events). */
  filter?: string
}

/**
 * Subscribes to Postgres changes. Payloads are never trusted: every event, and every (re)connect,
 * simply triggers `onChange`, and the caller re-fetches the truth. DELETE events can't be filtered by
 * Realtime, so they are watched unfiltered (they carry only the primary key).
 * Returns an unsubscribe function.
 */
export function watchTables(
  client: SupabaseClient,
  channelName: string,
  tables: TableWatch[],
  onChange: () => void,
  onState: (s: SyncState) => void,
): () => void {
  let channel = client.channel(channelName)
  for (const t of tables) {
    channel = channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: t.table, filter: t.filter }, onChange)
    channel = channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t.table, filter: t.filter }, onChange)
    channel = channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t.table }, onChange)
  }
  onState('connecting')
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      onState('live')
      // Catch anything missed while disconnected.
      onChange()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onState('offline')
    }
  })
  return () => {
    void client.removeChannel(channel)
  }
}
