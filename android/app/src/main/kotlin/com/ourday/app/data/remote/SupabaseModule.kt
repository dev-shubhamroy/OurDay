package com.ourday.app.data.remote

import com.ourday.app.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

/** Whether the build was given the public Supabase settings. Without them the app shows a clear setup message. */
val isConfigured: Boolean get() = BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank()

/**
 * The single Supabase client. Only the public URL and the PUBLISHABLE key are ever used: row level security protects the data,
 * exactly as for the web app. Sessions are persisted and refreshed by the SDK; passwords are never stored by the app.
 */
fun buildSupabase(): SupabaseClient = createSupabaseClient(
    supabaseUrl = BuildConfig.SUPABASE_URL.ifBlank { "https://not-configured.invalid" },
    supabaseKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY.ifBlank { "not-configured" },
) {
    install(Auth)
    install(Postgrest)
    install(Realtime)
}
