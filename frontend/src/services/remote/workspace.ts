import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkspaceMember } from '../../store/workspaceContext'

export interface LoadedWorkspace {
  workspace: { id: string; name: string }
  members: WorkspaceMember[]
}

/** Loads the signed-in user's workspace through RLS (only their own workspace is visible). Null = none yet. */
export async function loadWorkspace(client: SupabaseClient): Promise<LoadedWorkspace | null> {
  const { data: rows, error } = await client.from('workspace_members').select('workspace_id, user_id, role, joined_at')
  if (error) throw error
  if (!rows || rows.length === 0) return null

  const workspaceId = rows[0].workspace_id as string
  const [{ data: ws, error: wsErr }, { data: profiles, error: pErr }] = await Promise.all([
    client.from('workspaces').select('id, name').eq('id', workspaceId).maybeSingle(),
    client.from('profiles').select('id, name').in('id', rows.map((r) => r.user_id as string)),
  ])
  if (wsErr) throw wsErr
  if (pErr) throw pErr
  if (!ws) return null

  return { workspace: { id: ws.id as string, name: ws.name as string }, members: mapMembers(rows, profiles ?? []) }
}

interface MemberRow {
  user_id: string
  role: string
  joined_at: string
}

/** Pure mapping: owner first, then partner; names come from profiles. */
export function mapMembers(rows: MemberRow[], profiles: { id: string; name: string }[]): WorkspaceMember[] {
  const names = new Map(profiles.map((p) => [p.id, p.name]))
  return rows
    .map((r) => ({
      id: r.user_id,
      name: names.get(r.user_id) ?? 'Partner',
      role: (r.role === 'owner' ? 'owner' : 'partner') as 'owner' | 'partner',
      joinedAt: r.joined_at,
    }))
    .sort((a, b) => (a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === 'owner' ? -1 : 1))
}

/** Who is inviting, and what accepting would do for the person looking at the link. Works before sign-in. Null if the server can't preview (not deployed yet). */
export async function fetchInvitationPreview(client: SupabaseClient, code: string): Promise<{ data: unknown; missing: boolean; error: { message?: string } | null }> {
  const { data, error } = await client.rpc('invitation_preview', { p_code: code })
  const missing = !!error && ((error as { code?: string }).code === 'PGRST202' || /could not find the function/i.test(error.message ?? ''))
  return { data: error ? null : data, missing, error: error && !missing ? error : null }
}
