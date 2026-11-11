package com.ourday.domain.notify

/** Android notification categories (each gets its own channel). */
enum class Category(val channelId: String) {
    URGENT_DEADLINE("urgent_deadlines"), TASK("tasks"), SHARED("shared"), HABIT("habits"), RANA("rana")
}

/** Where tapping a notification goes inside the app. */
sealed interface Destination {
    data object Today : Destination
    data object Habits : Destination
    data object Shared : Destination
    data object Rana : Destination
    data class Task(val id: String) : Destination
    data class SharedTask(val id: String?) : Destination
}

data class Routed(val category: Category, val destination: Destination)

/**
 * Maps a push payload (the same rows the backend writes to `notifications`: kind + subtype + ids) to a channel and a screen.
 * Web Push and FCM carry the same content, so one rule set serves both. Pure and tested.
 */
object NotificationRouting {
    fun route(kind: String?, subtype: String?, taskId: String?, habitId: String?, minutesToDeadline: Long? = null): Routed = when {
        subtype != null -> Routed(Category.SHARED, Destination.SharedTask(taskId))
        kind == "habit" || habitId != null -> Routed(Category.HABIT, Destination.Habits)
        kind == "deadline" -> Routed(
            if (minutesToDeadline != null && minutesToDeadline <= 30) Category.URGENT_DEADLINE else Category.TASK,
            taskId?.let { Destination.Task(it) } ?: Destination.Today,
        )
        kind == "rana" -> Routed(Category.RANA, Destination.Rana)
        else -> Routed(Category.TASK, taskId?.let { Destination.Task(it) } ?: Destination.Today)
    }

    /** `ourday://task/<id>` style deep links, shared by notifications, shortcuts and tests. */
    fun deepLink(d: Destination): String = when (d) {
        Destination.Today -> "ourday://today"
        Destination.Habits -> "ourday://habits"
        Destination.Shared -> "ourday://shared"
        Destination.Rana -> "ourday://rana"
        is Destination.Task -> "ourday://task/${d.id}"
        is Destination.SharedTask -> d.id?.let { "ourday://shared/$it" } ?: "ourday://shared"
    }

    fun parse(uri: String): Destination? {
        val m = Regex("^ourday://([a-z]+)(?:/([A-Za-z0-9-]+))?$").matchEntire(uri) ?: return null
        val id = m.groupValues[2].ifEmpty { null }
        return when (m.groupValues[1]) {
            "today" -> Destination.Today
            "habits" -> Destination.Habits
            "rana" -> Destination.Rana
            "task" -> id?.let { Destination.Task(it) }
            "shared" -> if (id == null) Destination.Shared else Destination.SharedTask(id)
            else -> null
        }
    }

    /**
     * Two delivery routes can reach one phone (Web Push in the installed PWA, FCM in this app). To avoid duplicates each
     * device registers ONE route; the server must deliver to the device's chosen route only. See ARCHITECTURE.md.
     */
    enum class Route { WEB_PUSH, FCM }
    fun shouldDeliver(deviceRoute: Route, via: Route): Boolean = deviceRoute == via
}

/** Which delivery path a device uses, and whether a given server notification should be shown natively (pure, tested). */
object DeliveryRules {
    enum class Mode { FCM, CHECK_NEW, OFF }

    /** One route per device: FCM once the device token really reached the server, otherwise the periodic check of the existing rows. */
    fun mode(fcmActive: Boolean, nativeAlertsOn: Boolean): Mode = when {
        fcmActive -> Mode.FCM
        nativeAlertsOn -> Mode.CHECK_NEW
        else -> Mode.OFF
    }

    /** Never show twice, never show what was already read, and leave the 21:30 habit rows to the on-device check-in. */
    fun shouldShow(id: String, kind: String, alreadyRead: Boolean, shown: Set<String>, localCheckIn: Boolean): Boolean =
        id !in shown && !alreadyRead && !(kind == "habit" && localCheckIn)

    /** The cursor only moves forward, and the first run starts at "now" so old history never floods the phone. */
    fun nextCursor(current: Long, seen: List<Long>, now: Long): Long = if (current == 0L) now else maxOf(current, seen.maxOrNull() ?: current)
}
