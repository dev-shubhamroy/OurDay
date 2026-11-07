import type { DateKey } from '../types'

const KEY = 'ourday:briefing-seen'

export function hasSeenBriefing(today: DateKey): boolean {
  try {
    return localStorage.getItem(KEY) === today
  } catch {
    return false
  }
}

export function markBriefingSeen(today: DateKey) {
  try {
    localStorage.setItem(KEY, today)
  } catch {
    /* storage unavailable */
  }
}

export function resetBriefingSeen() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
