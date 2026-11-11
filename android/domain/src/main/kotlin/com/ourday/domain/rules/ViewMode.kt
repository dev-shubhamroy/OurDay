package com.ourday.domain.rules

import com.ourday.domain.model.Habit
import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind

/**
 * Partner Mode (port of frontend viewMode.ts / selectors tasksOwnedBy + habitsOf). It is a VIEWING FILTER only: it chooses whose
 * personal context to show. It never changes the signed-in account, the workspace, ownership or any completion record.
 */
enum class ViewMode { ME, PARTNER }

object ViewRules {
    /** Without a partner there is nobody to show, so Partner Mode falls back to My Mode (nothing is stored or changed). */
    fun resolve(stored: ViewMode, hasPartner: Boolean): ViewMode = if (stored == ViewMode.PARTNER && hasPartner) ViewMode.PARTNER else ViewMode.ME

    fun subject(mode: ViewMode, me: String, partner: String?): String = if (mode == ViewMode.PARTNER && partner != null) partner else me

    /** Personal tasks belong to their creator. Shared tasks are NOT personal: they are never filtered by mode (see [sharedTasks]). */
    fun tasksFor(tasks: List<Task>, subject: String): List<Task> = tasks.filter { it.kind != TaskKind.SHARED && it.createdBy == subject }

    /** Shared tasks stay accessible in both modes, whoever created them. */
    fun sharedTasks(tasks: List<Task>): List<Task> = tasks.filter { it.kind == TaskKind.SHARED }

    /** Habits the subject takes part in: their personal habits plus shared ones. */
    fun habitsFor(habits: List<Habit>, memberIds: List<String>, subject: String): List<Habit> = habits.filter { subject in HabitRules.participants(it, memberIds) }

    /** You can only write YOUR OWN record, whichever mode is on; a partner's personal habit is read-only. */
    fun canWriteHabit(h: Habit, memberIds: List<String>, me: String, subject: String): Boolean = subject == me && me in HabitRules.participants(h, memberIds)

    /** Tab-level modes only apply to personal screens; Shared and More ignore the mode. */
    fun wire(mode: ViewMode) = if (mode == ViewMode.PARTNER) "partner" else "me"
    fun fromWire(s: String?) = if (s == "partner") ViewMode.PARTNER else ViewMode.ME
}
