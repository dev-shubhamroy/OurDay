package com.ourday.domain.rules

import com.ourday.domain.model.Task
import java.time.Duration
import java.time.Instant

enum class Urgency { NORMAL, APPROACHING, CRITICAL, OVERDUE, DONE }

object UrgencyRules {
    val CRITICAL: Duration = Duration.ofHours(3)
    val APPROACHING: Duration = Duration.ofHours(8)

    /** Same thresholds as the web and Mac apps: critical within 3 hours, approaching within 8. */
    fun of(task: Task, now: Instant): Urgency {
        if (!task.isOpen) return Urgency.DONE
        val due = task.dueAt ?: return Urgency.NORMAL
        val remaining = Duration.between(now, due)
        return when {
            remaining.isNegative || remaining.isZero -> Urgency.OVERDUE
            remaining <= CRITICAL -> Urgency.CRITICAL
            remaining <= APPROACHING -> Urgency.APPROACHING
            else -> Urgency.NORMAL
        }
    }

    /** "2h 14m left", "35m left", "3d 4h left" (same wording as the web app). */
    fun remainingText(remaining: Duration): String {
        if (remaining.isNegative || remaining.isZero) return "Time is up"
        val mins = maxOf(1L, remaining.toMinutes())
        val d = mins / 1440
        val h = (mins % 1440) / 60
        val m = mins % 60
        return when {
            d > 0 -> "${d}d ${h}h left"
            h > 0 -> "${h}h ${m}m left"
            else -> "${m}m left"
        }
    }
}
