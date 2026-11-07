import { useContext, useMemo } from 'react'
import { habitsOf, tasksOwnedBy } from '../services/selectors'
import { ViewContext } from '../store/viewContext'
import { useApp } from './useApp'

export function useView() {
  const v = useContext(ViewContext)
  if (!v) throw new Error('useView must be used within ViewProvider')
  return v
}

/**
 * The tasks and habits belonging to the person being viewed (a filter over the shared workspace data).
 * Tasks belong to their creator; habits belong to everyone who takes part in them (a shared habit is in both views).
 */
export function useViewData() {
  const { tasks, habits } = useApp()
  const view = useView()
  const viewTasks = useMemo(() => tasksOwnedBy(tasks, view.subject.id), [tasks, view.subject.id])
  const viewHabits = useMemo(() => habitsOf(habits, view.subject.id), [habits, view.subject.id])
  return { ...view, tasks: viewTasks, habits: viewHabits }
}
