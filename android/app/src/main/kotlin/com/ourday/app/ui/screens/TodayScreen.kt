package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ourday.app.sync.SyncStatus
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.domain.model.*
import com.ourday.domain.rules.DayState
import com.ourday.domain.rules.HabitRules
import com.ourday.domain.rules.TaskRules
import com.ourday.domain.rules.ViewMode


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    ui: AppUi, onOpenTask: (Task) -> Unit, onToggle: (Task) -> Unit, onHabit: (Habit) -> Unit, onToggleHabit: (Habit) -> Unit, onAddTask: () -> Unit, onDeadlines: () -> Unit, onHabits: () -> Unit,
    onRefresh: () -> Unit,
) {
    val d = ui.data
    val ws = d.workspace
    val subject = ui.subject
    val tasks = ui.tasks
    val deadlines = TaskRules.todayDeadlines(tasks, ui.today, ui.now, ui.zone)
    val daily = TaskRules.todayTasks(tasks, ui.today)
    val habits = HabitRules.todays(ui.habits, d.memberIds, subject, ui.today)
    fun owner(t: Task): Pair<String, Boolean>? = if (ui.isPartnerView || t.createdBy == d.meId) null else ws?.nameOf(t.createdBy)?.let { it to true }

    PullToRefreshBox(isRefreshing = ui.status is SyncStatus.Syncing, onRefresh = onRefresh) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 150.dp)) {
            item { PageHeading(Fmt.longDate(ui.today), "Today") }
            item { SyncStrip(ui) }
            if (ui.isPartnerView) item { PartnerBanner(ws?.partner?.firstName ?: "your partner") }
            if (ws == null) {
                item { EmptyState(if (ui.status is SyncStatus.Syncing || ui.lastSync == 0L) "Loading your workspace…" else "No workspace yet. Create or join one in the OurDay web app, then pull to refresh.") }
                return@LazyColumn
            }
            item { SectionHead(Icons.Rounded.Flag, "Deadlines", onClick = onDeadlines) }
            if (deadlines.isEmpty()) item { DashedEmpty("No active deadlines today") }
            items(deadlines.size, key = { "d" + deadlines[it].id }) { i -> val t = deadlines[i]; DeadlineRow(t, ui.now, ui.today, ui.zone, owner(t), ui.h24, { onToggle(t) }, { onOpenTask(t) }, edge = true) }

            item { SectionHead(Icons.Rounded.Checklist, "Daily tasks") }
            if (daily.isEmpty()) item { DashedEmpty("Nothing planned for today") }
            items(daily.size, key = { "p" + daily[it].id }) { i -> val t = daily[i]; TaskCard(t, owner(t), ui.h24, { onToggle(t) }, { onOpenTask(t) }) }

            item { SectionHead(Icons.Rounded.Repeat, "Habits", onClick = onHabits) }
            if (habits.isEmpty()) item { DashedEmpty("No habits scheduled today") }
            items(habits.size, key = { "h" + habits[it].id }) { i -> HabitRow(habits[i], ui, onOpen = { onHabit(habits[i]) }, onToggle = { onToggleHabit(habits[i]) }) }
        }
    }
}


/** The old Partner Mode toggle, kept only for the Tasks screen header (the four main screens use the shared header switch). */
@Composable
fun ModeBar(ui: AppUi, onMode: (ViewMode) -> Unit) {
    val ws = ui.data.workspace ?: return
    ModeToggle(ws.me?.name ?: "Me", ws.partner?.name, ui.mode, onMode)
}

/** A habit for today: your own record is a check button; a partner's record is shown read-only (the web HabitRow). */
@Composable
fun HabitRow(h: Habit, ui: AppUi, onOpen: () -> Unit, onToggle: () -> Unit) {
    val d = ui.data
    val logs = d.logs[h.id].orEmpty()
    val state = HabitRules.dayState(h, ui.subject, ui.today, ui.today, logs)
    val streak = HabitRules.streak(h, ui.subject, ui.today, logs)
    val writable = com.ourday.domain.rules.ViewRules.canWriteHabit(h, d.memberIds, d.meId, ui.subject)
    val done = state == DayState.DONE
    val who = if (ui.isPartnerView) d.workspace?.partner?.firstName ?: "Partner" else "You"
    val other = d.workspace?.partner
    OdCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), Od.line, 0.12f, com.ourday.app.ui.theme.OdShapes.card, dim = done, onClick = onOpen) {
        Row(Modifier.fillMaxWidth().padding(start = 6.dp, end = 12.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (writable) CheckButton(done, onToggle, if (done) "Undo: ${h.title}" else "Mark done: ${h.title}", size = 26.dp)
            else Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { ReadOnlyCheck(done) }
            Column(Modifier.weight(1f).padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(h.title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = if (done) Od.muted else Od.fg, maxLines = 1,
                    textDecoration = if (done) androidx.compose.ui.text.style.TextDecoration.LineThrough else null)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    ScopeBadge(com.ourday.domain.rules.HabitRules.scope(h, d.memberIds, d.meId))
                    val line = when {
                        state == DayState.MISSED -> "$who: marked missed"
                        done -> "$who: done"
                        ui.isPartnerView -> "$who: not yet today"
                        else -> HabitRules.scheduleLabel(h)
                    }
                    Text(line, style = MaterialTheme.typography.bodySmall, color = if (state == DayState.MISSED) Od.danger else if (done) (if (ui.isPartnerView) Od.partner else Od.ok) else Od.muted)
                    SyncBadge(h.syncState)
                }
                if (!ui.isPartnerView && h.isShared && other != null) {
                    val ps = HabitRules.dayState(h, other.id, ui.today, ui.today, logs)
                    Text("${other.firstName}: ${if (ps == DayState.DONE) "done" else "not yet"}", style = MaterialTheme.typography.bodySmall, color = if (ps == DayState.DONE) Od.partner else Od.muted)
                }
            }
            if (streak > 0) Pill("$streak", Od.warn, Icons.Rounded.LocalFireDepartment, fillAlpha = 0.12f, lineAlpha = 0f)
            Icon(Icons.Rounded.ChevronRight, null, Modifier.padding(start = 4.dp).size(24.dp), tint = Od.fg)
        }
    }
}

@Composable
fun ReadOnlyCheck(done: Boolean) {
    Box(
        Modifier.size(26.dp).semantics { role = Role.Image }.then(
            if (done) Modifier.then(Modifier.background(Od.ok, androidx.compose.foundation.shape.CircleShape)) else Modifier.then(Modifier.border(2.dp, Od.line(0.30f), androidx.compose.foundation.shape.CircleShape)),
        ),
        contentAlignment = Alignment.Center,
    ) { if (done) Icon(Icons.Rounded.Check, null, Modifier.size(16.dp), tint = androidx.compose.ui.graphics.Color.White) }
}

@Composable
fun ScopeBadge(scope: com.ourday.domain.rules.HabitScope) {
    when (scope) {
        com.ourday.domain.rules.HabitScope.SHARED -> Pill("Shared", Od.accent2, Icons.Rounded.Group)
        com.ourday.domain.rules.HabitScope.PARTNER -> Pill("Partner’s", Od.partner, Icons.Rounded.Person)
        com.ourday.domain.rules.HabitScope.PERSONAL -> Pill("Personal", Od.muted, fillAlpha = 0.14f, lineAlpha = 0.28f)
    }
}

/** A subtle offline / sync indicator, shown only when there is something to say. */
@Composable
fun SyncStrip(ui: AppUi) {
    val text = when {
        ui.reauth -> "Sign in again to sync. Your changes are saved on this phone."
        ui.status is SyncStatus.Offline -> "Offline · ${if (ui.pending > 0) "${ui.pending} change${if (ui.pending == 1) "" else "s"} saved on this phone" else "showing saved data"}"
        ui.status is SyncStatus.Syncing && ui.pending > 0 -> "Syncing ${ui.pending} change${if (ui.pending == 1) "" else "s"}…"
        ui.pending > 0 -> "${ui.pending} change${if (ui.pending == 1) "" else "s"} waiting to sync"
        else -> null
    } ?: return
    val offline = ui.status is SyncStatus.Offline || ui.reauth
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(if (offline) Icons.Rounded.CloudOff else Icons.Rounded.Sync, null, Modifier.size(16.dp), tint = if (offline) Od.warn else Od.muted)
        Text(text, style = MaterialTheme.typography.labelMedium, color = if (offline) Od.warn else Od.muted)
    }
}
