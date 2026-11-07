import type { ViewMode } from '../store/viewContext'

/** Without a partner there is nobody to show, so Partner Mode falls back to My Mode (nothing is stored or changed). */
export const resolveMode = (stored: ViewMode, canViewPartner: boolean): ViewMode => (stored === 'partner' && canViewPartner ? 'partner' : 'me')
