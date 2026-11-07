import { useContext } from 'react'
import { WorkspaceContext } from '../store/workspaceContext'

export function useWorkspace() {
  const v = useContext(WorkspaceContext)
  if (!v) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return v
}
