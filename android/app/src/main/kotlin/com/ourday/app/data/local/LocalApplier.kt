package com.ourday.app.data.local

import com.ourday.app.data.db.HabitEntity
import com.ourday.app.data.db.HabitLogEntity
import com.ourday.app.data.db.OurDayDatabase
import com.ourday.app.data.db.TaskEntity
import com.ourday.app.data.db.daysToColumn
import com.ourday.domain.sync.Op
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Applies an op to the local database right away (optimistic UI), and re-applies the whole queue on top of every server pull,
 * so unsynced work never disappears from the screen. Room = server snapshot + pending queue.
 */
@Singleton
class LocalApplier @Inject constructor(private val db: OurDayDatabase) {
    private val tasks get() = db.tasks()
    private val habits get() = db.habits()

    suspend fun apply(op: Op, meId: String) {
        when (op) {
            is Op.TaskInsert -> tasks.upsert(
                TaskEntity(
                    id = op.id, kind = op.kind, title = op.title, notes = op.notes, createdBy = op.createdBy, createdAtMs = op.createdAtMs,
                    notifySecondUser = op.notifySecondUser, date = op.date, plannedTime = op.plannedTime, dueAtMs = op.dueAtMs, status = "open",
                    completedAtMs = null, completedBy = null, sharedState = if (op.kind == "shared") "active" else null, completionRequestedBy = null,
                    updatedAtMs = null, syncState = "PENDING",
                ),
            )
            is Op.TaskPatch -> tasks.get(op.id)?.let { t ->
                val opNotes = op.notes
                tasks.upsert(
                    t.copy(
                        title = op.title ?: t.title, notes = if (opNotes != null) opNotes.ifBlank { null } else t.notes, date = op.date ?: t.date,
                        plannedTime = if (op.clearPlannedTime) null else op.plannedTime ?: t.plannedTime,
                        dueAtMs = if (op.clearDue) null else op.dueAtMs ?: t.dueAtMs, notifySecondUser = op.notifySecondUser ?: t.notifySecondUser,
                        // a deadline's day follows its instant in the viewer's zone
                        syncState = "PENDING",
                    ).let { u -> if (op.dueAtMs != null && u.kind != "daily" && op.date == null) u.copy(date = Instant.ofEpochMilli(op.dueAtMs!!).atZone(ZoneId.systemDefault()).toLocalDate().toString()) else u },
                )
            }
            is Op.TaskComplete -> tasks.get(op.id)?.let { t ->
                tasks.upsert(
                    if (op.completed) t.copy(status = "completed", completedAtMs = op.atMs, completedBy = meId, syncState = "PENDING")
                    else t.copy(status = "open", completedAtMs = null, completedBy = null, syncState = "PENDING"),
                )
            }
            is Op.TaskDelete -> tasks.delete(op.id)
            is Op.HabitInsert -> habits.upsert(
                HabitEntity(op.id, op.title, op.notes, op.createdBy, op.isShared, op.ownerId, daysToColumn(op.scheduleDays), false, op.startDate, op.notifySecondUser, "PENDING"),
            )
            is Op.HabitPatch -> habits.get(op.id)?.let { h ->
                val opNotes = op.notes
                habits.upsert(
                    h.copy(
                        title = op.title ?: h.title, notes = if (opNotes != null) opNotes.ifBlank { null } else h.notes, paused = op.paused ?: h.paused,
                        notifySecondUser = op.notifySecondUser ?: h.notifySecondUser,
                        scheduleDays = if (op.everyDay) null else op.scheduleDays?.let(::daysToColumn) ?: h.scheduleDays, syncState = "PENDING",
                    ),
                )
            }
            is Op.HabitDelete -> { habits.deleteLogsOf(op.id); habits.delete(op.id) }
            is Op.HabitLog -> {
                val st = op.status
                if (st == null) habits.deleteLog(op.habitId, op.userId, op.day)
                else habits.upsertLog(HabitLogEntity(op.habitId, op.userId, op.day, st, if (st == "done") op.atMs else null))
            }
        }
    }
}
