import { createContext } from 'react'

export type ThemePreference = 'dark' | 'light' | 'system'
export type Resolved = 'dark' | 'light'

export interface ThemeCtx {
  preference: ThemePreference
  resolved: Resolved
  setPreference: (p: ThemePreference) => void
  toggle: () => void
}

export const ThemeContext = createContext<ThemeCtx | null>(null)
