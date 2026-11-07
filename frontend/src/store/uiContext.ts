import { createContext, useContext } from 'react'

export interface UiCtx {
  openAddTask: () => void
  toast: (message: string) => void
}

export const UiContext = createContext<UiCtx | null>(null)

export function useUi() {
  const v = useContext(UiContext)
  if (!v) throw new Error('useUi must be used within the app shell')
  return v
}
