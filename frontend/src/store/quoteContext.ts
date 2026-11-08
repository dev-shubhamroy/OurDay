import { createContext } from 'react'
import type { Quote } from '../services/quotes'

export interface QuoteCtx {
  quotes: Quote[]
  loading: boolean
  /** False until the backend table exists (migration applied); the Settings section explains instead of failing. */
  available: boolean
  error: string | null
  /** Resolve to an error message, or null on success. */
  add: (text: string, author?: string) => Promise<string | null>
  edit: (id: string, text: string, author?: string) => Promise<string | null>
  remove: (id: string) => Promise<string | null>
  /** The quote for this briefing (stable until `finishBriefing`), or null when the library is empty. */
  quoteForBriefing: (day: string) => Quote | null
  /** Call when a briefing is dismissed: the next briefing gets a fresh pick. */
  finishBriefing: () => void
}

export const QuoteContext = createContext<QuoteCtx | null>(null)
