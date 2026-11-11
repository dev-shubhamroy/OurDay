package com.ourday.domain

import com.ourday.domain.model.*
import com.ourday.domain.rana.*
import com.ourday.domain.rules.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalTime

class PartnerModeTest {
    private val ids = listOf(ME, PARTNER)
    private val tasks = listOf(
        daily("m1", "Mine"), daily("p1", "Partner's", by = PARTNER), deadline("md", "My deadline", at(TODAY, 20)), deadline("pd", "Partner deadline", at(TODAY, 21), by = PARTNER),
        daily("s1", "Shared", by = PARTNER).copy(kind = TaskKind.SHARED), daily("s2", "Shared mine").copy(kind = TaskKind.SHARED),
    )
    private val habits = listOf(habit("a", owner = ME), habit("b", owner = PARTNER), habit("c", shared = true))

    @Test fun myModeShowsMyPersonalTasksOnly() = assertEquals(listOf("m1", "md"), ViewRules.tasksFor(tasks, ME).map { it.id })
    @Test fun partnerModeShowsThePartnersPersonalTasksOnly() = assertEquals(listOf("p1", "pd"), ViewRules.tasksFor(tasks, PARTNER).map { it.id })
    @Test fun sharedTasksStayVisibleInBothModes() = assertEquals(listOf("s1", "s2"), ViewRules.sharedTasks(tasks).map { it.id }) // independent of the mode
    @Test fun habitsFollowParticipationAndSharedHabitsAppearInBoth() {
        assertEquals(listOf("a", "c"), ViewRules.habitsFor(habits, ids, ME).map { it.id })
        assertEquals(listOf("b", "c"), ViewRules.habitsFor(habits, ids, PARTNER).map { it.id })
    }
    @Test fun aPartnersPersonalHabitIsReadOnlyWhileASharedOneKeepsYourOwnRecordWritable() {
        assertFalse(ViewRules.canWriteHabit(habits[1], ids, ME, subject = PARTNER)) // partner mode, partner's habit
        assertTrue(ViewRules.canWriteHabit(habits[0], ids, ME, subject = ME))
        assertFalse(ViewRules.canWriteHabit(habits[2], ids, ME, subject = PARTNER)) // viewing the partner's side: their record, not yours
        assertTrue(ViewRules.canWriteHabit(habits[2], ids, ME, subject = ME)) // shared habit, your own record
    }
    @Test fun modeFallsBackToMineWithoutAPartnerAndSubjectNeverChangesTheAccount() {
        assertEquals(ViewMode.ME, ViewRules.resolve(ViewMode.PARTNER, hasPartner = false)); assertEquals(ViewMode.PARTNER, ViewRules.resolve(ViewMode.PARTNER, true))
        assertEquals(PARTNER, ViewRules.subject(ViewMode.PARTNER, ME, PARTNER)); assertEquals(ME, ViewRules.subject(ViewMode.PARTNER, ME, null)); assertEquals(ME, ViewRules.subject(ViewMode.ME, ME, PARTNER))
    }
    @Test fun storedWireValue() { assertEquals(ViewMode.PARTNER, ViewRules.fromWire(ViewRules.wire(ViewMode.PARTNER))); assertEquals(ViewMode.ME, ViewRules.fromWire(null)); assertEquals(ViewMode.ME, ViewRules.fromWire("junk")) }
    @Test fun eachPersonsCompletionStaysIndependentWhateverTheMode() {
        val l = mapOf("a" to done(PARTNER, TODAY, habitId = "a"))
        val shared = habit("a", shared = true)
        assertEquals(DayState.DONE, HabitRules.dayState(shared, PARTNER, TODAY, TODAY, l["a"].orEmpty()))
        assertEquals(DayState.PENDING, HabitRules.dayState(shared, ME, TODAY, TODAY, l["a"].orEmpty()))
    }
}

class BriefTest {
    private fun input(tasks: List<Task> = emptyList(), quote: Quote? = null) = RanaInput(WS, tasks, emptyList(), emptyMap(), NOW, IST, BriefingKind.FULL, emptyList(), null, quote)

    @Test fun greetingUsesLocalTimeAndTheProfileName() {
        val b = BriefBuilder.build(input())
        assertEquals("Good afternoon, Shubham.", b.greeting)
        assertEquals("Good morning, Shubham.", BriefBuilder.build(input().copy(now = at(TODAY, 8))).greeting)
        assertEquals("Good evening, Shubham.", BriefBuilder.build(input().copy(now = at(TODAY, 20))).greeting)
    }
    @Test fun theQuoteIsTheSavedOneOrAbsent() {
        val q = Quote("q", "Begin.", "Ada")
        assertEquals(q, BriefBuilder.build(input(quote = q)).quote); assertNull(BriefBuilder.build(input()).quote)
    }
    @Test fun deadlinesAreOnlyThoseThatNeedAttentionAndPlanNeverRepeatsThem() {
        val tasks = listOf(deadline("o", "Overdue", at(TODAY, 9)), deadline("c", "Soon", at(TODAY, 17)), deadline("later", "Later", at(TODAY, 23, 45)), daily("d", "Plan", time = LocalTime.of(18, 0)), deadline("t", "Tomorrow", at(TODAY.plusDays(1), 10)))
        val b = BriefBuilder.build(input(tasks))
        assertEquals(listOf("o", "c"), b.deadlines.map { it.id })
        assertEquals(listOf("d", "later"), b.plan.map { it.id })
        assertTrue((b.deadlines.map { it.id } intersect b.plan.map { it.id }.toSet()).isEmpty())
    }
    @Test fun deadlineEntriesCarryTitleDeadlineRemainingTimeAndStatus() {
        val a = BriefBuilder.build(input(listOf(deadline("c", "Submit", at(TODAY, 17))))).deadlines.single()
        assertEquals("Submit", a.title); assertEquals("Due soon", a.status); assertTrue("5:00 PM" in a.detail && "1h 30m left" in a.detail)
    }
    @Test fun planIsChronologicalWithCarriedOverWorkFirstAndEmptyStatesAreEmpty() {
        val tasks = listOf(daily("late", "Evening", time = LocalTime.of(20, 0)), daily("early", "Morning", time = LocalTime.of(9, 0)), daily("y", "Left over", TODAY.minusDays(1)))
        assertEquals(listOf("y", "early", "late"), BriefBuilder.build(input(tasks)).plan.map { it.id })
        assertTrue(BriefBuilder.build(input()).isEmpty)
    }
    @Test fun noGenericCommentaryIsProduced() {
        val b = BriefBuilder.build(input(listOf(daily("d", "x"))))
        assertFalse(b.toString().contains("reviewed your schedule")); assertFalse(b.toString().contains("Let’s"))
    }
}

class WidgetRulesTest {
    private fun tasks(vararg t: com.ourday.domain.model.Task) = t.toList()

    @Test fun showsMyTasksForTodayOpenFirstInTimeOrderThenDone() {
        val s = WidgetRules.build(tasks(
            daily("a", "Anytime"), daily("b", "Morning", time = LocalTime.of(9, 0)), deadline("d", "Report", at(TODAY, 19)),
            daily("c", "Done one", time = LocalTime.of(8, 0), status = TaskStatus.COMPLETED, doneBy = ME, doneAt = NOW),
            daily("p", "Partner's", by = PARTNER), daily("tomorrow", "Later", TODAY.plusDays(1)),
        ), ME, NOW, IST, 10)
        assertEquals(listOf("b", "d", "a", "c"), s.items.map { it.id })
        assertEquals(3, s.remaining)
        assertTrue(s.items.last().done)
    }
    @Test fun nextDeadlineIsTheEarliestOpenOneAfterNowEvenIfNotToday() {
        val s = WidgetRules.build(tasks(deadline("far", "Far", at(TODAY.plusDays(3), 9)), deadline("near", "Near", at(TODAY.plusDays(1), 10)), deadline("past", "Past", at(TODAY, 9))), ME, NOW, IST, 5)
        assertEquals("near", s.next?.id)
        assertTrue(s.next!!.remaining.toHours() in 18..19)
    }
    @Test fun limitsRowsAndReportsHiddenOnesForCompactLayouts() {
        val many = (1..7).map { daily("t$it", "T$it", time = LocalTime.of(8 + it, 0)) }
        val s = WidgetRules.build(many, ME, NOW, IST, 3)
        assertEquals(3, s.items.size); assertEquals(4, s.hidden); assertEquals(7, s.remaining)
    }
    @Test fun completingATaskUpdatesWhatIsLeftAndEmptyDaysAreEmpty() {
        val open = tasks(daily("a", "A"), daily("b", "B"))
        assertEquals(2, WidgetRules.build(open, ME, NOW, IST, 5).remaining)
        val after = open.map { if (it.id == "a") it.copy(status = TaskStatus.COMPLETED, completedBy = ME, completedAt = NOW) else it }
        assertEquals(1, WidgetRules.build(after, ME, NOW, IST, 5).remaining)
        assertTrue(WidgetRules.build(emptyList(), ME, NOW, IST, 5).isEmpty)
    }
    @Test fun sharedTasksAndExpiredDeadlinesNeverAppear() {
        val s = WidgetRules.build(tasks(daily("s", "Shared").copy(kind = TaskKind.SHARED), deadline("x", "Expired", at(TODAY, 9))), ME, NOW, IST, 5)
        assertTrue(s.items.isEmpty())
    }
}
