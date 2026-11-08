import type { SupabaseClient } from '@supabase/supabase-js'
import type { Quote } from '../quotes'

export interface QuoteRow {
  id: string
  text: string
  author: string | null
  created_at: string
}

export const quoteFromRow = (r: QuoteRow): Quote => ({ id: r.id, text: r.text, author: r.author, createdAt: r.created_at })

const COLUMNS = 'id, text, author, created_at'

/** The table may not exist yet (migration not applied): callers treat that as "feature not available". */
export const isMissingQuotesBackend = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table/i.test(e.message ?? ''))

export const fetchQuotes = (c: SupabaseClient) => c.from('inspiration_quotes').select(COLUMNS).order('created_at', { ascending: true })
export const insertQuote = (c: SupabaseClient, id: string, text: string, author: string | null) => c.from('inspiration_quotes').insert({ id, text, author })
export const updateQuote = (c: SupabaseClient, id: string, text: string, author: string | null) => c.from('inspiration_quotes').update({ text, author }).eq('id', id)
export const deleteQuote = (c: SupabaseClient, id: string) => c.from('inspiration_quotes').delete().eq('id', id)
