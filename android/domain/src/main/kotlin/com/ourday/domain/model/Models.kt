package com.ourday.domain.model

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

/** Wire values match the existing Supabase schema (tasks.kind, tasks.status, tasks.shared_state). */
enum class TaskKind(val wire: String) {
    DAILY("daily"), DEADLINE("deadline"), SHARED("shared");

    companion object {
        fun fromWire(s: String): TaskKind = entries.firstOrNull { it.wire == s } ?: DAILY
    }
}

enum class TaskStatus(val wire: String) {
    OPEN("open"), COMPLETED("completed");

    companion object {
        fun fromWire(s: String): TaskStatus = if (s == "completed") COMPLETED else OPEN
    }
}

/** Shared tasks only: one state for both people; completion needs the other person's approval. */
enum class SharedState(val wire: String) {
    ACTIVE("active"), AWAITING_APPROVAL("awaiting_approval"), COMPLETED("completed");

    companion object {
        fun fromWire(s: String?): SharedState? = entries.firstOrNull { it.wire == s }
    }
}

/** Per-item synchronisation state shown in the UI. */
enum class SyncState { SYNCED, PENDING, SYNCING, FAILED, CONFLICT }

data class Task(
    val id: String,
    val kind: TaskKind,
    val title: String,
    val notes: String?,
    val createdBy: String,
    val createdAt: Instant,
    val notifySecondUser: Boolean,
    /** Planned day (daily) / local due day (deadline) / creation or due day (shared). */
    val date: LocalDate,
    val plannedTime: LocalTime?,
    val dueAt: Instant?,
    val status: TaskStatus,
    val completedAt: Instant?,
    val completedBy: String?,
    val sharedState: SharedState? = null,
    val completionRequestedBy: String? = null,
    /** Server `updated_at`, the base for conflict detection. */
    val updatedAt: Instant? = null,
    val syncState: SyncState = SyncState.SYNCED,
) {
    val isOpen get() = status == TaskStatus.OPEN
}

enum class LogStatus(val wire: String) {
    DONE("done"), MISSED("missed");

    companion object {
        fun fromWire(s: String) = if (s == "done") DONE else MISSED
    }
}

data class HabitLog(val habitId: String, val userId: String, val day: LocalDate, val status: LogStatus, val doneAt: Instant?)

/** `scheduleDays`: null = every day; otherwise 0 (Sunday) .. 6 (Saturday), exactly as stored in `habits.schedule_days`. */
data class Habit(
    val id: String,
    val title: String,
    val notes: String?,
    val createdBy: String,
    val isShared: Boolean,
    val ownerId: String?,
    val scheduleDays: Set<Int>?,
    val paused: Boolean,
    val startDate: LocalDate,
    val notifySecondUser: Boolean,
    val syncState: SyncState = SyncState.SYNCED,
)

data class Member(val id: String, val name: String, val role: String) {
    val firstName: String get() = name.trim().split(Regex("\\s+")).firstOrNull().orEmpty().ifEmpty { "Your partner" }
}

data class Quote(val id: String, val text: String, val author: String?)

/** Everything the signed-in person can see (the server's row level security scopes it to their workspace). */
data class Workspace(val id: String, val name: String, val members: List<Member>, val meId: String) {
    val partner: Member? get() = members.firstOrNull { it.id != meId }
    val me: Member? get() = members.firstOrNull { it.id == meId }
    fun nameOf(id: String?): String = when (id) {
        null -> "Someone"
        meId -> "You"
        else -> members.firstOrNull { it.id == id }?.firstName ?: "Your partner"
    }
}
