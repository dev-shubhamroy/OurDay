/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Safe for the browser; never use the service-role key here. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy name for the same public key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
