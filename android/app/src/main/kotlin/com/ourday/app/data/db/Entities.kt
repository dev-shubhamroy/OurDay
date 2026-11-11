package com.ourday.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val title: String,
    val notes: String?,
    val createdBy: String,
    val createdAtMs: Long,
    val notifySecondUser: Boolean,
    val date: String,
    val plannedTime: String?,
    val dueAtMs: Long?,
    val status: String,
    val completedAtMs: Long?,
    val completedBy: String?,
    val sharedState: String?,
    val completionRequestedBy: String?,
    val updatedAtMs: Long?,
    val syncState: String = "SYNCED",
)

@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey val id: String,
    val title: String,
    val notes: String?,
    val createdBy: String,
    val isShared: Boolean,
    val ownerId: String?,
    /** Comma separated weekday numbers (0 = Sunday); null = every day. */
    val scheduleDays: String?,
    val paused: Boolean,
    val startDate: String,
    val notifySecondUser: Boolean,
    val syncState: String = "SYNCED",
)

@Entity(tableName = "habit_logs", primaryKeys = ["habitId", "userId", "day"])
data class HabitLogEntity(val habitId: String, val userId: String, val day: String, val status: String, val doneAtMs: Long?)

@Entity(tableName = "members")
data class MemberEntity(@PrimaryKey val id: String, val name: String, val role: String)

@Entity(tableName = "workspace")
data class WorkspaceEntity(@PrimaryKey val id: String, val name: String, val meId: String)

@Entity(tableName = "quotes")
data class QuoteEntity(@PrimaryKey val id: String, val text: String, val author: String?, val createdAtMs: Long)

/** The persistent sync queue: one JSON-encoded op per row, in insertion order. */
@Entity(tableName = "op_queue")
data class QueuedOpEntity(
    @PrimaryKey(autoGenerate = true) val seq: Long = 0,
    val qid: String,
    val json: String,
    val createdAtMs: Long,
    val attempts: Int,
    val lastError: String?,
)

/** Failed / conflicting changes stay visible until the person dismisses them (a pull must not hide them). */
@Entity(tableName = "sync_issues")
data class SyncIssueEntity(@PrimaryKey val entity: String, val state: String, val message: String?, val atMs: Long)
