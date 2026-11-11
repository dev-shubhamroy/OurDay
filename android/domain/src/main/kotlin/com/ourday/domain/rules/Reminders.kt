package com.ourday.domain.rules

import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import java.time.Duration
import java.time.Instant

/**
 * Deadline reminders are CREATED BY THE BACKEND (pg_cron -> notifications -> push). Android does not run a second
 * reminder engine. This mirrors the server's rule so the app can show "next reminder" and so the rules are tested:
 *   intervals 24h, 12h, 6h, 3h, 2h, 1h, 30m, 15m, 5m and the exact deadline;
 *   a reminder is skipped if its instant is before the schedule began (task created / deadline edited);
 *   nothing is scheduled for a completed task; nothing after the deadline.
 */
object Reminders {
    val INTERVAL_SECONDS: List<Long> = listOf(86_400, 43_200, 21_600, 10_800, 7_200, 3_600, 1_800, 900, 300, 0)

    data class Reminder(val at: Instant, val secondsBefore: Long) {
        val label: String get() = if (secondsBefore == 0L) "Deadline now" else "Due in " + labelFor(secondsBefore)
    }

    fun labelFor(seconds: Long): String = when {
        seconds >= 3600 -> "${seconds / 3600} ${if (seconds / 3600 == 1L) "hour" else "hours"}"
        else -> "${seconds / 60} minutes"
    }

    /** Reminders still to come for [task], given that its schedule began at [scheduleStart] and it is [now]. */
    fun upcoming(task: Task, scheduleStart: Instant, now: Instant): List<Reminder> {
        val due = task.dueAt ?: return emptyList()
        if (!task.isOpen || (task.kind != TaskKind.DEADLINE && task.kind != TaskKind.SHARED)) return emptyList()
        return INTERVAL_SECONDS.map { Reminder(due.minusSeconds(it), it) }
            .filter { !it.at.isBefore(scheduleStart) && it.at.isAfter(now) }
            .sortedBy { it.at }
    }

    fun next(task: Task, scheduleStart: Instant, now: Instant): Reminder? = upcoming(task, scheduleStart, now).firstOrNull()

    /** After a deadline edit the schedule restarts at the edit time and old reminders no longer apply. */
    fun afterEdit(task: Task, editedAt: Instant): List<Reminder> = upcoming(task, scheduleStart = editedAt, now = editedAt)

    fun remainingUntil(r: Reminder, now: Instant): Duration = Duration.between(now, r.at)
}
