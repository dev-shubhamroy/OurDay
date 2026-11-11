package com.ourday.domain.rules

import com.ourday.domain.model.Habit
import com.ourday.domain.model.LogStatus
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * The 9:30 PM habit check-in (local device time):
 *   Yes -> done; No -> missed; no answer by midnight -> missed (derived by [HabitRules.dayState], nothing is written);
 *   never asked again once answered; follows the device's time zone, including after it changes.
 * Android cannot promise exact delivery time (Doze, OEM battery limits): the scheduler is best-effort.
 */
object CheckIn {
    val TIME: LocalTime = LocalTime.of(21, 30)

    /** The next 21:30 strictly after [now] in [now]'s own zone (DST-safe: built from local date + time). */
    fun nextAt(now: ZonedDateTime): ZonedDateTime {
        val todayAt = ZonedDateTime.of(now.toLocalDate(), TIME, now.zone)
        return if (now.isBefore(todayAt)) todayAt else ZonedDateTime.of(now.toLocalDate().plusDays(1), TIME, now.zone)
    }

    /** Recomputes the schedule after the time zone changed: same rule, new zone. */
    fun nextAfterZoneChange(now: java.time.Instant, newZone: ZoneId): ZonedDateTime = nextAt(now.atZone(newZone))

    /** Scheduled habits for today that this person hasn't answered yet (neither done nor explicitly missed). `logs`: habitId -> that habit's logs. */
    fun toAsk(habits: List<Habit>, memberIds: List<String>, user: String, today: LocalDate, logs: Map<String, HabitLogs>): List<Habit> =
        HabitRules.todays(habits, memberIds, user, today).filter { h -> logs[h.id]?.get(user)?.get(today) == null }

    enum class Answer { YES, NO }

    /** What to write for an answer given the current log, or null when nothing should change (idempotent, never downgrades). */
    fun resolve(answer: Answer, current: LogStatus?): LogStatus? = when {
        current == LogStatus.DONE -> null
        answer == Answer.YES -> LogStatus.DONE
        current == LogStatus.MISSED -> null
        else -> LogStatus.MISSED
    }

    fun isDue(now: ZonedDateTime): Boolean = !now.toLocalTime().isBefore(TIME)
}
