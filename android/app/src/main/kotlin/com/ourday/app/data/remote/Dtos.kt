package com.ourday.app.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Rows exactly as PostgREST returns them (the existing OurDay schema; Android adds no tables or columns). */
@Serializable
data class TaskDto(
    val id: String, val kind: String, val title: String, val notes: String? = null,
    @SerialName("created_by") val createdBy: String, @SerialName("notify_second_user") val notifySecondUser: Boolean = false,
    @SerialName("task_date") val taskDate: String, @SerialName("planned_time") val plannedTime: String? = null,
    @SerialName("due_at") val dueAt: String? = null, val status: String = "open",
    @SerialName("completed_at") val completedAt: String? = null, @SerialName("completed_by") val completedBy: String? = null,
    @SerialName("created_at") val createdAt: String, @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("shared_state") val sharedState: String? = null, @SerialName("completion_requested_by") val completionRequestedBy: String? = null,
)

@Serializable
data class HabitDto(
    val id: String, val title: String, val notes: String? = null, @SerialName("created_by") val createdBy: String,
    @SerialName("is_shared") val isShared: Boolean, @SerialName("owner_id") val ownerId: String? = null,
    @SerialName("schedule_days") val scheduleDays: List<Int>? = null, val paused: Boolean = false,
    @SerialName("start_date") val startDate: String, @SerialName("notify_second_user") val notifySecondUser: Boolean = false,
)

@Serializable
data class HabitLogDto(
    @SerialName("habit_id") val habitId: String, @SerialName("user_id") val userId: String, val day: String, val status: String,
    @SerialName("done_at") val doneAt: String? = null,
)

@Serializable
data class MemberDto(@SerialName("user_id") val userId: String, val role: String, @SerialName("workspace_id") val workspaceId: String)

@Serializable data class ProfileDto(val id: String, val name: String)
@Serializable data class WorkspaceDto(val id: String, val name: String)

@Serializable
data class QuoteDto(val id: String, val text: String, val author: String? = null, @SerialName("created_at") val createdAt: String? = null)

@Serializable
data class PrefsDto(
    val master: Boolean = true, val deadlines: Boolean = true, val habits: Boolean = true, val partner: Boolean = true,
    @SerialName("unlock_briefing") val unlockBriefing: Boolean = true, val timezone: String = "UTC",
)

@Serializable
data class PrefsUpsert(
    @SerialName("user_id") val userId: String, val master: Boolean, val deadlines: Boolean, val habits: Boolean, val partner: Boolean,
    @SerialName("unlock_briefing") val unlockBriefing: Boolean, val timezone: String,
)

@Serializable
data class HabitLogUpsert(
    @SerialName("habit_id") val habitId: String, @SerialName("user_id") val userId: String, @SerialName("workspace_id") val workspaceId: String,
    val day: String, val status: String,
)
