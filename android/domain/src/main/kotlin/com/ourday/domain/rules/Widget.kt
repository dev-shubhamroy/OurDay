package com.ourday.domain.rules

import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

data class WidgetItem(val id: String, val title: String, val time: LocalTime?, val done: Boolean, val isDeadline: Boolean, val urgency: Urgency)
data class WidgetNext(val id: String, val title: String, val dueAt: Instant, val remaining: Duration, val urgency: Urgency)
data class WidgetState(val items: List<WidgetItem>, val hidden: Int, val remaining: Int, val next: WidgetNext?) {
    val isEmpty get() = items.isEmpty() && next == null
}

/**
 * What the home-screen widget shows, from the SAME Room data as the app: your tasks for today (open first, in time order, completed
 * ones after), how many are left, and the next open deadline. Pure and tested; the widget only renders it.
 */
object WidgetRules {
    fun build(tasks: List<Task>, me: String, now: Instant, zone: ZoneId, max: Int): WidgetState {
        val today = now.atZone(zone).toLocalDate()
        val mine = tasks.filter { it.kind != TaskKind.SHARED && it.createdBy == me }
        val deadlines = mine.filter { it.kind == TaskKind.DEADLINE && TaskRules.deadlineDay(it, zone) == today && !TaskRules.isExpired(it, now) }
        val daily = mine.filter { it.kind == TaskKind.DAILY && it.date == today }
        fun item(t: Task) = WidgetItem(t.id, t.title, t.dueAt?.atZone(zone)?.toLocalTime() ?: t.plannedTime, !t.isOpen, t.kind == TaskKind.DEADLINE, UrgencyRules.of(t, now))
        val all = (deadlines + daily).map(::item)
        val ordered = all.filter { !it.done }.sortedWith(compareBy({ it.time == null }, { it.time }, { it.id })) + all.filter { it.done }.sortedBy { it.time }
        val next = mine.filter { it.kind == TaskKind.DEADLINE && it.isOpen && it.dueAt?.isAfter(now) == true }.minByOrNull { it.dueAt!! }?.let {
            WidgetNext(it.id, it.title, it.dueAt!!, Duration.between(now, it.dueAt), UrgencyRules.of(it, now))
        }
        return WidgetState(ordered.take(max), maxOf(0, ordered.size - max), all.count { !it.done }, next)
    }
}
