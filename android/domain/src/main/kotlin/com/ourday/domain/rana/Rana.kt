package com.ourday.domain.rana

import com.ourday.domain.model.Habit
import com.ourday.domain.model.LogStatus
import com.ourday.domain.model.Quote
import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import com.ourday.domain.model.Workspace
import com.ourday.domain.rules.HabitLogs
import com.ourday.domain.rules.HabitRules
import com.ourday.domain.rules.Urgency
import com.ourday.domain.rules.UrgencyRules
import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// RANA: deterministic and data-only. No AI, no statistics, no invented content. A section with nothing to say is empty
// and the screen hides it. Port of the Mac ExecutiveReportBuilder / frontend rana.ts.

enum class BriefingKind { FULL, UPDATE }
enum class AttentionLevel { OVERDUE, CRITICAL, APPROACHING, CARRIED }

data class AttentionItem(val id: String, val title: String, val status: String, val detail: String, val level: AttentionLevel, val ownerName: String?)
data class ScheduleEntry(val id: String, val title: String, val timeText: String, val detail: String, val isDeadline: Boolean, val ownerName: String?)
data class Change(val text: String, val byPartner: Boolean)

data class RanaReport(
    val kind: BriefingKind,
    val greetingLead: String,
    val greetingName: String,
    val dateLine: String,
    val intro: String,
    val attention: List<AttentionItem> = emptyList(),
    val schedule: List<ScheduleEntry> = emptyList(),
    val emptyDayNote: String? = null,
    val missedHabits: List<String> = emptyList(),
    val partnerName: String? = null,
    val partnerLines: List<String> = emptyList(),
    val sinceTitle: String? = null,
    val ownChanges: List<Change> = emptyList(),
    val partnerChanges: List<Change> = emptyList(),
    val closing: String = "",
    /** One saved quote ("JUST KNOW THAT –"); null when the library is empty: the section is hidden, nothing is invented. */
    val quote: Quote? = null,
) {
    val greeting: String get() = "$greetingLead $greetingName".trim()

    companion object {
        const val ATTENTION_INTRO = "These are some tasks that need your attention urgently."
        const val SCHEDULE_INTRO = "You need to work on these today."
        const val QUOTE_HEADING = "JUST KNOW THAT –"
    }
}

data class RanaInput(
    val workspace: Workspace,
    val tasks: List<Task>,
    val habits: List<Habit>,
    /** habitId -> that habit's logs. */
    val logs: Map<String, HabitLogs>,
    val now: Instant,
    val zone: ZoneId,
    val kind: BriefingKind,
    val changes: List<Change> = emptyList(),
    val previousAt: Instant? = null,
    val quote: Quote? = null,
)

object BriefingDay {
    /** The first briefing of the local calendar day is the full one; later ones are concise updates. */
    fun kind(lastBriefingDay: LocalDate?, today: LocalDate): BriefingKind = if (lastBriefingDay == today) BriefingKind.UPDATE else BriefingKind.FULL
}

object Rana {
    private val timeFmt = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
    private val dateFmt = DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.US)
    private val shortDateFmt = DateTimeFormatter.ofPattern("EEE d MMM", Locale.US)

    fun greeting(now: Instant, zone: ZoneId): String {
        val h = now.atZone(zone).hour
        return if (h < 5) "Good evening" else if (h < 12) "Good morning" else if (h < 17) "Good afternoon" else "Good evening"
    }

    fun timeText(i: Instant, zone: ZoneId): String = timeFmt.format(i.atZone(zone))
    fun clockText(t: java.time.LocalTime): String = timeFmt.format(t)

    private fun listJoin(items: List<String>): String {
        val q = items.map { "“$it”" }
        return if (q.size <= 1) q.joinToString("") else q.dropLast(1).joinToString(", ") + " and " + q.last()
    }

    private fun word(n: Int): String = listOf("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten").getOrNull(n) ?: n.toString()

    private fun agoText(d: Duration): String {
        val m = maxOf(1L, d.toMinutes())
        return if (m >= 1440) "${m / 1440}d ago" else if (m >= 60) "${m / 60}h ${m % 60}m ago" else "${m}m ago"
    }

    fun build(i: RanaInput): RanaReport {
        val ws = i.workspace
        val today = i.now.atZone(i.zone).toLocalDate()
        val yesterday = today.minusDays(1)
        val first = ws.me?.firstName?.takeIf { it != "Your partner" }
        val lead = greeting(i.now, i.zone) + if (first == null) "." else ","
        var r = RanaReport(i.kind, lead, first?.let { "$it." } ?: "", dateFmt.format(today), intro = "", quote = i.quote)

        fun owner(t: Task): String? = if (t.createdBy == ws.meId) null else ws.nameOf(t.createdBy)
        fun whenText(d: Instant): String {
            val day = d.atZone(i.zone).toLocalDate()
            val prefix = if (day == today) "" else if (day == today.plusDays(1)) "Tomorrow, " else shortDateFmt.format(day) + ", "
            return prefix + timeText(d, i.zone)
        }

        // ---- Needs attention: overdue, critical (<= 3h), approaching (<= 8h) deadlines; open work from yesterday ---------------
        val openDeadlines = i.tasks.filter { it.kind == TaskKind.DEADLINE && it.isOpen && it.dueAt != null }
        val attention = mutableListOf<AttentionItem>()
        for (t in openDeadlines.filter { !it.dueAt!!.isAfter(i.now) }.sortedByDescending { it.dueAt }) {
            attention += AttentionItem(t.id, t.title, "Overdue", "Was due ${whenText(t.dueAt!!)} · ${agoText(Duration.between(t.dueAt, i.now))}", AttentionLevel.OVERDUE, owner(t))
        }
        for (t in openDeadlines.filter { it.dueAt!!.isAfter(i.now) }.sortedBy { it.dueAt }) {
            val rem = Duration.between(i.now, t.dueAt!!)
            when (UrgencyRules.of(t, i.now)) {
                Urgency.CRITICAL -> attention += AttentionItem(t.id, t.title, "Due soon", "${whenText(t.dueAt)} · ${UrgencyRules.remainingText(rem)}", AttentionLevel.CRITICAL, owner(t))
                Urgency.APPROACHING -> attention += AttentionItem(t.id, t.title, "Approaching", "${whenText(t.dueAt)} · ${UrgencyRules.remainingText(rem)}", AttentionLevel.APPROACHING, owner(t))
                else -> Unit
            }
        }
        for (t in i.tasks.filter { it.kind == TaskKind.DAILY && it.date == yesterday && it.isOpen }.sortedBy { it.id }) {
            attention += AttentionItem(t.id, t.title, "From yesterday", "Still open", AttentionLevel.CARRIED, owner(t))
        }
        r = r.copy(attention = attention)
        val attentionIds = attention.map { it.id }.toSet()

        // ---- Today's schedule: what is still to do today, in order; urgent items live in Needs attention only --------------
        val plan = mutableListOf<Pair<Int, ScheduleEntry>>()
        for (t in openDeadlines) {
            val due = t.dueAt!!
            if (due.isAfter(i.now) && due.atZone(i.zone).toLocalDate() == today && t.id !in attentionIds) {
                val z = due.atZone(i.zone)
                plan += (z.hour * 60 + z.minute) to ScheduleEntry(t.id, t.title, timeText(due, i.zone), UrgencyRules.remainingText(Duration.between(i.now, due)), true, owner(t))
            }
        }
        for (t in i.tasks.filter { it.kind == TaskKind.DAILY && it.date == today && it.isOpen }) {
            val key = t.plannedTime?.let { it.hour * 60 + it.minute } ?: 24 * 60
            plan += key to ScheduleEntry(t.id, t.title, t.plannedTime?.let(::clockText) ?: "Any time", "Planned task", false, owner(t))
        }
        r = r.copy(schedule = plan.sortedWith(compareBy({ it.first }, { it.second.id })).map { it.second })
        val doneToday = i.tasks.any { !it.isOpen && it.date == today }
        if (attention.isEmpty() && r.schedule.isEmpty()) r = r.copy(emptyDayNote = if (doneToday) "Everything planned for today is complete." else "Nothing is scheduled for today.")

        // ---- Habits: only what was missed (yesterday, or answered "No" today); never counts ----------------------------------
        val memberIds = ws.members.map { it.id }
        val mine = i.habits.filter { !it.paused && ws.meId in HabitRules.participants(it, memberIds) }
        val missed = mutableListOf<String>()
        for (h in mine) {
            val logs = i.logs[h.id].orEmpty()
            if (today > h.startDate && HabitRules.dayState(h, ws.meId, yesterday, today, logs) == com.ourday.domain.rules.DayState.MISSED) missed += "You forgot to do ${h.title} yesterday."
        }
        for (h in mine) {
            val e = HabitRules.entry(i.logs[h.id].orEmpty(), ws.meId, today)
            if (HabitRules.isScheduled(h, today) && today >= h.startDate && e?.status == LogStatus.MISSED) missed += "You skipped ${h.title} today."
        }
        r = r.copy(missedHabits = missed)

        // ---- Partner: named, shared items only; hidden when nothing meaningful -------------------------------------------------
        ws.partner?.let { p ->
            val pn = p.firstName
            val lines = mutableListOf<String>()
            val done = i.tasks.filter { !it.isOpen && it.completedBy == p.id && it.completedAt?.atZone(i.zone)?.toLocalDate() == today }.map { it.title }
            when {
                done.size == 1 -> lines += "$pn completed “${done[0]}” today."
                done.size in 2..3 -> lines += "$pn completed ${listJoin(done)} today."
                done.size > 3 -> lines += "$pn completed ${word(done.size)} tasks today."
            }
            for (h in i.habits.filter { !it.paused && it.isShared }) {
                if (i.logs[h.id]?.get(p.id)?.get(today)?.status == LogStatus.DONE) lines += "$pn checked in on ${h.title} today."
            }
            r = r.copy(partnerName = pn, partnerLines = lines)
        }

        val urgent = attention.isNotEmpty()
        if (i.kind == BriefingKind.UPDATE) {
            return r.copy(
                intro = i.previousAt?.let { "Here is what has changed since your last briefing at ${timeText(it, i.zone)}." } ?: "Here is what has changed.",
                sinceTitle = i.previousAt?.let { "Since ${timeText(it, i.zone)}" },
                ownChanges = i.changes.filter { !it.byPartner }, partnerChanges = i.changes.filter { it.byPartner },
                partnerLines = emptyList(), schedule = emptyList(), missedHabits = emptyList(), emptyDayNote = null,
                closing = if (urgent) "Let’s take care of the urgent items first." else if (i.changes.isEmpty()) "Nothing has changed, and nothing is urgent." else "Nothing urgent has come up. Let’s keep going.",
            )
        }
        val closing = when {
            urgent -> if (r.schedule.isEmpty()) "Let’s take care of the urgent items first." else "Let’s take care of the urgent items and keep the rest on track."
            r.schedule.isEmpty() -> if (r.emptyDayNote == "Everything planned for today is complete.") "Everything planned for today is complete. Enjoy the rest of your day." else "You have a clear day ahead. Let’s make good use of it."
            r.schedule.size <= 2 -> "You have a relatively clear day ahead. Let’s make good use of it."
            else -> "Nothing is urgent. Let’s work through today’s plan one step at a time."
        }
        return r.copy(intro = "I’ve reviewed your schedule for today. Here is your daily briefing.", closing = closing)
    }

    // ---- what changed since the previous briefing ---------------------------------------------------------------------------

    /** What this briefing "knew": task id -> status. Compared with the next briefing to find relevant changes. */
    fun fingerprint(tasks: List<Task>): Map<String, String> = tasks.associate { it.id to if (it.isOpen) "open" else "completed" }

    fun changes(previous: Map<String, String>, tasks: List<Task>, ws: Workspace): List<Change> {
        val out = mutableListOf<Change>()
        for (t in tasks) {
            val was = previous[t.id]
            val byPartner = t.createdBy != ws.meId
            if (!t.isOpen && was != "completed") {
                val who = t.completedBy ?: t.createdBy
                out += Change(if (who == ws.meId) "You completed “${t.title}”" else "${ws.nameOf(who)} completed “${t.title}”", who != ws.meId)
            } else if (was == null && t.isOpen && byPartner) {
                out += Change("${ws.nameOf(t.createdBy)} added “${t.title}”", true)
            }
        }
        return out
    }
}

// ---- which quote a briefing shows (port of frontend quotes.ts / the Mac QuoteSelector) ---------------------------------

@Serializable
data class QuoteSelection(val history: List<String> = emptyList(), val currentKey: String? = null, val currentId: String? = null)

object QuoteSelector {
    /**
     * The quote for briefing [key]: the remembered pick while the key and the quote still exist (so a refresh never changes it);
     * otherwise a fresh pick among quotes not yet shown in this cycle, starting a new cycle once all were shown (never opening it
     * with the quote that just closed the last one when there is a choice). Returns null when the library is empty.
     */
    fun select(quotes: List<Quote>, key: String, selection: QuoteSelection, pick: (Int) -> Int = { (0 until it).random() }): Pair<Quote?, QuoteSelection> {
        if (quotes.isEmpty()) return null to selection
        val ids = quotes.map { it.id }
        if (selection.currentKey == key && selection.currentId in ids) return quotes.first { it.id == selection.currentId } to selection
        var cycle = selection.history.filter { it in ids }
        var pool = ids.filter { it !in cycle }
        if (pool.isEmpty()) {
            val last = cycle.lastOrNull()
            cycle = emptyList()
            pool = if (ids.size > 1) ids.filter { it != last } else ids
        }
        val chosen = pool[pick(pool.size).coerceIn(0, pool.size - 1)]
        return quotes.first { it.id == chosen } to QuoteSelection(cycle + chosen, key, chosen)
    }
}

// ---- the concise personal briefing shown on Android (greeting, quote, deadlines, today's plan) ---------------------------------

/**
 * The Android briefing, exactly: A greeting, B saved quote, C deadlines that need attention, D today's plan, E closing action.
 * No introduction, no counts, no habit or partner commentary. Same data rules as [Rana.build]; a task never appears twice.
 */
data class Brief(
    val greetingLead: String,
    val name: String,
    val quote: Quote?,
    val deadlines: List<AttentionItem>,
    val plan: List<ScheduleEntry>,
) {
    val greeting get() = "$greetingLead $name".trim()
    val isEmpty get() = deadlines.isEmpty() && plan.isEmpty()
}

object BriefBuilder {
    fun build(i: RanaInput): Brief {
        val full = Rana.build(i.copy(kind = BriefingKind.FULL))
        val ws = i.workspace
        // Deadlines: overdue / due soon / approaching. Work carried over from yesterday is real work, so it leads the plan.
        val deadlines = full.attention.filter { it.level != AttentionLevel.CARRIED }
        val carried = full.attention.filter { it.level == AttentionLevel.CARRIED }
            .map { ScheduleEntry(it.id, it.title, "Yesterday", "Still open", false, it.ownerName) }
        val seen = deadlines.map { it.id }.toSet()
        val plan = (carried + full.schedule).filter { it.id !in seen }.distinctBy { it.id }
        val first = ws.me?.firstName?.takeIf { it != "Your partner" }
        return Brief(full.greetingLead, first?.let { "$it." } ?: "", i.quote, deadlines, plan)
    }
}
