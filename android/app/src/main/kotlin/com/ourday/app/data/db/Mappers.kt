package com.ourday.app.data.db

import com.ourday.domain.model.*
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

fun TaskEntity.toDomain() = Task(
    id = id, kind = TaskKind.fromWire(kind), title = title, notes = notes, createdBy = createdBy, createdAt = Instant.ofEpochMilli(createdAtMs),
    notifySecondUser = notifySecondUser, date = LocalDate.parse(date), plannedTime = plannedTime?.let { LocalTime.parse(it.take(5)) },
    dueAt = dueAtMs?.let(Instant::ofEpochMilli), status = TaskStatus.fromWire(status), completedAt = completedAtMs?.let(Instant::ofEpochMilli),
    completedBy = completedBy, sharedState = SharedState.fromWire(sharedState), completionRequestedBy = completionRequestedBy,
    updatedAt = updatedAtMs?.let(Instant::ofEpochMilli), syncState = runCatching { SyncState.valueOf(syncState) }.getOrDefault(SyncState.SYNCED),
)

fun HabitEntity.toDomain() = Habit(
    id = id, title = title, notes = notes, createdBy = createdBy, isShared = isShared, ownerId = ownerId,
    scheduleDays = scheduleDays?.split(',')?.mapNotNull { it.trim().toIntOrNull() }?.toSet(), paused = paused, startDate = LocalDate.parse(startDate),
    notifySecondUser = notifySecondUser, syncState = runCatching { SyncState.valueOf(syncState) }.getOrDefault(SyncState.SYNCED),
)

fun HabitLogEntity.toDomain() = HabitLog(habitId, userId, LocalDate.parse(day), LogStatus.fromWire(status), doneAtMs?.let(Instant::ofEpochMilli))
fun MemberEntity.toDomain() = Member(id, name, role)
fun QuoteEntity.toDomain() = Quote(id, text, author)

/** A 7-day or empty selection means "every day" (the database stores NULL). */
fun daysToColumn(days: Collection<Int>?): String? = days?.takeIf { it.isNotEmpty() && it.size < 7 }?.sorted()?.joinToString(",")
