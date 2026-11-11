package com.ourday.app.sync

import androidx.room.withTransaction
import com.ourday.app.data.db.*
import com.ourday.app.data.local.LocalApplier
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.remote.RemoteReader
import com.ourday.app.data.remote.SupabaseGateway
import com.ourday.app.data.remote.isConfigured
import androidx.glance.appwidget.updateAll
import com.ourday.domain.model.SyncState
import com.ourday.domain.sync.*
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

val SyncJson = Json { classDiscriminator = "type"; ignoreUnknownKeys = true }

/** The queue lives in Room, so it survives process death and reboot. */
class RoomOpStore(private val db: OurDayDatabase) : OpStore {
    override suspend fun load(): List<QueuedOp> = db.queue().all().mapNotNull {
        runCatching { QueuedOp(it.qid, SyncJson.decodeFromString(Op.serializer(), it.json), it.createdAtMs, it.attempts, it.lastError) }.getOrNull()
    }

    override suspend fun save(queue: List<QueuedOp>) = db.queue().replaceAll(queue.map { QueuedOpEntity(0, it.qid, SyncJson.encodeToString(Op.serializer(), it.op), it.createdAtMs, it.attempts, it.lastError) })
}

sealed interface SyncStatus {
    data object Idle : SyncStatus
    data object Syncing : SyncStatus
    data object Offline : SyncStatus
    data object AuthExpired : SyncStatus
    data class Error(val message: String) : SyncStatus
}

/**
 * The one place that changes data: local-first. `submit` writes the op to the persistent queue, applies it to Room at once and
 * asks WorkManager to send it. `sync` sends the queue, then refreshes Room from the server with the queue re-applied on top.
 */
@Singleton
class SyncManager @Inject constructor(
    private val db: OurDayDatabase, private val gateway: SupabaseGateway, private val reader: RemoteReader, private val applier: LocalApplier,
    private val prefs: AppPrefs, private val client: SupabaseClient, private val scheduler: SyncScheduler, @dagger.hilt.android.qualifiers.ApplicationContext private val context: android.content.Context,
    private val poller: com.ourday.app.notifications.NotificationPoller,
) {
    /** Re-render the home-screen widget from Room (cheap, no network). */
    private suspend fun refreshWidget() { runCatching { com.ourday.app.widget.TodayWidget().updateAll(context) } }

    private val mutex = Mutex()
    private val _status = MutableStateFlow<SyncStatus>(SyncStatus.Idle)
    val status: StateFlow<SyncStatus> = _status.asStateFlow()

    private val listener = object : SyncListener {
        override suspend fun onState(entity: String, state: SyncState, message: String?) {
            val (kind, id) = entity.split(':', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            when (kind) { "task" -> db.tasks().setSync(id, state.name); "habit" -> db.habits().setSync(id, state.name) }
            if (state == SyncState.FAILED || state == SyncState.CONFLICT) db.queue().putIssue(SyncIssueEntity(entity, state.name, message, System.currentTimeMillis()))
        }
    }
    private val engine = SyncEngine(RoomOpStore(db), gateway, listener, { UUID.randomUUID().toString() }, { System.currentTimeMillis() })

    private suspend fun meId(): String = db.workspace().get()?.meId ?: client.auth.currentUserOrNull()?.id ?: ""

    /** Persist FIRST (a crash after this still sends it), then show it, then sync. */
    suspend fun submit(op: Op) {
        mutex.withLock { engine.enqueue(op) }
        applier.apply(op, meId())
        refreshWidget()
        scheduler.syncSoon()
    }

    suspend fun dismissIssue(entity: String) = db.queue().dismissIssue(entity)

    suspend fun sync(): FlushResult? = mutex.withLock {
        if (!isConfigured) return null
        if (client.auth.sessionStatus.value !is SessionStatus.Authenticated) {
            _status.value = SyncStatus.AuthExpired; prefs.setNeedsReauth(true)
            return null
        }
        _status.value = SyncStatus.Syncing
        try {
            val flush = engine.flush()
            if (flush.authExpired) { _status.value = SyncStatus.AuthExpired; prefs.setNeedsReauth(true); return flush }
            if (flush.networkDown) { _status.value = SyncStatus.Offline; return flush }
            pull()
            prefs.setNeedsReauth(false)
            prefs.setLastSync(System.currentTimeMillis())
            refreshWidget()
            runCatching { poller.checkNew() } // native notifications from the server's existing rows (no FCM needed)
            _status.value = SyncStatus.Idle
            flush
        } catch (e: Exception) {
            _status.value = if (e is java.io.IOException || e is io.github.jan.supabase.exceptions.HttpRequestException) SyncStatus.Offline else SyncStatus.Error(e.message ?: "Sync failed")
            null
        }
    }

    /** Replace Room with the server's data, then put every still-queued change back on top. */
    private suspend fun pull() {
        val snap = reader.snapshot() ?: return
        val me = reader.currentUserId() ?: return
        val names = snap.profiles.associate { it.id to it.name }
        fun ms(s: String?): Long? = s?.let { runCatching { OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }
        val queue = engine.pending()
        val issues = db.queue().issues().associateBy { it.entity }
        db.withTransaction {
            db.workspace().set(WorkspaceEntity(snap.workspace.id, snap.workspace.name, me))
            db.workspace().clearMembers()
            db.workspace().upsertMembers(snap.members.map { MemberEntity(it.userId, names[it.userId] ?: "Partner", it.role) })
            db.tasks().clear()
            db.tasks().upsertAll(snap.tasks.map { t ->
                val due = ms(t.dueAt)
                TaskEntity(
                    id = t.id, kind = t.kind, title = t.title, notes = t.notes, createdBy = t.createdBy, createdAtMs = ms(t.createdAt) ?: 0L,
                    notifySecondUser = t.notifySecondUser,
                    // a deadline's day is the day of its instant in THIS device's zone
                    date = if ((t.kind == "deadline" || t.kind == "shared") && due != null) Instant.ofEpochMilli(due).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString() else t.taskDate,
                    plannedTime = t.plannedTime?.take(5), dueAtMs = due, status = t.status, completedAtMs = ms(t.completedAt), completedBy = t.completedBy,
                    sharedState = t.sharedState, completionRequestedBy = t.completionRequestedBy, updatedAtMs = ms(t.updatedAt),
                    syncState = issues["task:${t.id}"]?.state ?: "SYNCED",
                )
            })
            db.habits().clear()
            db.habits().upsertAll(snap.habits.map { h ->
                HabitEntity(h.id, h.title, h.notes, h.createdBy, h.isShared, h.ownerId, daysToColumn(h.scheduleDays), h.paused, h.startDate, h.notifySecondUser, issues["habit:${h.id}"]?.state ?: "SYNCED")
            })
            db.habits().clearLogs()
            db.habits().upsertLogs(snap.logs.map { HabitLogEntity(it.habitId, it.userId, it.day, it.status, ms(it.doneAt)) })
            db.quotes().clear()
            db.quotes().upsertAll(snap.quotes.map { QuoteEntity(it.id, it.text, it.author, ms(it.createdAt) ?: 0L) })
            for (q in queue) applier.apply(q.op, me)
        }
    }

    /** A cheap local-only refresh path for screens (no network): nothing to do, Room Flows are the source of truth. */
    suspend fun pendingCount(): Int = engine.pending().size

    suspend fun clearLocalData() {
        db.withTransaction {
            db.tasks().clear(); db.habits().clear(); db.habits().clearLogs(); db.quotes().clear()
            db.workspace().clear(); db.workspace().clearMembers(); db.queue().clear(); db.queue().clearIssues()
        }
        prefs.clearUserState()
        refreshWidget()
    }
}
