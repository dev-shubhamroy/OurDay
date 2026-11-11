package com.ourday.domain.rules

import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Day grouping for the Today dashboard and the Tasks list. Same rules as frontend/src/services/selectors.ts. */
object TaskRules {
    fun dayOf(instant: Instant, zone: ZoneId): LocalDate = instant.atZone(zone).toLocalDate()

    /** A deadline's day is the day of its instant in the viewer's own time zone. */
    fun deadlineDay(t: Task, zone: ZoneId): LocalDate = t.dueAt?.let { dayOf(it, zone) } ?: t.date

    fun isExpired(t: Task, now: Instant): Boolean = t.kind == TaskKind.DEADLINE && t.isOpen && t.dueAt?.let { !it.isAfter(now) } == true

    private val byDue = compareBy<Task>({ it.dueAt ?: Instant.MAX }, { it.id })
    private val byPlan = compareBy<Task>({ it.plannedTime }, { it.id })

    /** Today's deadlines: due today and not yet expired (completed ones stay visible until the day ends). */
    fun todayDeadlines(tasks: List<Task>, today: LocalDate, now: Instant, zone: ZoneId): List<Task> =
        tasks.filter { it.kind == TaskKind.DEADLINE && deadlineDay(it, zone) == today && !isExpired(it, now) }.sortedWith(byDue)

    /** Tomorrow's deadlines are a SEPARATE group and only list open items. */
    fun tomorrowDeadlines(tasks: List<Task>, today: LocalDate, now: Instant, zone: ZoneId): List<Task> =
        tasks.filter { it.kind == TaskKind.DEADLINE && deadlineDay(it, zone) == today.plusDays(1) && it.isOpen && !isExpired(it, now) }.sortedWith(byDue)

    fun todayTasks(tasks: List<Task>, today: LocalDate): List<Task> =
        tasks.filter { it.kind == TaskKind.DAILY && it.date == today }.sortedWith(byPlan)

    /** Further ahead: deadlines after tomorrow and daily tasks planned after today. */
    fun upcoming(tasks: List<Task>, today: LocalDate, now: Instant, zone: ZoneId, limit: Int = 5): List<Task> =
        tasks.filter {
            when (it.kind) {
                TaskKind.DEADLINE -> it.isOpen && !isExpired(it, now) && deadlineDay(it, zone) > today.plusDays(1)
                TaskKind.DAILY -> it.isOpen && it.date > today
                TaskKind.SHARED -> false
            }
        }.sortedWith(compareBy({ if (it.kind == TaskKind.DEADLINE) deadlineDay(it, zone) else it.date }, { it.dueAt ?: Instant.MAX }, { it.id })).take(limit)

    /** Open deadlines that passed (the "missed" list) and open daily tasks from earlier days. */
    fun overdue(tasks: List<Task>, today: LocalDate, now: Instant): List<Task> =
        tasks.filter { isExpired(it, now) || (it.kind == TaskKind.DAILY && it.isOpen && it.date < today) }
            .sortedByDescending { it.dueAt ?: it.date.atStartOfDay(ZoneId.systemDefault()).toInstant() }

    // ---- Tasks screen ------------------------------------------------------------------------------------------

    enum class StatusFilter { OPEN, COMPLETED, ALL }
    enum class KindFilter { ALL, DAILY, DEADLINE }
    enum class OwnerFilter { MINE, PARTNER, BOTH }
    enum class Sort { DATE, NEWEST, TITLE }

    fun list(tasks: List<Task>, me: String, status: StatusFilter, kind: KindFilter, owner: OwnerFilter, sort: Sort): List<Task> {
        val filtered = tasks.filter { it.kind != TaskKind.SHARED }
            .filter { when (status) { StatusFilter.OPEN -> it.isOpen; StatusFilter.COMPLETED -> !it.isOpen; StatusFilter.ALL -> true } }
            .filter { when (kind) { KindFilter.ALL -> true; KindFilter.DAILY -> it.kind == TaskKind.DAILY; KindFilter.DEADLINE -> it.kind == TaskKind.DEADLINE } }
            .filter { when (owner) { OwnerFilter.MINE -> it.createdBy == me; OwnerFilter.PARTNER -> it.createdBy != me; OwnerFilter.BOTH -> true } }
        return when (sort) {
            Sort.DATE -> filtered.sortedWith(compareBy({ it.dueAt ?: it.date.atStartOfDay(ZoneId.of("UTC")).toInstant() }, { it.id }))
            Sort.NEWEST -> filtered.sortedByDescending { it.createdAt }
            Sort.TITLE -> filtered.sortedBy { it.title.lowercase() }
        }
    }

    /** Which tasks belong to the person whose side is shown (a filter, never a permission). */
    fun ownedBy(tasks: List<Task>, user: String): List<Task> = tasks.filter { it.createdBy == user || it.kind == TaskKind.SHARED }
}
