import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

/** True when the public Supabase settings are present. Without them the app runs in local demo mode. */
export const isAuthConfigured = Boolean(url && key)

/**
 * The single browser Supabase client. Only the public URL and publishable key are ever used here.
 * Sessions are persisted and refreshed by supabase-js itself; passwords are never stored by the app.
 */
export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  : null
