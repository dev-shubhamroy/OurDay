package com.ourday.app

import com.ourday.app.data.db.HabitEntity
import com.ourday.app.data.db.TaskEntity
import com.ourday.app.data.db.daysToColumn
import com.ourday.app.data.db.toDomain
import com.ourday.app.data.remote.HabitDto
import com.ourday.app.data.remote.HabitLogDto
import com.ourday.app.data.remote.PrefsDto
import com.ourday.app.data.remote.QuoteDto
import com.ourday.app.data.remote.TaskDto
import com.ourday.app.data.repo.AuthRepository
import com.ourday.app.sync.SyncJson
import com.ourday.domain.model.SharedState
import com.ourday.domain.model.SyncState
import com.ourday.domain.model.TaskKind
import com.ourday.domain.sync.Op
import com.ourday.domain.sync.QueuedOp
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class AppLogicTest {
    private val wire = Json { ignoreUnknownKeys = true }

    @Test fun postgrestTaskRowsDecodeIncludingSharedTasksAndExtraColumns() {
        val json = """[{"id":"t1","kind":"shared","title":"Plan trip","notes":null,"created_by":"u1","notify_second_user":true,"task_date":"2026-11-09","planned_time":null,
            "due_at":null,"status":"open","completed_at":null,"completed_by":null,"created_at":"2026-11-09T08:00:00.123456+00:00","updated_at":"2026-11-09T08:00:01+00:00",
            "shared_state":"awaiting_approval","completion_requested_by":"u2","reminders_from":"2026-11-09T08:00:00+00:00","approved_by":null}]"""
        val t = wire.decodeFromString<List<TaskDto>>(json).single()
        assertEquals("shared", t.kind); assertEquals("awaiting_approval", t.sharedState); assertNull(t.dueAt)
    }

    @Test fun habitHabitLogAndQuoteRowsDecode() {
        val h = wire.decodeFromString<HabitDto>("""{"id":"h","title":"Read","notes":null,"created_by":"u","is_shared":false,"owner_id":"u","schedule_days":[1,3,5],"paused":false,"start_date":"2026-11-01","notify_second_user":false}""")
        assertEquals(listOf(1, 3, 5), h.scheduleDays)
        assertEquals("done", wire.decodeFromString<HabitLogDto>("""{"habit_id":"h","user_id":"u","day":"2026-11-08","status":"done","done_at":"2026-11-08T14:00:00+00:00"}""").status)
        assertNull(wire.decodeFromString<QuoteDto>("""{"id":"q","text":"Begin.","author":null,"created_at":"2026-11-09T10:00:00.5+00:00"}""").author)
        assertTrue(wire.decodeFromString<PrefsDto>("{}").master) // missing columns fall back to defaults
    }

    @Test fun entitiesMapToDomainAndBack() {
        val e = TaskEntity("t", "deadline", "Report", null, "u", 1_000, false, "2026-11-08", null, 1_800_000_000_000, "open", null, null, null, null, 5, "CONFLICT")
        val t = e.toDomain()
        assertEquals(TaskKind.DEADLINE, t.kind); assertEquals(SyncState.CONFLICT, t.syncState); assertEquals(5L, t.updatedAt?.toEpochMilli())
        assertEquals(SharedState.AWAITING_APPROVAL, e.copy(kind = "shared", sharedState = "awaiting_approval").toDomain().sharedState)
        val h = HabitEntity("h", "Read", null, "u", false, "u", "1,3,5", false, "2026-11-01", false).toDomain()
        assertEquals(setOf(1, 3, 5), h.scheduleDays)
        assertNull(HabitEntity("h", "Read", null, "u", false, "u", null, false, "2026-11-01", false).toDomain().scheduleDays)
    }

    @Test fun everyDayIsStoredAsNull() {
        assertNull(daysToColumn(null)); assertNull(daysToColumn(emptyList())); assertNull(daysToColumn((0..6).toList())); assertEquals("1,3,5", daysToColumn(listOf(5, 1, 3)))
    }

    @Test fun queuedOperationsRoundTripThroughTheStoredFormat() {
        val ops = listOf<Op>(
            Op.TaskInsert("t", "shared", "x", null, "u", 1, "2026-11-08", null, null, true),
            Op.TaskPatch("t", "deadline", title = "y", clearDue = false, base = mapOf("title" to "x")),
            Op.TaskComplete("t", true, 9), Op.TaskDelete("t"),
            Op.HabitInsert("h", "Read", null, "u", true, null, listOf(1, 2), "2026-11-01", true), Op.HabitPatch("h", paused = true), Op.HabitDelete("h"),
            Op.HabitLog("h", "u", "ws", "2026-11-08", null, 3),
        )
        ops.forEach { op ->
            val s = SyncJson.encodeToString(Op.serializer(), op)
            assertEquals(op, SyncJson.decodeFromString(Op.serializer(), s))
        }
        val q = QueuedOp("q", ops[2], 1)
        assertEquals(q, SyncJson.decodeFromString(QueuedOp.serializer(), SyncJson.encodeToString(QueuedOp.serializer(), q)))
    }

    @Test fun authErrorsAreFriendly() {
        assertEquals("Enter a valid email address.", AuthRepository.friendly(IllegalArgumentException("Enter a valid email address.")))
        assertTrue(AuthRepository.friendly(IOException("timeout")).contains("Can’t reach"))
        assertTrue(AuthRepository.friendly(RuntimeException("Invalid login credentials")).contains("don’t match"))
        assertTrue(AuthRepository.friendly(RuntimeException("User already registered")).contains("already exists"))
        assertEquals("Something went wrong. Please try again.", AuthRepository.friendly(RuntimeException("???")))
    }
}
