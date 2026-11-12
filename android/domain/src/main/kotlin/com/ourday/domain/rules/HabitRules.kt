package com.ourday.domain.rules

import com.ourday.domain.model.Habit
import com.ourday.domain.model.HabitLog
import com.ourday.domain.model.LogStatus
import java.time.DayOfWeek
import java.time.LocalDate

enum class DayState { DONE, MISSED, PENDING, OFF }
enum class HabitScope { PERSONAL, PARTNER, SHARED }

/** One habit's logs: user -> day -> entry. Each person's rows stay separate; completing yours never touches theirs. */
typealias HabitLogs = Map<String, Map<LocalDate, HabitLog>>

/**
 * The habit occurrence rules (port of frontend/src/services/habits.ts and the Mac HabitRules):
 *  - each scheduled day is its own occurrence; unscheduled days are OFF (never "missed");
 *  - a scheduled PAST day without a completion is MISSED and stays in the history;
 *  - a miss never blocks the next scheduled occurrence: the next day is evaluated fresh;
 *  - a streak is consecutive completed scheduled days, a miss breaks it, unscheduled days and today's pending do not.
 */
object HabitRules {
    /** 0 = Sunday .. 6 = Saturday (the database's convention). */
    fun weekday(d: LocalDate): Int = d.dayOfWeek.value % 7

    fun isScheduled(h: Habit, day: LocalDate): Boolean = h.scheduleDays == null || weekday(day) in h.scheduleDays

    fun participants(h: Habit, memberIds: List<String>): List<String> = if (h.isShared) memberIds else listOfNotNull(h.ownerId)

    fun scope(h: Habit, memberIds: List<String>, me: String): HabitScope {
        val p = participants(h, memberIds)
        return when {
            p.size > 1 -> HabitScope.SHARED
            p.firstOrNull() == me -> HabitScope.PERSONAL
            else -> HabitScope.PARTNER
        }
    }

    /** A partner's personal habit is read-only; shared and your own habits can be edited by either person. */
    fun canManage(h: Habit, memberIds: List<String>, me: String): Boolean = scope(h, memberIds, me) != HabitScope.PARTNER

    fun entry(logs: HabitLogs, user: String, day: LocalDate): HabitLog? = logs[user]?.get(day)

    fun dayState(h: Habit, user: String, day: LocalDate, today: LocalDate, logs: HabitLogs): DayState {
        if (day < h.startDate || !isScheduled(h, day)) return DayState.OFF
        val e = entry(logs, user, day)
        if (e?.status == LogStatus.DONE) return DayState.DONE
        if (day >= today) return if (e?.status == LogStatus.MISSED) DayState.MISSED else DayState.PENDING
        return DayState.MISSED // a scheduled past day nobody completed counts as missed ("no answer by midnight")
    }

    fun streak(h: Habit, user: String, today: LocalDate, logs: HabitLogs): Int {
        var s = 0
        var day = today
        var guard = 0
        while (day >= h.startDate && guard++ < 4000) {
            when (dayState(h, user, day, today, logs)) {
                DayState.DONE -> s++
                DayState.MISSED -> return s
                else -> Unit
            }
            day = day.minusDays(1)
        }
        return s
    }

    fun longestStreak(h: Habit, user: String, today: LocalDate, logs: HabitLogs): Int {
        var best = 0
        var run = 0
        var day = h.startDate
        while (day <= today) {
            when (dayState(h, user, day, today, logs)) {
                DayState.DONE -> { run++; best = maxOf(best, run) }
                DayState.MISSED -> run = 0
                else -> Unit
            }
            day = day.plusDays(1)
        }
        return best
    }

    /** Share of scheduled, already-decided days completed in the last [days] days (null if none were scheduled). */
    fun completionRate(h: Habit, user: String, today: LocalDate, logs: HabitLogs, days: Int = 30): Int? {
        var done = 0
        var total = 0
        for (i in 0 until days) {
            when (dayState(h, user, today.minusDays(i.toLong()), today, logs)) {
                DayState.DONE -> { done++; total++ }
                DayState.MISSED -> total++
                else -> Unit
            }
        }
        return if (total == 0) null else done * 100 / total
    }

    /** Habits this person takes part in that are scheduled today (not paused, already started). */
    fun todays(habits: List<Habit>, memberIds: List<String>, user: String, today: LocalDate): List<Habit> =
        habits.filter { !it.paused && user in participants(it, memberIds) && isScheduled(it, today) && today >= it.startDate }

    data class Occurrence(val day: LocalDate, val state: DayState, val doneAt: java.time.Instant?)

    /** Newest first; only scheduled days (an unscheduled day is not an occurrence). Historical days stay accessible. */
    fun history(h: Habit, user: String, today: LocalDate, logs: HabitLogs, days: Int = 60): List<Occurrence> =
        (0 until days).map { today.minusDays(it.toLong()) }
            .filter { it >= h.startDate }
            .map { d -> Occurrence(d, dayState(h, user, d, today, logs), entry(logs, user, d)?.doneAt) }
            .filter { it.state != DayState.OFF }

    /** Habits screen summary for one person: how many of today's habits are done, and the best (longest) streak across their habits. */
    data class Summary(val done: Int, val total: Int, val bestStreak: Int)

    fun summary(habits: List<Habit>, memberIds: List<String>, user: String, today: LocalDate, logs: Map<String, HabitLogs>): Summary {
        val mine = habits.filter { user in participants(it, memberIds) }
        val todays = todays(mine, memberIds, user, today)
        val done = todays.count { dayState(it, user, today, today, logs[it.id].orEmpty()) == DayState.DONE }
        val best = mine.maxOfOrNull { longestStreak(it, user, today, logs[it.id].orEmpty()) } ?: 0
        return Summary(done, todays.size, best)
    }

    /** The seven days (Monday to Sunday) of the week containing [today], with each day's real state for [user]. */
    fun week(h: Habit, user: String, today: LocalDate, logs: HabitLogs): List<Occurrence> {
        val monday = today.minusDays((today.dayOfWeek.value - 1).toLong())
        return (0..6).map { monday.plusDays(it.toLong()) }.map { d -> Occurrence(d, dayState(h, user, d, today, logs), entry(logs, user, d)?.doneAt) }
    }

    fun scheduleLabel(h: Habit): String {
        val d = h.scheduleDays ?: return "Every day"
        if (d.size == 7) return "Every day"
        if (d == setOf(1, 2, 3, 4, 5)) return "Weekdays"
        if (d == setOf(0, 6)) return "Weekends"
        return listOf(1, 2, 3, 4, 5, 6, 0).filter { it in d }.joinToString(", ") { DayOfWeek.of(if (it == 0) 7 else it).name.take(3).lowercase().replaceFirstChar(Char::uppercase) }
    }
}
