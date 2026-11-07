import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { friendlyWorkspaceError } from '../lib/authErrors'
import { createDebouncer, watchTables } from '../lib/realtime'
import { supabase } from '../lib/supabase'
import { loadWorkspace } from '../services/remote/workspace'
import { WorkspaceContext, type ActionResult, type InvitationInfo, type InvitationStatus, type WorkspaceCtx, type WorkspaceMember, type WorkspaceStatus } from './workspaceContext'

/** Knows which workspace the signed-in user belongs to and who their partner is. Live-updates when the partner joins. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: auth, user } = useAuth()
  const [status, setStatus] = useState<WorkspaceStatus>('loading')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const seq = useRef(0)

  const uid = user?.id
  const refresh = useCallback(async () => {
    if (!supabase || !uid) return
    const mine = ++seq.current
    try {
      const loaded = await loadWorkspace(supabase)
      if (mine !== seq.current) return // a newer load is in flight; ignore this stale result
      setLoadedFor(uid)
      if (!loaded) {
        setWorkspace(null)
        setMembers([])
        setStatus('none')
      } else {
        setWorkspace(loaded.workspace)
        setMembers(loaded.members)
        setStatus('ready')
      }
    } catch {
      if (mine === seq.current) {
        setLoadedFor(uid)
        setStatus((s) => (s === 'ready' ? s : 'error'))
      }
    }
  }, [uid])

  useEffect(() => {
    if (auth === 'signedIn' && uid) queueMicrotask(() => void refresh())
    else seq.current++ // drop any in-flight load
  }, [auth, uid, refresh])

  // Derived: signed out -> idle; a different user than the loaded one -> loading (never show the previous user's workspace).
  const signedIn = auth === 'signedIn' && !!uid
  const sameUser = loadedFor === uid

  // Live updates: the partner joining (or changing their name) shows up without a refresh.
  const wsId = signedIn && sameUser ? workspace?.id : undefined
  useEffect(() => {
    if (!supabase || !wsId) return
    const debounced = createDebouncer(() => void refresh(), 250)
    const stop = watchTables(supabase, `ourday:members:${wsId}`, [{ table: 'workspace_members', filter: `workspace_id=eq.${wsId}` }, { table: 'profiles' }], () => debounced.trigger(), () => undefined)
    return () => {
      debounced.cancel()
      stop()
    }
  }, [wsId, refresh])

  const rpc = useCallback(async (fn: string, args?: Record<string, unknown>) => {
    if (!supabase) return { data: null, error: 'Sign-in isn’t set up yet.' as string | null }
    try {
      const { data, error } = await supabase.rpc(fn, args)
      return { data, error: error ? friendlyWorkspaceError(error) : null }
    } catch (e) {
      return { data: null, error: friendlyWorkspaceError(e) }
    }
  }, [])

  const createWorkspace = useCallback(
    async (name?: string): Promise<ActionResult> => {
      const r = await rpc('create_workspace', { p_name: name?.trim() || 'Our workspace' })
      if (!r.error) await refresh()
      return { error: r.error }
    },
    [rpc, refresh],
  )

  const acceptInvitation = useCallback(
    async (code: string): Promise<ActionResult> => {
      const r = await rpc('accept_invitation', { p_code: code.trim() })
      if (!r.error) await refresh()
      return { error: r.error }
    },
    [rpc, refresh],
  )

  const createInvitation = useCallback(async (): Promise<ActionResult<InvitationInfo>> => {
    const r = await rpc('create_invitation')
    if (r.error) return { error: r.error }
    const d = r.data as { code: string; expires_at: string }
    return { error: null, data: { code: d.code, expiresAt: d.expires_at } }
  }, [rpc])

  const revokeInvitation = useCallback(async (): Promise<ActionResult> => ({ error: (await rpc('revoke_invitation')).error }), [rpc])

  const invitationStatus = useCallback(async (): Promise<ActionResult<InvitationStatus>> => {
    const r = await rpc('get_invitation_status')
    if (r.error) return { error: r.error }
    const d = r.data as { has_active: boolean; expires_at: string | null; member_count: number }
    return { error: null, data: { hasActive: d.has_active, expiresAt: d.expires_at, memberCount: d.member_count } }
  }, [rpc])

  const value = useMemo<WorkspaceCtx>(() => {
    const me = members.find((m) => m.id === uid) ?? null
    const partner = members.find((m) => m.id !== uid) ?? null
    const effective: WorkspaceStatus = !signedIn ? 'idle' : !sameUser ? 'loading' : status
    const visible = signedIn && sameUser
    return { status: effective, workspace: visible ? workspace : null, members: visible ? members : [], me: visible ? me : null, partner: visible ? partner : null, isOwner: visible && me?.role === 'owner', refresh, createWorkspace, acceptInvitation, createInvitation, revokeInvitation, invitationStatus }
  }, [signedIn, sameUser, status, workspace, members, uid, refresh, createWorkspace, acceptInvitation, createInvitation, revokeInvitation, invitationStatus])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
