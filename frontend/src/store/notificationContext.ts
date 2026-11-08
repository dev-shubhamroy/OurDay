import { createContext } from 'react'
import type { NotificationPrefs, NotificationRow } from '../services/remote/notifications'

export interface NotificationCtx {
  items: NotificationRow[]
  unread: number
  prefs: NotificationPrefs
  loading: boolean
  /** True when the notification tables/functions are not deployed yet: the UI hides itself instead of erroring. */
  unavailable: boolean
  error: string | null
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  setPref: <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => Promise<void>
}

/** Null in local demo mode (no backend): components must tolerate that. */
export const NotificationContext = createContext<NotificationCtx | null>(null)
