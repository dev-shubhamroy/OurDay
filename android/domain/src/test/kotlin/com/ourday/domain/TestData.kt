package com.ourday.domain

import com.ourday.domain.model.*
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

const val ME = "me"
const val PARTNER = "partner"
val IST: ZoneId = ZoneId.of("Asia/Kolkata")
/** Sun 8 Nov 2026, 15:30 IST. */
val NOW: Instant = ZonedDateTime.of(2026, 11, 8, 15, 30, 0, 0, IST).toInstant()
val TODAY: LocalDate = LocalDate.of(2026, 11, 8)

val WS = Workspace("ws1", "Ours", listOf(Member(ME, "Shubham Roy", "owner"), Member(PARTNER, "Aayushi Rao", "partner")), ME)

fun at(day: LocalDate, h: Int, m: Int = 0): Instant = ZonedDateTime.of(day, LocalTime.of(h, m), IST).toInstant()

fun deadline(id: String, title: String, due: Instant, by: String = ME, status: TaskStatus = TaskStatus.OPEN, doneBy: String? = null, doneAt: Instant? = null) = Task(
    id, TaskKind.DEADLINE, title, null, by, NOW.minusSeconds(86_400), false, due.atZone(IST).toLocalDate(), null, due, status, doneAt, doneBy,
)

fun daily(id: String, title: String, day: LocalDate = TODAY, time: LocalTime? = null, by: String = ME, status: TaskStatus = TaskStatus.OPEN, doneBy: String? = null, doneAt: Instant? = null) = Task(
    id, TaskKind.DAILY, title, null, by, NOW.minusSeconds(86_400), false, day, time, null, status, doneAt, doneBy,
)

fun habit(id: String = "h1", title: String = "Read", days: Set<Int>? = null, start: LocalDate = LocalDate.of(2026, 10, 1), shared: Boolean = false, owner: String? = ME, paused: Boolean = false) =
    Habit(id, title, null, ME, shared, if (shared) null else owner, days, paused, start, false)

fun done(user: String, vararg days: LocalDate, habitId: String = "h1"): Map<String, Map<LocalDate, HabitLog>> =
    mapOf(user to days.associateWith { HabitLog(habitId, user, it, LogStatus.DONE, at(it, 20)) })

fun logs(vararg parts: Map<String, Map<LocalDate, HabitLog>>): Map<String, Map<LocalDate, HabitLog>> =
    parts.fold(emptyMap()) { acc, m -> (acc.keys + m.keys).associateWith { (acc[it].orEmpty()) + (m[it].orEmpty()) } }
