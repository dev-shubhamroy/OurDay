import { createContext } from 'react'
import type { User } from '../types'

export type ViewMode = 'me' | 'partner'

export interface ViewCtx {
  mode: ViewMode
  setMode: (m: ViewMode) => void
  /** The person whose tasks, habits and progress are shown. Purely a filter; ownership and records never change. */
  subject: User
  isPartnerView: boolean
  /** False until a partner has joined the workspace. */
  canViewPartner: boolean
}

export const ViewContext = createContext<ViewCtx | null>(null)
