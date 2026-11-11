package com.ourday.domain

import com.ourday.domain.model.*
import com.ourday.domain.rules.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class RemindersTest {
    private val due = at(LocalDate.of(2030, 1, 5), 1, 3).let { ZonedDateTime.of(2030, 1, 5, 1, 3, 0, 0, IST).toInstant() }
    private val task = deadline("t", "Report", due)
    private fun offsets(start: java.time.Instant, now: java.time.Instant) = Reminders.upcoming(task, start, now).map { it.secondsBefore }

    @Test fun createdSixMinutesBefore_onlyFiveMinutesAndExact() = assertEquals(listOf(300L, 0L), offsets(due.minusSeconds(360), due.minusSeconds(360)))
    @Test fun createdTwentyMinutesBefore() = assertEquals(listOf(900L, 300L, 0L), offsets(due.minusSeconds(1200), due.minusSeconds(1200)))
    @Test fun createdFortyMinutesBefore() = assertEquals(listOf(1800L, 900L, 300L, 0L), offsets(due.minusSeconds(2400), due.minusSeconds(2400)))
    @Test fun createdTwoDaysBefore_allTen() = assertEquals(Reminders.INTERVAL_SECONDS, offsets(due.minus(Duration.ofDays(2)), due.minus(Duration.ofDays(2))))
    @Test fun pastRemindersAreNeverReplayed() = assertEquals(listOf(300L, 0L), offsets(due.minus(Duration.ofDays(2)), due.minusSeconds(400)))
    @Test fun nothingAfterTheDeadline() = assertTrue(offsets(due.minus(Duration.ofDays(2)), due.plusSeconds(1)).isEmpty())
    @Test fun completedTaskHasNoReminders() = assertTrue(Reminders.upcoming(task.copy(status = TaskStatus.COMPLETED), due.minusSeconds(9999), due.minusSeconds(9999)).isEmpty())
    @Test fun dailyTasksHaveNoReminders() = assertTrue(Reminders.upcoming(daily("d", "x"), NOW, NOW).isEmpty())
    @Test fun editRestartsTheScheduleFromTheEditTime() {
        val editedAt = due.minusSeconds(3000)
        val moved = task.copy(dueAt = due.plusSeconds(25 * 60))
        // new deadline = old + 25m (75 min after the edit): 2h is before the edit (skipped), 1h and later are still ahead
        assertEquals(listOf(3600L, 1800L, 900L, 300L, 0L), Reminders.afterEdit(moved, editedAt).map { it.secondsBefore })
    }
    @Test fun labelsMatchTheServer() {
        assertEquals("Due in 24 hours", Reminders.Reminder(due, 86_400).label)
        assertEquals("Due in 1 hour", Reminders.Reminder(due, 3_600).label)
        assertEquals("Due in 5 minutes", Reminders.Reminder(due, 300).label)
        assertEquals("Deadline now", Reminders.Reminder(due, 0).label)
    }
    @Test fun nextReminder() = assertEquals(300L, Reminders.next(task, due.minusSeconds(600), due.minusSeconds(310))?.secondsBefore)
}

class TaskRulesTest {
    private val today = TODAY
    private val tasks = listOf(
        deadline("d1", "Today late", at(today, 23, 0)), deadline("d2", "Today early", at(today, 18, 0)),
        deadline("t1", "Tomorrow", at(today.plusDays(1), 10)), deadline("x1", "Expired", at(today, 9)),
        deadline("f1", "Far", at(today.plusDays(5), 9)), daily("p1", "Plan A", time = LocalTime.of(9, 0)), daily("p2", "Plan B", today.plusDays(2)),
        deadline("c1", "Done today", at(today, 12), status = TaskStatus.COMPLETED, doneBy = ME, doneAt = at(today, 11)),
    )
    @Test fun todayAndTomorrowAreSeparateGroups() {
        assertEquals(listOf("c1", "d2", "d1").sorted(), TaskRules.todayDeadlines(tasks, today, NOW, IST).map { it.id }.sorted())
        assertEquals(listOf("t1"), TaskRules.tomorrowDeadlines(tasks, today, NOW, IST).map { it.id })
    }
    @Test fun todayDeadlinesAreOrderedByDueTime() = assertEquals(listOf("c1", "d2", "d1"), TaskRules.todayDeadlines(tasks, today, NOW, IST).map { it.id })
    @Test fun expiredOpenDeadlinesLeaveTodayAndBecomeOverdue() {
        assertFalse(TaskRules.todayDeadlines(tasks, today, NOW, IST).any { it.id == "x1" })
        assertTrue(TaskRules.overdue(tasks, today, NOW).any { it.id == "x1" })
    }
    @Test fun upcomingSkipsTodayAndTomorrow() = assertEquals(listOf("p2", "f1"), TaskRules.upcoming(tasks, today, NOW, IST).map { it.id })
    @Test fun dailyTasksOfTodayOnly() = assertEquals(listOf("p1"), TaskRules.todayTasks(tasks, today).map { it.id })
    @Test fun deadlineDayFollowsTheViewersTimeZone() {
        val t = deadline("z", "z", ZonedDateTime.of(2026, 11, 8, 23, 30, 0, 0, ZoneId.of("UTC")).toInstant())
        assertEquals(LocalDate.of(2026, 11, 9), TaskRules.deadlineDay(t, IST)) // 05:00 IST next day
        assertEquals(LocalDate.of(2026, 11, 8), TaskRules.deadlineDay(t, ZoneId.of("UTC")))
    }
    @Test fun filtersAndSorting() {
        val mixed = tasks + deadline("pt", "Partner task", at(today, 22), by = PARTNER)
        assertTrue(TaskRules.list(mixed, ME, TaskRules.StatusFilter.OPEN, TaskRules.KindFilter.ALL, TaskRules.OwnerFilter.MINE, TaskRules.Sort.DATE).none { it.createdBy == PARTNER || !it.isOpen })
        assertEquals(listOf("pt"), TaskRules.list(mixed, ME, TaskRules.StatusFilter.ALL, TaskRules.KindFilter.ALL, TaskRules.OwnerFilter.PARTNER, TaskRules.Sort.TITLE).map { it.id })
        assertEquals(listOf("c1"), TaskRules.list(mixed, ME, TaskRules.StatusFilter.COMPLETED, TaskRules.KindFilter.ALL, TaskRules.OwnerFilter.BOTH, TaskRules.Sort.TITLE).map { it.id })
        assertTrue(TaskRules.list(mixed, ME, TaskRules.StatusFilter.OPEN, TaskRules.KindFilter.DAILY, TaskRules.OwnerFilter.BOTH, TaskRules.Sort.TITLE).all { it.kind == TaskKind.DAILY })
    }
    @Test fun sharedTasksNeverAppearInPersonalLists() {
        val shared = daily("s", "Shared").copy(kind = TaskKind.SHARED)
        assertTrue(TaskRules.list(listOf(shared), ME, TaskRules.StatusFilter.ALL, TaskRules.KindFilter.ALL, TaskRules.OwnerFilter.BOTH, TaskRules.Sort.DATE).isEmpty())
        assertEquals(1, TaskRules.ownedBy(listOf(shared), PARTNER).size) // visible in Partner's view as well
    }
    @Test fun urgencyThresholds() {
        fun u(h: Long) = UrgencyRules.of(deadline("u", "u", NOW.plus(Duration.ofHours(h))), NOW)
        assertEquals(Urgency.CRITICAL, u(3)); assertEquals(Urgency.APPROACHING, u(8)); assertEquals(Urgency.NORMAL, u(9))
        assertEquals(Urgency.OVERDUE, UrgencyRules.of(deadline("u", "u", NOW.minusSeconds(1)), NOW))
        assertEquals(Urgency.DONE, UrgencyRules.of(deadline("u", "u", NOW.minusSeconds(1), status = TaskStatus.COMPLETED), NOW))
        assertEquals("2h 14m left", UrgencyRules.remainingText(Duration.ofMinutes(134))); assertEquals("35m left", UrgencyRules.remainingText(Duration.ofMinutes(35)))
        assertEquals("3d 4h left", UrgencyRules.remainingText(Duration.ofHours(76))); assertEquals("Time is up", UrgencyRules.remainingText(Duration.ZERO))
    }
}

class HabitRulesTest {
    private val sunday = TODAY // 8 Nov 2026 is a Sunday
    private fun d(n: Long) = sunday.minusDays(n)
    private val memberIds = listOf(ME, PARTNER)

    @Test fun weekdayConvention() { assertEquals(0, HabitRules.weekday(sunday)); assertEquals(1, HabitRules.weekday(sunday.plusDays(1))); assertEquals(6, HabitRules.weekday(sunday.minusDays(1))) }
    @Test fun unscheduledDaysAreOffNeverMissed() {
        val h = habit(days = setOf(1, 3, 5)) // Mon Wed Fri
        assertEquals(DayState.OFF, HabitRules.dayState(h, ME, d(1), sunday, emptyMap())) // Saturday
        assertEquals(DayState.MISSED, HabitRules.dayState(h, ME, d(2), sunday, emptyMap())) // Friday, nothing logged
    }
    @Test fun aScheduledPastDayWithoutCompletionStaysMissed() = assertEquals(DayState.MISSED, HabitRules.dayState(habit(), ME, d(3), sunday, emptyMap()))
    @Test fun aMissDoesNotBlockTheNextOccurrence() {
        val l = done(ME, d(0)) // yesterday missed, today done
        assertEquals(DayState.MISSED, HabitRules.dayState(habit(), ME, d(1), sunday, l))
        assertEquals(DayState.DONE, HabitRules.dayState(habit(), ME, d(0), sunday, l))
        val tomorrow = sunday.plusDays(1)
        assertEquals(DayState.PENDING, HabitRules.dayState(habit(), ME, tomorrow, sunday, l)) // fresh occurrence, not blocked
    }
    @Test fun completingYesterdayNeverOverwritesToday() {
        val l = done(ME, d(1))
        assertEquals(DayState.DONE, HabitRules.dayState(habit(), ME, d(1), sunday, l))
        assertEquals(DayState.PENDING, HabitRules.dayState(habit(), ME, sunday, sunday, l))
    }
    @Test fun daysBeforeTheStartDateAreOff() = assertEquals(DayState.OFF, HabitRules.dayState(habit(start = d(0)), ME, d(1), sunday, emptyMap()))
    @Test fun streakCountsConsecutiveScheduledDays() {
        assertEquals(3, HabitRules.streak(habit(), ME, sunday, done(ME, d(0), d(1), d(2))))
        assertEquals(2, HabitRules.streak(habit(), ME, sunday, done(ME, d(0), d(1), d(3)))) // d(2) missed breaks it
    }
    @Test fun todaysPendingNeitherCountsNorBreaks() = assertEquals(2, HabitRules.streak(habit(), ME, sunday, done(ME, d(1), d(2))))
    @Test fun unscheduledDaysDoNotBreakTheStreak() {
        val h = habit(days = setOf(1, 3, 5)) // Mon Wed Fri
        val fri = d(2); val wed = d(4); val mon = d(6)
        assertEquals(3, HabitRules.streak(h, ME, sunday, done(ME, fri, wed, mon)))
    }
    @Test fun longestStreakAndRate() {
        val l = done(ME, d(9), d(8), d(7), d(6), d(2), d(1))
        assertEquals(4, HabitRules.longestStreak(habit(), ME, sunday, l))
        assertNotNull(HabitRules.completionRate(habit(), ME, sunday, l, 10))
        assertNull(HabitRules.completionRate(habit(days = emptySet()), ME, sunday, l))
    }
    @Test fun sharedHabitCompletionIsIndependentPerPerson() {
        val h = habit(shared = true)
        val l = done(PARTNER, d(0))
        assertEquals(DayState.DONE, HabitRules.dayState(h, PARTNER, sunday, sunday, l))
        assertEquals(DayState.PENDING, HabitRules.dayState(h, ME, sunday, sunday, l))
        assertEquals(0, HabitRules.streak(h, ME, sunday, l))
    }
    @Test fun scopeAndPermissions() {
        assertEquals(HabitScope.PERSONAL, HabitRules.scope(habit(), memberIds, ME))
        assertEquals(HabitScope.PARTNER, HabitRules.scope(habit(owner = PARTNER), memberIds, ME))
        assertEquals(HabitScope.SHARED, HabitRules.scope(habit(shared = true), memberIds, ME))
        assertFalse(HabitRules.canManage(habit(owner = PARTNER), memberIds, ME)) // partner's personal habit is read-only
        assertTrue(HabitRules.canManage(habit(shared = true), memberIds, ME))
    }
    @Test fun todaysHabitsRespectPauseStartAndSchedule() {
        val hs = listOf(habit("a"), habit("b", paused = true), habit("c", days = setOf(1)), habit("d", start = sunday.plusDays(1)), habit("e", owner = PARTNER))
        assertEquals(listOf("a"), HabitRules.todays(hs, memberIds, ME, sunday).map { it.id })
    }
    @Test fun historyKeepsScheduledDaysNewestFirst() {
        val h = habit(days = setOf(1, 3, 5))
        val hist = HabitRules.history(h, ME, sunday, done(ME, d(2)), 14)
        assertTrue(hist.all { it.state != DayState.OFF }); assertEquals(d(2), hist.first().day); assertEquals(DayState.DONE, hist.first().state)
    }
    @Test fun scheduleLabels() {
        assertEquals("Every day", HabitRules.scheduleLabel(habit())); assertEquals("Weekdays", HabitRules.scheduleLabel(habit(days = setOf(1, 2, 3, 4, 5))))
        assertEquals("Weekends", HabitRules.scheduleLabel(habit(days = setOf(0, 6)))); assertEquals("Mon, Wed, Fri", HabitRules.scheduleLabel(habit(days = setOf(1, 3, 5))))
    }
}

class CheckInTest {
    private val memberIds = listOf(ME, PARTNER)
    @Test fun nextCheckInIsTodayAt2130BeforeThatTime() {
        val n = CheckIn.nextAt(ZonedDateTime.of(2026, 11, 8, 20, 0, 0, 0, IST))
        assertEquals(ZonedDateTime.of(2026, 11, 8, 21, 30, 0, 0, IST), n)
    }
    @Test fun nextCheckInIsTomorrowAfterThatTime() {
        assertEquals(ZonedDateTime.of(2026, 11, 9, 21, 30, 0, 0, IST), CheckIn.nextAt(ZonedDateTime.of(2026, 11, 8, 21, 30, 0, 0, IST)))
        assertEquals(ZonedDateTime.of(2026, 11, 9, 21, 30, 0, 0, IST), CheckIn.nextAt(ZonedDateTime.of(2026, 11, 8, 23, 59, 0, 0, IST)))
    }
    @Test fun timeZoneChangeRecomputesInTheNewZone() {
        val ny = ZoneId.of("America/New_York")
        val n = CheckIn.nextAfterZoneChange(NOW, ny) // 15:30 IST = 05:00 New York (same day) -> 21:30 New York today
        assertEquals(ny, n.zone); assertEquals(21, n.hour); assertEquals(30, n.minute); assertEquals(8, n.dayOfMonth)
    }
    @Test fun survivesDaylightSavingChange() {
        val ny = ZoneId.of("America/New_York")
        val n = CheckIn.nextAt(ZonedDateTime.of(2026, 11, 1, 12, 0, 0, 0, ny)) // DST ends 1 Nov 2026
        assertEquals(21, n.hour); assertEquals(30, n.minute)
    }
    @Test fun asksOnlyAboutScheduledUnansweredHabits() {
        val hs = listOf(habit("a"), habit("b"), habit("c", days = setOf(1)), habit("d", paused = true))
        val l = mapOf("b" to done(ME, TODAY, habitId = "b"))
        assertEquals(listOf("a"), CheckIn.toAsk(hs, memberIds, ME, TODAY, l).map { it.id })
    }
    @Test fun explicitlyMissedIsNotAskedAgain() {
        val missed = mapOf(ME to mapOf(TODAY to HabitLog("a", ME, TODAY, LogStatus.MISSED, null)))
        assertTrue(CheckIn.toAsk(listOf(habit("a")), memberIds, ME, TODAY, mapOf("a" to missed)).isEmpty())
    }
    @Test fun answersAreIdempotentAndNeverDowngrade() {
        assertEquals(LogStatus.DONE, CheckIn.resolve(CheckIn.Answer.YES, null))
        assertEquals(LogStatus.MISSED, CheckIn.resolve(CheckIn.Answer.NO, null))
        assertNull(CheckIn.resolve(CheckIn.Answer.NO, LogStatus.DONE)) // already completed: not downgraded
        assertNull(CheckIn.resolve(CheckIn.Answer.YES, LogStatus.DONE))
        assertNull(CheckIn.resolve(CheckIn.Answer.NO, LogStatus.MISSED))
        assertEquals(LogStatus.DONE, CheckIn.resolve(CheckIn.Answer.YES, LogStatus.MISSED)) // changed their mind
    }
    @Test fun noAnswerByMidnightCountsAsMissed() {
        val h = habit()
        assertEquals(DayState.PENDING, HabitRules.dayState(h, ME, TODAY, TODAY, emptyMap()))
        assertEquals(DayState.MISSED, HabitRules.dayState(h, ME, TODAY, TODAY.plusDays(1), emptyMap())) // the next day it is missed, nothing written
    }
    @Test fun dueFrom2130() {
        assertFalse(CheckIn.isDue(ZonedDateTime.of(2026, 11, 8, 21, 29, 0, 0, IST))); assertTrue(CheckIn.isDue(ZonedDateTime.of(2026, 11, 8, 21, 30, 0, 0, IST)))
    }
}
