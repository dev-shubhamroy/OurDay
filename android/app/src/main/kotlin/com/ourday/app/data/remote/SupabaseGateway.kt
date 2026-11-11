package com.ourday.app.data.remote

import com.ourday.app.data.db.OurDayDatabase
import com.ourday.domain.sync.ConflictPolicy
import com.ourday.domain.sync.Op
import com.ourday.domain.sync.RemoteGateway
import com.ourday.domain.sync.RemoteResult
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sends one queued op to the existing Supabase tables. Every operation is idempotent (client UUIDs, upserts, absolute target values),
 * so replaying after an ambiguous failure never creates a duplicate. The server's row level security stays the gatekeeper.
 */
@Singleton
class SupabaseGateway @Inject constructor(private val client: SupabaseClient, private val db: OurDayDatabase) : RemoteGateway {

    override suspend fun execute(op: Op): RemoteResult {
        if (!isConfigured) return RemoteResult.Rejected("Supabase isn’t configured in this build.")
        if (client.auth.sessionStatus.value !is SessionStatus.Authenticated) return RemoteResult.AuthExpired
        return try {
            run(op)
            RemoteResult.Ok
        } catch (e: ConflictException) {
            RemoteResult.Conflict(e.fields)
        } catch (e: Exception) {
            classify(e)
        }
    }

    private class ConflictException(val fields: Set<String>) : Exception()

    private suspend fun workspaceId(): String = db.workspace().get()?.id ?: throw IllegalStateException("no workspace")

    private suspend fun run(op: Op) {
        when (op) {
            is Op.TaskInsert -> client.from("tasks").insert(buildJsonObject {
                put("id", op.id); put("workspace_id", workspaceId()); put("kind", op.kind); put("title", op.title)
                put("notes", op.notes); put("created_by", op.createdBy); put("notify_second_user", op.notifySecondUser)
                put("task_date", op.date); put("planned_time", if (op.kind == "daily") op.plannedTime else null)
                put("due_at", if (op.kind == "deadline" || op.kind == "shared") op.dueAtMs?.let { Instant.ofEpochMilli(it).toString() } else null)
            })
            is Op.TaskPatch -> {
                checkConflict(op)
                val row = buildJsonObject {
                    op.title?.let { put("title", it) }
                    op.notes?.let { put("notes", it.ifBlank { null }) }
                    op.date?.let { put("task_date", it) }
                    if (op.clearPlannedTime) put("planned_time", JsonNull) else op.plannedTime?.let { put("planned_time", it) }
                    if (op.clearDue) put("due_at", JsonNull) else op.dueAtMs?.let { put("due_at", Instant.ofEpochMilli(it).toString()) }
                    op.notifySecondUser?.let { put("notify_second_user", it) }
                }
                if (row.isNotEmpty()) client.from("tasks").update(row) { filter { eq("id", op.id) } }
            }
            is Op.TaskComplete -> client.from("tasks").update(buildJsonObject { put("status", if (op.completed) "completed" else "open") }) { filter { eq("id", op.id) } }
            is Op.TaskDelete -> client.from("tasks").delete { filter { eq("id", op.id) } }
            is Op.HabitInsert -> client.from("habits").insert(buildJsonObject {
                put("id", op.id); put("workspace_id", workspaceId()); put("title", op.title); put("notes", op.notes); put("created_by", op.createdBy)
                put("is_shared", op.isShared); put("owner_id", if (op.isShared) null else op.ownerId)
                put("schedule_days", op.scheduleDays?.let { d -> kotlinx.serialization.json.JsonArray(d.map { kotlinx.serialization.json.JsonPrimitive(it) }) } ?: JsonNull)
                put("start_date", op.startDate); put("notify_second_user", op.notifySecondUser)
            })
            is Op.HabitPatch -> {
                val row = buildJsonObject {
                    op.title?.let { put("title", it) }
                    op.notes?.let { put("notes", it.ifBlank { null }) }
                    op.paused?.let { put("paused", it) }
                    op.notifySecondUser?.let { put("notify_second_user", it) }
                    if (op.everyDay) put("schedule_days", JsonNull)
                    else op.scheduleDays?.let { d -> put("schedule_days", kotlinx.serialization.json.JsonArray(d.map { kotlinx.serialization.json.JsonPrimitive(it) })) }
                }
                if (row.isNotEmpty()) client.from("habits").update(row) { filter { eq("id", op.id) } }
            }
            is Op.HabitDelete -> client.from("habits").delete { filter { eq("id", op.id) } }
            is Op.HabitLog -> {
                val st = op.status
                if (st == null) client.from("habit_logs").delete { filter { eq("habit_id", op.habitId); eq("user_id", op.userId); eq("day", op.day) } }
                else client.from("habit_logs").upsert(HabitLogUpsert(op.habitId, op.userId, op.workspaceId, op.day, st)) { onConflict = "habit_id,user_id,day" }
            }
        }
    }

    /** Never overwrite newer server data blindly: if the server copy changed the SAME fields after this edit started, report a conflict. */
    private suspend fun checkConflict(op: Op.TaskPatch) {
        val server = client.from("tasks").select { filter { eq("id", op.id) } }.decodeSingleOrNull<TaskDto>() ?: return
        val serverMs = server.updatedAt?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }
        if (!ConflictPolicy.isStale(op.baseUpdatedAtMs, serverMs)) return
        val serverVals = mapOf(
            "title" to server.title, "notes" to (server.notes ?: ""), "task_date" to server.taskDate,
            "due_at" to server.dueAt?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli().toString() }.getOrNull() },
        )
        val patchVals = mapOf("title" to op.title, "notes" to op.notes, "task_date" to op.date, "due_at" to op.dueAtMs?.toString())
        val conflicting = ConflictPolicy.conflictingFields(op.fields(), ConflictPolicy.serverChanged(op.base, serverVals, patchVals))
        if (conflicting.isNotEmpty()) throw ConflictException(conflicting)
    }

    private fun classify(e: Exception): RemoteResult = when {
        e is RestException && (e.statusCode == 401 || e.description?.contains("JWT", ignoreCase = true) == true) -> RemoteResult.AuthExpired
        e is RestException && e.statusCode == 409 -> RemoteResult.AlreadyApplied // duplicate key: an earlier attempt already stored it
        e is RestException && e.error.contains("duplicate key", ignoreCase = true) -> RemoteResult.AlreadyApplied
        e is RestException && e.statusCode in 500..599 -> RemoteResult.Transient("server ${e.statusCode}")
        e is RestException && e.statusCode == 429 -> RemoteResult.Transient("rate limited")
        e is RestException -> RemoteResult.Rejected(friendly(e))
        e is HttpRequestException || e is IOException || e.cause is IOException -> RemoteResult.Transient(e.message ?: "offline")
        else -> RemoteResult.Transient(e.message ?: "error")
    }

    private fun friendly(e: RestException): String = when {
        e.statusCode == 403 || e.error.contains("row-level", ignoreCase = true) || e.error.contains("permission", ignoreCase = true) -> "You don’t have permission to do that."
        e.error.contains("use_shared_task_functions") -> "Shared tasks change state through approval."
        else -> "The server refused that change."
    }
}
