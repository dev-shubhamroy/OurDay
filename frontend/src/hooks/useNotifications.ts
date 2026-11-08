import { useContext } from 'react'
import { NotificationContext } from '../store/notificationContext'

/** Returns null in demo mode or before the backend is deployed. */
export function useNotifications() {
  return useContext(NotificationContext)
}
