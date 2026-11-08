import { useContext } from 'react'
import { QuoteContext } from '../store/quoteContext'

export function useQuotes() {
  const v = useContext(QuoteContext)
  if (!v) throw new Error('useQuotes must be used within QuoteProvider')
  return v
}
