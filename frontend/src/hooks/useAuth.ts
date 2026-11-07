import { useContext } from 'react'
import { AuthContext } from '../store/authContext'

export function useAuth() {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
