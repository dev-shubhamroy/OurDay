import { createContext } from 'react'

export interface WorkspaceMember {
  id: string
  name: string
  role: 'owner' | 'partner'
  joinedAt: string
}

export interface InvitationInfo {
  code: string
  expiresAt: string
}

export interface InvitationStatus {
  hasActive: boolean
  expiresAt: string | null
  memberCount: number
}

/** `error` is a friendly message or null. */
export interface ActionResult<T = undefined> {
  error: string | null
  data?: T
}

/**
 * - idle:     not signed in / demo mode
 * - loading:  looking up the user's workspace
 * - none:     signed in but not in a workspace yet (create or join)
 * - ready:    member of a workspace
 * - error:    couldn't load (network); retry available
 */
export type WorkspaceStatus = 'idle' | 'loading' | 'none' | 'ready' | 'error'

export interface WorkspaceCtx {
  status: WorkspaceStatus
  workspace: { id: string; name: string } | null
  members: WorkspaceMember[]
  me: WorkspaceMember | null
  partner: WorkspaceMember | null
  isOwner: boolean
  refresh: () => Promise<void>
  createWorkspace: (name?: string) => Promise<ActionResult>
  acceptInvitation: (code: string) => Promise<ActionResult>
  createInvitation: () => Promise<ActionResult<InvitationInfo>>
  revokeInvitation: () => Promise<ActionResult>
  invitationStatus: () => Promise<ActionResult<InvitationStatus>>
  /** Server-side description of an invitation link for the current person (null data = the server can't preview yet). */
  previewInvitation: (code: string) => Promise<ActionResult<unknown | null>>
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null)
