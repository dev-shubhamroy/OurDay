package com.ourday.domain.sync

import com.ourday.domain.model.SyncState
import kotlinx.serialization.Serializable

/**
 * A user change described as data, so it can be stored while offline and replayed later (port of frontend offline/queue.ts).
 * Every op is idempotent on the server: client-generated UUIDs, absolute target values, upserts. Replaying after an
 * ambiguous failure can never create a duplicate or flip a value.
 */
@Serializable
sealed interface Op {
    /** The entity this op is about ("task:<id>" / "habit:<id>"); used for compaction and sync-state badges. */
    val entity: String

    @Serializable
    data class TaskInsert(
        val id: String, val kind: String, val title: String, val notes: String?, val createdBy: String, val createdAtMs: Long,
        val date: String, val plannedTime: String?, val dueAtMs: Long?, val notifySecondUser: Boolean,
    ) : Op { override val entity get() = "task:$id" }

    /** Only the fields that changed. `clearDue` removes an optional deadline (shared tasks). `baseUpdatedAtMs` = the server version the edit was made on. */
    @Serializable
    data class TaskPatch(
        val id: String, val kind: String, val title: String? = null, val notes: String? = null, val date: String? = null,
        val plannedTime: String? = null, val clearPlannedTime: Boolean = false, val dueAtMs: Long? = null, val clearDue: Boolean = false,
        val notifySecondUser: Boolean? = null, val baseUpdatedAtMs: Long? = null,
        /** field -> the value this device saw when the edit started (title, notes, task_date, due_at). A newer server value that differs from it = someone else edited it. */
        val base: Map<String, String?> = emptyMap(),
    ) : Op {
        override val entity get() = "task:$id"
        fun fields(): Set<String> = buildSet {
            if (title != null) add("title"); if (notes != null) add("notes"); if (date != null) add("task_date")
            if (plannedTime != null || clearPlannedTime) add("planned_time"); if (dueAtMs != null || clearDue) add("due_at")
            if (notifySecondUser != null) add("notify_second_user")
        }
    }

    /** Absolute target (completed or reopened), so replaying never flips it. */
    @Serializable
    data class TaskComplete(val id: String, val completed: Boolean, val atMs: Long) : Op { override val entity get() = "task:$id" }

    @Serializable
    data class TaskDelete(val id: String) : Op { override val entity get() = "task:$id" }

    @Serializable
    data class HabitInsert(
        val id: String, val title: String, val notes: String?, val createdBy: String, val isShared: Boolean, val ownerId: String?,
        val scheduleDays: List<Int>?, val startDate: String, val notifySecondUser: Boolean,
    ) : Op { override val entity get() = "habit:$id" }

    @Serializable
    data class HabitPatch(
        val id: String, val title: String? = null, val notes: String? = null, val scheduleDays: List<Int>? = null,
        val everyDay: Boolean = false, val paused: Boolean? = null, val notifySecondUser: Boolean? = null,
    ) : Op { override val entity get() = "habit:$id" }

    @Serializable
    data class HabitDelete(val id: String) : Op { override val entity get() = "habit:$id" }

    /** The person's OWN log for one habit and day. `status == null` clears it. Never touches the partner's row. */
    @Serializable
    data class HabitLog(val habitId: String, val userId: String, val workspaceId: String, val day: String, val status: String?, val atMs: Long) : Op {
        override val entity get() = "habit:$habitId"
    }
}

@Serializable
data class QueuedOp(val qid: String, val op: Op, val createdAtMs: Long, val attempts: Int = 0, val lastError: String? = null)

/** Adds an op and compacts: later state replaces earlier state for the same thing (port of queue.ts `enqueue`). */
object OpQueue {
    private fun isInsert(o: Op) = o is Op.TaskInsert || o is Op.HabitInsert
    private fun isDelete(o: Op) = o is Op.TaskDelete || o is Op.HabitDelete

    fun enqueue(queue: List<QueuedOp>, item: QueuedOp, inflight: String? = null): List<QueuedOp> {
        val op = item.op
        // Never edit the op that is being sent right now: later changes queue behind it.
        if (inflight != null && queue.any { it.qid == inflight } && !isDelete(op)) {
            return queue.filter { it.qid == inflight } + enqueue(queue.filter { it.qid != inflight }, item, null)
        }
        val key = op.entity
        return when {
            isDelete(op) -> {
                val sent = inflight != null && queue.any { it.qid == inflight && it.op.entity == key }
                val rest = queue.filter { it.op.entity != key || it.qid == inflight }
                val createdOffline = queue.any { it.qid != inflight && it.op.entity == key && isInsert(it.op) }
                if (sent) rest + item else if (createdOffline) rest else rest + item // created and deleted offline: nothing reaches the server
            }
            op is Op.TaskComplete -> replaceOrAdd(queue, item) { it.op is Op.TaskComplete && (it.op as Op.TaskComplete).id == op.id }
            op is Op.HabitLog -> replaceOrAdd(queue, item) {
                val o = it.op; o is Op.HabitLog && o.habitId == op.habitId && o.day == op.day && o.userId == op.userId
            }
            op is Op.TaskPatch -> {
                val i = queue.indexOfFirst { val o = it.op; (o is Op.TaskInsert && o.id == op.id) || (o is Op.TaskPatch && o.id == op.id) }
                if (i < 0) queue + item else queue.mapIndexed { n, q -> if (n == i) QueuedOp(item.qid, mergeTask(q.op, op), q.createdAtMs, q.attempts) else q }
            }
            op is Op.HabitPatch -> {
                val i = queue.indexOfFirst { val o = it.op; (o is Op.HabitInsert && o.id == op.id) || (o is Op.HabitPatch && o.id == op.id) }
                if (i < 0 || op.paused != null) queue + item
                else queue.mapIndexed { n, q -> if (n == i) QueuedOp(item.qid, mergeHabit(q.op, op), q.createdAtMs, q.attempts) else q }
            }
            else -> queue + item
        }
    }

    private fun replaceOrAdd(queue: List<QueuedOp>, item: QueuedOp, match: (QueuedOp) -> Boolean): List<QueuedOp> {
        val i = queue.indexOfFirst(match)
        return if (i < 0) queue + item else queue.mapIndexed { n, q -> if (n == i) item else q }
    }

    private fun mergeTask(prev: Op, p: Op.TaskPatch): Op = when (prev) {
        is Op.TaskInsert -> prev.copy(
            title = p.title ?: prev.title, notes = p.notes ?: prev.notes, date = p.date ?: prev.date,
            plannedTime = if (p.clearPlannedTime) null else p.plannedTime ?: prev.plannedTime,
            dueAtMs = if (p.clearDue) null else p.dueAtMs ?: prev.dueAtMs, notifySecondUser = p.notifySecondUser ?: prev.notifySecondUser,
        )
        is Op.TaskPatch -> prev.copy(
            title = p.title ?: prev.title, notes = p.notes ?: prev.notes, date = p.date ?: prev.date,
            plannedTime = p.plannedTime ?: prev.plannedTime, clearPlannedTime = prev.clearPlannedTime || p.clearPlannedTime,
            dueAtMs = p.dueAtMs ?: prev.dueAtMs, clearDue = if (p.dueAtMs != null) false else prev.clearDue || p.clearDue,
            notifySecondUser = p.notifySecondUser ?: prev.notifySecondUser, baseUpdatedAtMs = prev.baseUpdatedAtMs ?: p.baseUpdatedAtMs,
            base = p.base + prev.base, // the earliest value seen is the base
        )
        else -> p
    }

    private fun mergeHabit(prev: Op, p: Op.HabitPatch): Op = when (prev) {
        is Op.HabitInsert -> prev.copy(
            title = p.title ?: prev.title, notes = p.notes ?: prev.notes, notifySecondUser = p.notifySecondUser ?: prev.notifySecondUser,
            scheduleDays = if (p.everyDay) null else p.scheduleDays ?: prev.scheduleDays,
        )
        is Op.HabitPatch -> prev.copy(
            title = p.title ?: prev.title, notes = p.notes ?: prev.notes, notifySecondUser = p.notifySecondUser ?: prev.notifySecondUser,
            scheduleDays = p.scheduleDays ?: prev.scheduleDays, everyDay = if (p.scheduleDays != null) false else prev.everyDay || p.everyDay,
        )
        else -> p
    }
}

/** What the server said about one op. */
sealed interface RemoteResult {
    data object Ok : RemoteResult
    /** The row already exists / was already deleted: the earlier attempt succeeded, so this is a success. */
    data object AlreadyApplied : RemoteResult
    /** Offline / timeout / 5xx: keep the op and retry later with backoff. */
    data class Transient(val message: String) : RemoteResult
    /** The session expired: stop, keep every queued change, ask the person to sign in again. */
    data object AuthExpired : RemoteResult
    /** The server refused (permissions, validation): this op can never succeed, drop it and tell the person. */
    data class Rejected(val message: String) : RemoteResult
    /** The server copy changed since this edit was based on it, in the same fields: never overwrite newer data blindly. */
    data class Conflict(val serverFields: Set<String>) : RemoteResult
}

interface OpStore {
    suspend fun load(): List<QueuedOp>
    suspend fun save(queue: List<QueuedOp>)
}

interface RemoteGateway {
    suspend fun execute(op: Op): RemoteResult
}

/** Receives per-entity state changes so the UI can show Pending / Syncing / Failed / Conflict. */
interface SyncListener {
    suspend fun onState(entity: String, state: SyncState, message: String? = null)
    suspend fun onDropped(op: Op, message: String) {}
}

data class FlushResult(val sent: Int, val remaining: Int, val authExpired: Boolean, val networkDown: Boolean, val dropped: Int, val conflicts: Int) {
    val complete get() = remaining == 0 && !authExpired && !networkDown
}

/**
 * Persistent, ordered, idempotent sync queue. Pending ops survive process death because every change is written to the
 * [OpStore] before anything is sent. A transient failure never discards an op; a real rejection drops exactly that op.
 */
class SyncEngine(private val store: OpStore, private val remote: RemoteGateway, private val listener: SyncListener, private val newId: () -> String, private val nowMs: () -> Long) {
    private var inflight: String? = null

    suspend fun enqueue(op: Op): List<QueuedOp> {
        val q = OpQueue.enqueue(store.load(), QueuedOp(newId(), op, nowMs()), inflight)
        store.save(q)
        if (q.any { it.op.entity == op.entity }) listener.onState(op.entity, SyncState.PENDING)
        else listener.onState(op.entity, SyncState.SYNCED) // created and deleted offline: nothing left
        return q
    }

    suspend fun pending(): List<QueuedOp> = store.load()

    suspend fun flush(maxOps: Int = 200): FlushResult {
        var sent = 0
        var dropped = 0
        var conflicts = 0
        var auth = false
        var net = false
        var guard = 0
        while (guard++ < maxOps) {
            val head = store.load().firstOrNull() ?: break
            inflight = head.qid
            listener.onState(head.op.entity, SyncState.SYNCING)
            val result = try { remote.execute(head.op) } catch (e: Exception) { RemoteResult.Transient(e.message ?: "error") }
            inflight = null
            when (result) {
                RemoteResult.Ok, RemoteResult.AlreadyApplied -> { remove(head.qid); sent++; settle(head.op.entity) }
                is RemoteResult.Transient -> {
                    store.save(store.load().map { if (it.qid == head.qid) it.copy(attempts = it.attempts + 1, lastError = result.message) else it })
                    listener.onState(head.op.entity, SyncState.PENDING, result.message); net = true
                    break
                }
                RemoteResult.AuthExpired -> { listener.onState(head.op.entity, SyncState.PENDING, "Sign in again to sync"); auth = true; break }
                is RemoteResult.Rejected -> { remove(head.qid); dropped++; listener.onState(head.op.entity, SyncState.FAILED, result.message); listener.onDropped(head.op, result.message) }
                is RemoteResult.Conflict -> { remove(head.qid); conflicts++; listener.onState(head.op.entity, SyncState.CONFLICT, result.serverFields.joinToString()) }
            }
        }
        return FlushResult(sent, store.load().size, auth, net, dropped, conflicts)
    }

    private suspend fun remove(qid: String) = store.save(store.load().filter { it.qid != qid })

    private suspend fun settle(entity: String) {
        if (store.load().none { it.op.entity == entity }) listener.onState(entity, SyncState.SYNCED) else listener.onState(entity, SyncState.PENDING)
    }
}

/** Pure conflict policy: a patch conflicts only if the SERVER changed one of the same fields after the edit's base version. */
object ConflictPolicy {
    fun conflictingFields(patchFields: Set<String>, serverChangedFields: Set<String>): Set<String> = patchFields intersect serverChangedFields

    fun isStale(baseUpdatedAtMs: Long?, serverUpdatedAtMs: Long?): Boolean =
        baseUpdatedAtMs != null && serverUpdatedAtMs != null && serverUpdatedAtMs > baseUpdatedAtMs

    /** Fields the SERVER changed since this edit started: its value differs from what we saw, and it isn't already what we are writing. */
    fun serverChanged(base: Map<String, String?>, server: Map<String, String?>, patch: Map<String, String?>): Set<String> =
        base.filter { (k, seen) -> server[k] != seen && server[k] != patch[k] }.keys
}
