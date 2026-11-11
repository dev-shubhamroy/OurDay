package com.ourday.app.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

data class RemoteSnapshot(
    val workspace: WorkspaceDto, val members: List<MemberDto>, val profiles: List<ProfileDto>,
    val tasks: List<TaskDto>, val habits: List<HabitDto>, val logs: List<HabitLogDto>, val quotes: List<QuoteDto>,
)

/** Reads everything the signed-in person may see (the server's row level security scopes it to their workspace). */
@Singleton
class RemoteReader @Inject constructor(private val client: SupabaseClient) {
    private val page = 1000L

    private suspend inline fun <reified T : Any> all(table: String, order: String): List<T> {
        val out = mutableListOf<T>()
        var from = 0L
        while (true) {
            val batch = client.from(table).select { order(order, Order.ASCENDING); range(from, from + page - 1) }.decodeList<T>()
            out += batch
            if (batch.size < page) return out
            from += page
        }
    }

    /** Null = the person has no workspace yet (create or join one in the web app; Android never silently creates one). */
    suspend fun snapshot(): RemoteSnapshot? {
        val members = all<MemberDto>("workspace_members", "joined_at")
        if (members.isEmpty()) return null
        val wsId = members.first().workspaceId
        val ws = client.from("workspaces").select { filter { eq("id", wsId) } }.decodeSingleOrNull<WorkspaceDto>() ?: return null
        val profiles = client.from("profiles").select().decodeList<ProfileDto>()
        val tasks = all<TaskDto>("tasks", "created_at")
        val habits = all<HabitDto>("habits", "created_at")
        val logs = all<HabitLogDto>("habit_logs", "day")
        // The Inspiration Library may not exist on older backends: treat a missing table as "no quotes", never as a failure.
        val quotes = runCatching { all<QuoteDto>("inspiration_quotes", "created_at") }.getOrDefault(emptyList())
        return RemoteSnapshot(ws, members, profiles, tasks, habits, logs, quotes)
    }

    suspend fun prefs(userId: String): PrefsDto? =
        client.from("notification_preferences").select { filter { eq("user_id", userId) } }.decodeSingleOrNull<PrefsDto>()

    suspend fun savePrefs(p: PrefsUpsert) { client.from("notification_preferences").upsert(p) { onConflict = "user_id" } }

    /** Shared-task actions are server-side functions (they need the other person's approval). */
    suspend fun sharedRpc(function: String, params: JsonObject) { client.postgrest.rpc(function, params) }

    fun currentUserId(): String? = client.auth.currentUserOrNull()?.id
}
