package com.ourday.domain

import com.ourday.domain.model.*
import com.ourday.domain.notify.*
import com.ourday.domain.rana.*
import com.ourday.domain.sync.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

private fun input(tasks: List<Task> = emptyList(), habits: List<Habit> = emptyList(), logs: Map<String, Map<String, Map<LocalDate, HabitLog>>> = emptyMap(),
                  kind: BriefingKind = BriefingKind.FULL, quote: Quote? = null, changes: List<Change> = emptyList(), previousAt: java.time.Instant? = null) =
    RanaInput(WS, tasks, habits, logs, NOW, IST, kind, changes, previousAt, quote)

class RanaTest {
    @Test fun openingUsesLocalTimeAndFirstName() {
        val r = Rana.build(input())
        assertEquals("Good afternoon, Shubham.", r.greeting); assertEquals("Sunday, 8 November", r.dateLine)
        assertEquals("I’ve reviewed your schedule for today. Here is your daily briefing.", r.intro)
        assertEquals("Good morning,", Rana.build(input().copy(now = at(TODAY, 8))).greetingLead)
        assertEquals("Good evening,", Rana.build(input().copy(now = at(TODAY, 19))).greetingLead)
    }
    @Test fun needsAttentionListsOverdueCriticalApproachingAndCarried() {
        val tasks = listOf(
            deadline("o", "Send invoice", at(TODAY, 9)), deadline("c", "Submit application", at(TODAY, 17)), deadline("a", "Project report", at(TODAY, 22), by = PARTNER),
            deadline("n", "Prepare slides", at(TODAY.plusDays(1), 10)), daily("y", "Left over", TODAY.minusDays(1)),
        )
        val r = Rana.build(input(tasks))
        assertEquals(listOf("Overdue", "Due soon", "Approaching", "From yesterday"), r.attention.map { it.status })
        assertEquals("Aayushi", r.attention[2].ownerName); assertNull(r.attention[0].ownerName)
    }
    @Test fun scheduleHoldsTheRestOfTodayInOrderAndExcludesUrgentItems() {
        val tasks = listOf(deadline("late", "Later today", at(TODAY, 23, 45)), daily("p", "Plan", time = LocalTime.of(17, 0)), daily("any", "Anytime"), deadline("soon", "Soon", at(TODAY, 17)))
        val r = Rana.build(input(tasks))
        assertEquals(listOf("soon").toSet(), r.attention.map { it.id }.toSet()) // critical (<=3h) -> attention only
        assertEquals(listOf("p", "late", "any"), r.schedule.map { it.id })
        assertEquals("Any time", r.schedule.last().timeText)
    }
    @Test fun emptyDayNotesAndClosings() {
        assertEquals("Nothing is scheduled for today.", Rana.build(input()).emptyDayNote)
        assertEquals("You have a clear day ahead. Let’s make good use of it.", Rana.build(input()).closing)
        val doneOnly = Rana.build(input(listOf(daily("d", "x", status = TaskStatus.COMPLETED, doneBy = ME, doneAt = NOW))))
        assertEquals("Everything planned for today is complete.", doneOnly.emptyDayNote)
        assertEquals("Let’s take care of the urgent items first.", Rana.build(input(listOf(deadline("o", "o", at(TODAY, 9))))).closing)
    }
    @Test fun missedHabitsAreOnlyWhatWasMissed() {
        val h = habit("h1", "Exercise")
        val yMissed = Rana.build(input(habits = listOf(h)))
        assertTrue("You forgot to do Exercise yesterday." in yMissed.missedHabits)
        val skipped = mapOf("h1" to mapOf(ME to mapOf(TODAY to HabitLog("h1", ME, TODAY, LogStatus.MISSED, null), TODAY.minusDays(1) to HabitLog("h1", ME, TODAY.minusDays(1), LogStatus.DONE, NOW))))
        val r = Rana.build(input(habits = listOf(h), logs = skipped))
        assertEquals(listOf("You skipped Exercise today."), r.missedHabits)
        assertTrue(Rana.build(input(habits = listOf(h.copy(paused = true)))).missedHabits.isEmpty())
    }
    @Test fun partnerLinesNameSharedWorkOnly() {
        val tasks = listOf(deadline("p", "Pay rent", at(TODAY, 20), status = TaskStatus.COMPLETED, doneBy = PARTNER, doneAt = at(TODAY, 9)))
        assertEquals(listOf("Aayushi completed “Pay rent” today."), Rana.build(input(tasks)).partnerLines)
        val shared = habit("s", "Walk", shared = true)
        val l = mapOf("s" to mapOf(PARTNER to mapOf(TODAY to HabitLog("s", PARTNER, TODAY, LogStatus.DONE, NOW))))
        assertTrue("Aayushi checked in on Walk today." in Rana.build(input(habits = listOf(shared), logs = l)).partnerLines)
        assertTrue(Rana.build(input(habits = listOf(habit("pp", "Private", owner = PARTNER)), logs = mapOf("pp" to mapOf(PARTNER to mapOf(TODAY to HabitLog("pp", PARTNER, TODAY, LogStatus.DONE, NOW))))).copy()).partnerLines.isEmpty()) // a partner's personal habit stays private
    }
    @Test fun updateBriefingIsConcise() {
        val r = Rana.build(input(kind = BriefingKind.UPDATE, changes = listOf(Change("Aayushi completed “Pay rent”", true)), previousAt = at(TODAY, 11, 30), tasks = listOf(daily("p", "Plan"))))
        assertEquals("Here is what has changed since your last briefing at 11:30 AM.", r.intro)
        assertTrue(r.schedule.isEmpty() && r.missedHabits.isEmpty() && r.partnerLines.isEmpty())
        assertEquals(1, r.partnerChanges.size); assertEquals("Nothing urgent has come up. Let’s keep going.", r.closing)
        assertEquals("Nothing has changed, and nothing is urgent.", Rana.build(input(kind = BriefingKind.UPDATE)).closing)
    }
    @Test fun changesComeFromComparingWithThePreviousBriefing() {
        val before = Rana.fingerprint(listOf(deadline("d1", "Pay rent", at(TODAY, 20))))
        val now = listOf(deadline("d1", "Pay rent", at(TODAY, 20), status = TaskStatus.COMPLETED, doneBy = PARTNER, doneAt = NOW), deadline("d2", "New one", at(TODAY, 22), by = PARTNER))
        val c = Rana.changes(before, now, WS)
        assertEquals(listOf("Aayushi completed “Pay rent”", "Aayushi added “New one”"), c.map { it.text })
        assertTrue(c.all { it.byPartner })
    }
    @Test fun firstBriefingOfTheDayIsFullThenUpdates() {
        assertEquals(BriefingKind.FULL, BriefingDay.kind(null, TODAY)); assertEquals(BriefingKind.FULL, BriefingDay.kind(TODAY.minusDays(1), TODAY))
        assertEquals(BriefingKind.UPDATE, BriefingDay.kind(TODAY, TODAY))
    }
    @Test fun quoteIsCarriedByBothKindsAndHiddenWhenAbsent() {
        val q = Quote("q1", "Begin.", "Ada")
        assertEquals(q, Rana.build(input(quote = q)).quote); assertEquals(q, Rana.build(input(kind = BriefingKind.UPDATE, quote = q)).quote)
        assertNull(Rana.build(input()).quote)
        assertEquals("JUST KNOW THAT –", RanaReport.QUOTE_HEADING)
    }
}

class QuoteSelectorTest {
    private fun q(vararg ids: String) = ids.map { Quote(it, "text $it", null) }
    @Test fun emptyLibraryShowsNothing() = assertNull(QuoteSelector.select(emptyList(), "k", QuoteSelection()).first)
    @Test fun oneQuoteIsAlwaysShown() {
        var sel = QuoteSelection()
        repeat(3) { n -> val (quote, next) = QuoteSelector.select(q("a"), "k$n", sel); assertEquals("a", quote?.id); sel = next }
    }
    @Test fun stableWithinOneBriefingAndNewForTheNext() {
        val quotes = q("a", "b", "c")
        val (first, s1) = QuoteSelector.select(quotes, "b1", QuoteSelection(), pick = { 0 })
        assertEquals(first?.id, QuoteSelector.select(quotes, "b1", s1, pick = { it - 1 }).first?.id) // refresh
        assertNotEquals(first?.id, QuoteSelector.select(quotes, "b2", s1, pick = { 0 }).first?.id)
    }
    @Test fun noRepeatUntilTheCollectionIsExhausted() {
        val quotes = q("a", "b", "c", "d"); var sel = QuoteSelection(); val shown = mutableListOf<String>()
        for (i in 1..4) { val (x, n) = QuoteSelector.select(quotes, "k$i", sel); shown += x!!.id; sel = n }
        assertEquals(4, shown.toSet().size)
        val (next, _) = QuoteSelector.select(quotes, "k5", sel, pick = { 0 })
        assertNotEquals(shown.last(), next?.id) // a new cycle never opens with the quote that just ended the last one
    }
    @Test fun aDeletedQuoteIsNeverShown() {
        val (a, sel) = QuoteSelector.select(q("a", "b"), "k", QuoteSelection(), pick = { 0 })
        val remaining = q(if (a?.id == "a") "b" else "a")
        assertNotEquals(a?.id, QuoteSelector.select(remaining, "k", sel).first?.id)
    }
}

class FakeStore(var data: List<QueuedOp> = emptyList()) : OpStore {
    override suspend fun load() = data
    override suspend fun save(queue: List<QueuedOp>) { data = queue }
}
class FakeRemote(var results: ArrayDeque<RemoteResult> = ArrayDeque(), val default: RemoteResult = RemoteResult.Ok) : RemoteGateway {
    val executed = mutableListOf<Op>()
    override suspend fun execute(op: Op): RemoteResult { executed += op; return results.removeFirstOrNull() ?: default }
}
class Recorder : SyncListener {
    val states = mutableMapOf<String, SyncState>(); val dropped = mutableListOf<Op>()
    override suspend fun onState(entity: String, state: SyncState, message: String?) { states[entity] = state }
    override suspend fun onDropped(op: Op, message: String) { dropped += op }
}

class SyncTest {
    private var n = 0
    private fun engine(store: OpStore, remote: RemoteGateway, rec: Recorder = Recorder()) = SyncEngine(store, remote, rec, { "q${n++}" }, { 1_000L })
    private val insert = Op.TaskInsert("t1", "daily", "Buy milk", null, ME, 1, "2026-11-08", null, null, false)

    @Test fun createdEditedAndCompletedOfflineBecomesOneInsertThenComplete() = runTest {
        val store = FakeStore(); val e = engine(store, FakeRemote())
        e.enqueue(insert); e.enqueue(Op.TaskPatch("t1", "daily", title = "Buy oat milk")); e.enqueue(Op.TaskComplete("t1", true, 5))
        assertEquals(2, store.data.size)
        assertEquals("Buy oat milk", (store.data[0].op as Op.TaskInsert).title)
    }
    @Test fun lastCompletionStateWins() = runTest {
        val store = FakeStore(); val e = engine(store, FakeRemote())
        e.enqueue(Op.TaskComplete("t1", true, 1)); e.enqueue(Op.TaskComplete("t1", false, 2))
        assertEquals(false, (store.data.single().op as Op.TaskComplete).completed)
    }
    @Test fun createdThenDeletedOfflineNeverReachesTheServer() = runTest {
        val store = FakeStore(); val remote = FakeRemote(); val rec = Recorder(); val e = engine(store, remote, rec)
        e.enqueue(insert); e.enqueue(Op.TaskComplete("t1", true, 2)); e.enqueue(Op.TaskDelete("t1"))
        assertTrue(store.data.isEmpty()); e.flush(); assertTrue(remote.executed.isEmpty()); assertEquals(SyncState.SYNCED, rec.states["task:t1"])
    }
    @Test fun habitLogLastAnswerWinsPerDayAndPersonButTheOtherDayStays() = runTest {
        val store = FakeStore(); val e = engine(store, FakeRemote())
        e.enqueue(Op.HabitLog("h", ME, "ws", "2026-11-08", "done", 1)); e.enqueue(Op.HabitLog("h", ME, "ws", "2026-11-08", "missed", 2)); e.enqueue(Op.HabitLog("h", ME, "ws", "2026-11-07", "done", 3))
        assertEquals(listOf("missed", "done"), store.data.map { (it.op as Op.HabitLog).status })
    }
    @Test fun pendingOperationsSurviveARestart() = runTest {
        val disk = FakeStore()
        engine(disk, FakeRemote(default = RemoteResult.Transient("offline"))).apply { enqueue(insert); enqueue(Op.TaskComplete("t1", true, 5)); flush() }
        val afterRestart = FakeStore(disk.data) // a brand-new process reading the same persisted queue
        val remote = FakeRemote(); val result = engine(afterRestart, remote).flush()
        assertTrue(result.complete); assertEquals(listOf("TaskInsert", "TaskComplete"), remote.executed.map { it::class.simpleName })
    }
    @Test fun aTransientFailureKeepsEveryOperation() = runTest {
        val store = FakeStore(); val rec = Recorder(); val e = engine(store, FakeRemote(default = RemoteResult.Transient("offline")), rec)
        e.enqueue(insert); e.enqueue(Op.TaskComplete("t1", true, 5))
        val r = e.flush(); assertTrue(r.networkDown); assertEquals(2, store.data.size); assertEquals(1, store.data[0].attempts); assertEquals(SyncState.PENDING, rec.states["task:t1"])
    }
    @Test fun repeatedSyncNeverDuplicates() = runTest {
        val store = FakeStore(); val remote = FakeRemote(ArrayDeque(listOf(RemoteResult.AlreadyApplied)))
        val e = engine(store, remote); e.enqueue(insert)
        assertTrue(e.flush().complete) // the server already had this id (an earlier ambiguous attempt succeeded): treated as success
        assertTrue(e.flush().complete); assertEquals(1, remote.executed.size) // nothing left to resend
    }
    @Test fun aRejectedOperationIsDroppedAlone() = runTest {
        val store = FakeStore(); val rec = Recorder(); val remote = FakeRemote(ArrayDeque(listOf(RemoteResult.Rejected("permission"))))
        val e = engine(store, remote, rec); e.enqueue(Op.TaskDelete("x")); e.enqueue(Op.TaskComplete("y", true, 1))
        val r = e.flush(); assertEquals(1, r.dropped); assertEquals(1, r.sent); assertTrue(store.data.isEmpty()); assertEquals(SyncState.FAILED, rec.states["task:x"]); assertEquals(1, rec.dropped.size)
    }
    @Test fun expiredSessionKeepsEverythingQueued() = runTest {
        val store = FakeStore(); val e = engine(store, FakeRemote(default = RemoteResult.AuthExpired))
        e.enqueue(insert); e.enqueue(Op.TaskComplete("t1", true, 5))
        val r = e.flush(); assertTrue(r.authExpired); assertEquals(2, store.data.size)
        val signedInAgain = FakeRemote(); assertTrue(engine(store, signedInAgain).flush().complete); assertEquals(2, signedInAgain.executed.size) // nothing lost
    }
    @Test fun conflictsNeverOverwriteNewerServerData() = runTest {
        val store = FakeStore(); val rec = Recorder(); val e = engine(store, FakeRemote(ArrayDeque(listOf(RemoteResult.Conflict(setOf("title"))))), rec)
        e.enqueue(Op.TaskPatch("t1", "daily", title = "Mine", baseUpdatedAtMs = 10))
        val r = e.flush(); assertEquals(1, r.conflicts); assertEquals(SyncState.CONFLICT, rec.states["task:t1"]); assertTrue(store.data.isEmpty())
    }
    @Test fun conflictPolicyOnlyFlagsOverlappingFieldsOfANewerServerVersion() {
        assertEquals(setOf("title"), ConflictPolicy.conflictingFields(setOf("title", "notes"), setOf("title", "due_at")))
        assertTrue(ConflictPolicy.conflictingFields(setOf("notes"), setOf("title")).isEmpty())
        assertTrue(ConflictPolicy.isStale(10, 20)); assertFalse(ConflictPolicy.isStale(20, 20)); assertFalse(ConflictPolicy.isStale(null, 20))
    }
    @Test fun serverChangedFieldsAreDetectedAgainstWhatTheEditStartedFrom() {
        val base = mapOf<String, String?>("title" to "Old", "notes" to "n", "task_date" to "2026-11-08")
        val server = mapOf<String, String?>("title" to "Theirs", "notes" to "n", "task_date" to "2026-11-08")
        assertEquals(setOf("title"), ConflictPolicy.serverChanged(base, server, mapOf("title" to "Mine")))
        assertTrue(ConflictPolicy.serverChanged(base, server, mapOf("title" to "Theirs")).isEmpty()) // we are writing what they already have
        assertTrue(ConflictPolicy.serverChanged(base, base, mapOf("title" to "Mine")).isEmpty()) // nobody else touched it
    }
    @Test fun mergedEditsKeepTheEarliestSeenBase() {
        val q = OpQueue.enqueue(listOf(QueuedOp("1", Op.TaskPatch("t", "daily", title = "A", base = mapOf("title" to "Orig")), 1)), QueuedOp("2", Op.TaskPatch("t", "daily", title = "B", base = mapOf("title" to "A")), 2))
        assertEquals("Orig", (q.single().op as Op.TaskPatch).base["title"])
    }
    @Test fun anInFlightOperationIsNeverEditedOrDroppedByLaterChanges() {
        val a = QueuedOp("A", insert, 1)
        val q1 = OpQueue.enqueue(listOf(a), QueuedOp("B", Op.TaskPatch("t1", "daily", title = "Changed"), 2), inflight = "A")
        assertEquals(listOf("A", "B"), q1.map { it.qid })
        val q2 = OpQueue.enqueue(q1, QueuedOp("C", Op.TaskDelete("t1"), 3), inflight = "A")
        assertEquals(listOf("TaskInsert", "TaskDelete"), q2.map { it.op::class.simpleName })
    }
    @Test fun deletingAServerTaskDropsItsPendingEditsButKeepsTheDelete() {
        val q = OpQueue.enqueue(listOf(QueuedOp("1", Op.TaskPatch("t9", "daily", title = "x"), 1)), QueuedOp("2", Op.TaskDelete("t9"), 2))
        assertEquals(listOf("TaskDelete"), q.map { it.op::class.simpleName })
    }
    @Test fun opsSurviveSerialization() {
        val json = kotlinx.serialization.json.Json { classDiscriminator = "type" }
        val q = QueuedOp("q", Op.HabitLog("h", ME, "ws", "2026-11-08", "done", 7), 1)
        assertEquals(q, json.decodeFromString(QueuedOp.serializer(), json.encodeToString(QueuedOp.serializer(), q)))
    }
}

class RoutingTest {
    @Test fun routesEachCategoryToItsScreen() {
        assertEquals(Routed(Category.HABIT, Destination.Habits), NotificationRouting.route("habit", null, null, "h1"))
        assertEquals(Routed(Category.SHARED, Destination.SharedTask("t1")), NotificationRouting.route("partner", "reminder", "t1", null))
        assertEquals(Routed(Category.URGENT_DEADLINE, Destination.Task("t1")), NotificationRouting.route("deadline", null, "t1", null, minutesToDeadline = 5))
        assertEquals(Category.TASK, NotificationRouting.route("deadline", null, "t1", null, minutesToDeadline = 120).category)
        assertEquals(Routed(Category.RANA, Destination.Rana), NotificationRouting.route("rana", null, null, null))
        assertEquals(Destination.Today, NotificationRouting.route("deadline", null, null, null).destination)
    }
    @Test fun deepLinksRoundTrip() {
        for (d in listOf(Destination.Today, Destination.Habits, Destination.Shared, Destination.Rana, Destination.Task("abc-1"), Destination.SharedTask("s-9"))) assertEquals(d, NotificationRouting.parse(NotificationRouting.deepLink(d)))
        assertNull(NotificationRouting.parse("https://evil.example/x")); assertNull(NotificationRouting.parse("ourday://unknown"))
    }
    @Test fun aDeviceReceivesThroughExactlyOneRoute() {
        assertTrue(NotificationRouting.shouldDeliver(NotificationRouting.Route.FCM, NotificationRouting.Route.FCM))
        assertFalse(NotificationRouting.shouldDeliver(NotificationRouting.Route.FCM, NotificationRouting.Route.WEB_PUSH))
    }
}

class ValidationTest {
    @Test fun signInAndSignUpRules() {
        assertTrue(Validation.signIn("a@b.co", "x") is Validation.Result.Ok); assertTrue(Validation.signIn("nope", "x") is Validation.Result.Error); assertTrue(Validation.signIn("a@b.co", "") is Validation.Result.Error)
        assertTrue(Validation.signUp("Ann", "a@b.co", "12345678") is Validation.Result.Ok); assertTrue(Validation.signUp("", "a@b.co", "12345678") is Validation.Result.Error)
        assertTrue(Validation.signUp("Ann", "a@b.co", "short") is Validation.Result.Error); assertTrue(Validation.signUp("x".repeat(61), "a@b.co", "12345678") is Validation.Result.Error)
    }
    @Test fun taskAndHabitTitles() {
        assertTrue(Validation.taskTitle("  ") is Validation.Result.Error); assertTrue(Validation.taskTitle("ok") is Validation.Result.Ok); assertTrue(Validation.habitTitle("x".repeat(121)) is Validation.Result.Error)
    }
}

class DeliveryTest {
    @Test fun oneRoutePerDevice() {
        assertEquals(DeliveryRules.Mode.FCM, DeliveryRules.mode(fcmActive = true, nativeAlertsOn = true))
        assertEquals(DeliveryRules.Mode.CHECK_NEW, DeliveryRules.mode(false, true)); assertEquals(DeliveryRules.Mode.OFF, DeliveryRules.mode(false, false))
        assertEquals(DeliveryRules.Mode.FCM, DeliveryRules.mode(true, false)) // FCM wins; the periodic check never runs beside it
    }
    @Test fun neverShowsTwiceOrReadOrTheHabitRowsHandledLocally() {
        assertTrue(DeliveryRules.shouldShow("n1", "deadline", false, emptySet(), true))
        assertFalse(DeliveryRules.shouldShow("n1", "deadline", false, setOf("n1"), true)); assertFalse(DeliveryRules.shouldShow("n2", "deadline", true, emptySet(), true))
        assertFalse(DeliveryRules.shouldShow("n3", "habit", false, emptySet(), localCheckIn = true)); assertTrue(DeliveryRules.shouldShow("n3", "habit", false, emptySet(), localCheckIn = false))
    }
    @Test fun cursorStartsAtNowAndOnlyMovesForward() {
        assertEquals(500L, DeliveryRules.nextCursor(0, listOf(1, 2), now = 500)); assertEquals(30L, DeliveryRules.nextCursor(10, listOf(20, 30), 500)); assertEquals(10L, DeliveryRules.nextCursor(10, listOf(5), 500))
    }
    @Test fun sharedTaskAndReminderNotificationsRouteToTheSharedScreen() {
        assertEquals(Routed(Category.SHARED, Destination.SharedTask("t9")), NotificationRouting.route("partner", "completion_request", "t9", null))
        assertEquals(Routed(Category.TASK, Destination.Today), NotificationRouting.route("partner", null, null, null))
    }
}
