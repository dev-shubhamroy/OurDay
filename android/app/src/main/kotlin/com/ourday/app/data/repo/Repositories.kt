package com.ourday.app.data.repo

import com.ourday.app.data.db.OurDayDatabase
import com.ourday.app.data.db.toDomain
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.remote.RemoteReader
import com.ourday.app.data.remote.isConfigured
import com.ourday.app.sync.SyncManager
import com.ourday.app.sync.SyncScheduler
import com.ourday.domain.Validation
import com.ourday.domain.model.*
import com.ourday.domain.rules.HabitLogs
import com.ourday.domain.sync.Op
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val userId: String, val email: String, val name: String) : AuthState
}

/** Supabase email + password with the SAME accounts as the web app. Sessions persist and refresh inside the SDK. */
@Singleton
class AuthRepository @Inject constructor(
    private val client: SupabaseClient, private val sync: SyncManager, private val scheduler: SyncScheduler, private val db: OurDayDatabase,
) {
    val state: Flow<AuthState> = if (!isConfigured) kotlinx.coroutines.flow.flowOf(AuthState.SignedOut) else client.auth.sessionStatus.map { s ->
        when (s) {
            is SessionStatus.Initializing -> AuthState.Loading
            is SessionStatus.Authenticated -> signedIn() ?: AuthState.SignedOut
            // Offline with an expired token: the stored session still identifies the person, so the app keeps working from its local data.
            is SessionStatus.RefreshFailure -> signedIn() ?: AuthState.SignedOut
            else -> AuthState.SignedOut
        }
    }

    private fun signedIn(): AuthState.SignedIn? = client.auth.currentUserOrNull()?.let { u ->
        val name = (u.userMetadata?.get("name") as? kotlinx.serialization.json.JsonPrimitive)?.content ?: (u.email ?: "").substringBefore('@')
        AuthState.SignedIn(u.id, u.email ?: "", name)
    }

    suspend fun signIn(email: String, password: String): Result<Unit> {
        (Validation.signIn(email, password) as? Validation.Result.Error)?.let { return Result.failure(IllegalArgumentException(it.message)) }
        return runCatching { client.auth.signInWith(Email) { this.email = email.trim(); this.password = password } }.mapFailure()
    }

    /** Returns a notice when the project still wants email confirmation, otherwise null. */
    suspend fun signUp(name: String, email: String, password: String): Result<String?> {
        (Validation.signUp(name, email, password) as? Validation.Result.Error)?.let { return Result.failure(IllegalArgumentException(it.message)) }
        return runCatching {
            client.auth.signUpWith(Email) { this.email = email.trim(); this.password = password; data = buildJsonObject { put("name", name.trim()) } }
            if (client.auth.currentSessionOrNull() == null) "Your account was created. Confirm your email if asked, then sign in." else null
        }.mapFailure()
    }

    /** Removes this phone's cache and queue (a signed-out phone keeps none of this person's data). */
    suspend fun signOut() {
        scheduler.cancelAll()
        runCatching { client.auth.signOut() }
        sync.clearLocalData()
        scheduler.schedulePeriodic()
    }

    suspend fun pendingChanges(): Int = sync.pendingCount()

    private fun <T> Result<T>.mapFailure(): Result<T> = recoverCatching { throw IllegalStateException(friendly(it)) }

    companion object {
        fun friendly(e: Throwable): String {
            val m = e.message ?: ""
            return when {
                e is IllegalArgumentException -> m
                e is HttpRequestException || e is IOException || e.cause is IOException -> "Can’t reach OurDay. Check your connection and try again."
                m.contains("invalid login", true) || m.contains("invalid_credentials", true) -> "That email and password don’t match. Please try again."
                m.contains("already registered", true) || m.contains("user_already_exists", true) -> "An account with this email already exists. Try signing in instead."
                m.contains("weak_password", true) || m.contains("at least", true) -> "Choose a stronger password (at least 8 characters)."
                m.contains("rate limit", true) || (e is RestException && e.statusCode == 429) -> "Too many attempts. Wait a minute and try again."
                else -> "Something went wrong. Please try again."
            }
        }
    }
}

data class AppData(
    val workspace: Workspace?, val tasks: List<Task>, val habits: List<Habit>, val logs: Map<String, HabitLogs>, val quotes: List<Quote>,
) {
    val meId get() = workspace?.meId.orEmpty()
    val memberIds get() = workspace?.members?.map { it.id }.orEmpty()
}

/** All reads come from Room (works offline); all writes go through the persistent sync queue. */
@Singleton
class OurDayRepository @Inject constructor(private val db: OurDayDatabase, private val sync: SyncManager, private val reader: RemoteReader, private val prefs: AppPrefs) {

    val data: Flow<AppData> = combine(
        db.workspace().observe(), db.workspace().observeMembers(), db.tasks().observeAll(), db.habits().observeAll(), db.habits().observeLogs(),
    ) { ws, members, tasks, habits, logs -> arrayOf(ws, members, tasks, habits, logs) }
        .combine(db.quotes().observeAll()) { a, quotes ->
            @Suppress("UNCHECKED_CAST")
            val ws = a[0] as com.ourday.app.data.db.WorkspaceEntity?
            val members = (a[1] as List<com.ourday.app.data.db.MemberEntity>).map { it.toDomain() }
            val logsByHabit: Map<String, HabitLogs> = (a[4] as List<com.ourday.app.data.db.HabitLogEntity>).map { it.toDomain() }
                .groupBy { it.habitId }.mapValues { (_, l) -> l.groupBy { it.userId }.mapValues { (_, x) -> x.associateBy { it.day } } }
            AppData(
                workspace = ws?.let { Workspace(it.id, it.name, members, it.meId) },
                tasks = (a[2] as List<com.ourday.app.data.db.TaskEntity>).map { it.toDomain() },
                habits = (a[3] as List<com.ourday.app.data.db.HabitEntity>).map { it.toDomain() },
                logs = logsByHabit, quotes = quotes.map { it.toDomain() },
            )
        }

    val pendingCount: Flow<Int> = db.queue().observeCount()
    val issues = db.queue().observeIssues()
    val syncStatus: StateFlow<com.ourday.app.sync.SyncStatus> get() = sync.status

    private suspend fun me(): String = db.workspace().get()?.meId ?: ""
    private suspend fun ws(): String = db.workspace().get()?.id ?: ""
    private fun newId() = UUID.randomUUID().toString()
    private fun nowMs() = System.currentTimeMillis()

    suspend fun refresh() = sync.sync()
    suspend fun dismissIssue(entity: String) = sync.dismissIssue(entity)

    // ---- tasks ----------------------------------------------------------------------------------------------------------

    data class TaskInput(val kind: TaskKind, val title: String, val notes: String?, val date: LocalDate, val plannedTime: LocalTime?, val dueAt: Instant?, val notify: Boolean)

    suspend fun addTask(i: TaskInput): String {
        val id = newId()
        val day = if (i.kind != TaskKind.DAILY && i.dueAt != null) i.dueAt.atZone(ZoneId.systemDefault()).toLocalDate() else i.date
        sync.submit(Op.TaskInsert(id, i.kind.wire, i.title.trim(), i.notes?.trim()?.ifBlank { null }, me(), nowMs(), day.toString(), i.plannedTime?.toString()?.take(5), i.dueAt?.toEpochMilli(), i.kind == TaskKind.SHARED || i.notify))
        return id
    }

    /** Sends only what changed, with the values the edit started from so a conflicting server edit is detected, never overwritten. */
    suspend fun editTask(old: Task, i: TaskInput) {
        val dueChanged = old.dueAt != i.dueAt
        val clearDue = old.kind == TaskKind.SHARED && old.dueAt != null && i.dueAt == null
        val newDay = if (i.kind != TaskKind.DAILY && i.dueAt != null) i.dueAt.atZone(ZoneId.systemDefault()).toLocalDate() else i.date
        val base = buildMap<String, String?> {
            put("title", old.title); put("notes", old.notes ?: ""); put("task_date", old.date.toString()); put("due_at", old.dueAt?.toEpochMilli()?.toString())
        }
        sync.submit(
            Op.TaskPatch(
                id = old.id, kind = old.kind.wire,
                title = i.title.trim().takeIf { it != old.title }, notes = (i.notes?.trim() ?: "").takeIf { it != (old.notes ?: "") },
                date = newDay.toString().takeIf { it != old.date.toString() },
                plannedTime = if (old.kind == TaskKind.DAILY) i.plannedTime?.toString()?.take(5)?.takeIf { it != old.plannedTime?.toString()?.take(5) } else null,
                clearPlannedTime = old.kind == TaskKind.DAILY && i.plannedTime == null && old.plannedTime != null,
                dueAtMs = if (dueChanged && i.dueAt != null) i.dueAt.toEpochMilli() else null, clearDue = clearDue,
                notifySecondUser = if (old.kind == TaskKind.SHARED) null else i.notify.takeIf { it != old.notifySecondUser },
                baseUpdatedAtMs = old.updatedAt?.toEpochMilli(), base = base,
            ),
        )
    }

    suspend fun setTaskCompleted(task: Task, completed: Boolean) {
        if (task.kind == TaskKind.SHARED) return // shared tasks complete only through the approval flow
        sync.submit(Op.TaskComplete(task.id, completed, nowMs()))
    }

    suspend fun deleteTask(id: String) = sync.submit(Op.TaskDelete(id))

    // ---- habits -------------------------------------------------------------------------------------------------------

    data class HabitInput(val title: String, val notes: String?, val shared: Boolean, val days: Set<Int>?, val startDate: LocalDate, val notify: Boolean)

    suspend fun addHabit(i: HabitInput): String {
        val id = newId()
        val days = i.days?.takeIf { it.isNotEmpty() && it.size < 7 }?.sorted()
        sync.submit(Op.HabitInsert(id, i.title.trim(), i.notes?.trim()?.ifBlank { null }, me(), i.shared, if (i.shared) null else me(), days, i.startDate.toString(), i.shared || i.notify))
        return id
    }

    suspend fun editHabit(old: Habit, i: HabitInput) {
        val newDays = i.days?.takeIf { it.isNotEmpty() && it.size < 7 }?.sorted()
        val oldDays = old.scheduleDays?.sorted()
        sync.submit(
            Op.HabitPatch(
                id = old.id, title = i.title.trim().takeIf { it != old.title }, notes = (i.notes?.trim() ?: "").takeIf { it != (old.notes ?: "") },
                scheduleDays = newDays.takeIf { it != oldDays }, everyDay = newDays == null && oldDays != null, notifySecondUser = i.notify.takeIf { !old.isShared && it != old.notifySecondUser },
            ),
        )
    }

    suspend fun setHabitPaused(id: String, paused: Boolean) = sync.submit(Op.HabitPatch(id, paused = paused))
    suspend fun deleteHabit(id: String) = sync.submit(Op.HabitDelete(id))

    /** Writes ONLY this person's own log for that day; the partner's row is never touched. null clears it. */
    suspend fun setHabitDay(habitId: String, day: LocalDate, status: LogStatus?) =
        sync.submit(Op.HabitLog(habitId, me(), ws(), day.toString(), status?.wire, nowMs()))

    suspend fun currentLog(habitId: String, day: LocalDate): LogStatus? = db.habits().getLog(habitId, me(), day.toString())?.let { LogStatus.fromWire(it.status) }

    // ---- shared tasks (server-side approval flow; needs a connection) ---------------------------------------------------------

    suspend fun sharedAction(function: String, taskId: String, approve: Boolean? = null, message: String? = null): String? = runCatching {
        reader.sharedRpc(function, buildJsonObject {
            put("p_task", taskId)
            approve?.let { put("p_approve", it) }
            message?.let { put("p_message", it) }
        })
        sync.sync()
        null
    }.getOrElse { e -> sharedMessage(e) }

    private fun sharedMessage(e: Throwable): String {
        val m = e.message ?: ""
        return when {
            e is HttpRequestException || e is IOException -> "You’re offline. Approvals and reminders need a connection."
            m.contains("cannot_review_own_request") -> "Your partner has to review your request."
            m.contains("already_pending") -> "A completion request is already waiting for approval."
            m.contains("task_completed") -> "That task is already completed."
            m.contains("no_pending_request") -> "There’s no completion request to review."
            m.contains("cooldown") -> "You just sent a reminder for this task. Try again in a few minutes."
            m.contains("empty_message") -> "Write a message first."
            else -> "That didn’t go through. Please try again."
        }
    }
}
