package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.app.sync.SyncStatus
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.*
import com.ourday.domain.rules.TaskRules
import com.ourday.domain.rules.Urgency
import com.ourday.domain.rules.UrgencyRules
import com.ourday.domain.rules.ViewRules

/** Existing greeting rule, kept as it was on the Today screen. */
fun greetingFor(hour: Int) = if (hour < 5) "Good evening" else if (hour < 12) "Good morning" else if (hour < 17) "Good afternoon" else "Good evening"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    ui: AppUi, onOpenTask: (Task) -> Unit, onToggle: (Task) -> Unit, onAddTask: () -> Unit, onDeadlines: () -> Unit, onTasks: () -> Unit, onShared: () -> Unit, onRana: () -> Unit, onRefresh: () -> Unit,
) {
    val d = ui.data
    val ws = d.workspace
    val partner = ws?.partner
    val upcoming = TaskRules.upcomingDeadlines(ui.tasks, ui.now, 3)
    val daily = TaskRules.todayTasks(ui.tasks, ui.today)
    val shared = ViewRules.sharedTasks(d.tasks).sortedWith(compareBy<Task> { it.sharedState == SharedState.COMPLETED }.thenByDescending { it.createdAt }).take(3)
    val hour = ui.now.atZone(ui.zone).hour
    val night = hour < 5 || hour >= 18

    PullToRefreshBox(isRefreshing = ui.status is SyncStatus.Syncing, onRefresh = onRefresh) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val big = MaterialTheme.typography.displaySmall.copy(fontSize = 36.sp, lineHeight = 42.sp, fontWeight = FontWeight.Bold)
                    if (ui.isPartnerView) Text("${partner?.firstName ?: "Partner"}’s day", style = big, color = Od.fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    else {
                        Text(if (ws?.me?.firstName != null) "${greetingFor(hour)}," else greetingFor(hour), style = big, color = Od.fg, maxLines = 1)
                        ws?.me?.firstName?.let { name ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(name, style = big, color = Od.fg, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                Icon(if (night) Icons.Rounded.DarkMode else Icons.Rounded.WbSunny, if (night) "Evening" else "Daytime", Modifier.size(30.dp), tint = Color(0xFFFFC857))
                            }
                        }
                    }
                    Text("Here’s your day at a glance.", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp), color = Od.muted)
                }
            }
            item { SyncStrip(ui) }
            if (ui.isPartnerView) item { PartnerBanner(partner?.firstName ?: "your partner") }
            if (ws == null) {
                item { EmptyState(if (ui.status is SyncStatus.Syncing || ui.lastSync == 0L) "Loading your workspace…" else "No workspace yet. Create or join one in the OurDay web app, then pull to refresh.") }
                return@LazyColumn
            }

            // ---- Upcoming deadlines: at most three real ones --------------------------------------------------------------
            item {
                Spacer(Modifier.height(22.dp))
                HomeCard {
                    Row(Modifier.fillMaxWidth().clickable(onClick = onDeadlines).padding(horizontal = 16.dp).heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Icon(Icons.Rounded.Flag, null, Modifier.size(26.dp), tint = Od.accent)
                        Text("Deadlines", style = MaterialTheme.typography.titleLarge.copy(fontSize = 21.sp, fontWeight = FontWeight.Bold), color = Od.fg, modifier = Modifier.weight(1f))
                        Icon(Icons.Rounded.ChevronRight, "Open deadlines", Modifier.size(26.dp), tint = Od.fg)
                    }
                    if (upcoming.isEmpty()) Text("No deadlines approaching", style = MaterialTheme.typography.bodyLarge, color = Od.muted, modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 18.dp, top = 2.dp))
                    upcoming.forEachIndexed { i, t ->
                        if (i > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = Od.line(0.08f))
                        DeadlineLine(t, ui, onToggle = { onToggle(t) }, onClick = { onOpenTask(t) })
                    }
                }
            }

            // ---- Tasks ------------------------------------------------------------------------------------------------------
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 28.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Tasks", Modifier.weight(1f).clickable(onClick = onTasks).heightIn(min = 44.dp).wrapContentHeight(Alignment.CenterVertically), style = MaterialTheme.typography.titleLarge.copy(fontSize = 24.sp, fontWeight = FontWeight.Bold), color = Od.fg)
                    AddAction(onAddTask)
                }
                if (daily.isEmpty()) DashedEmpty("Nothing planned for today")
                else HomeCard {
                    daily.forEach { t -> TaskLine(t, ui, onToggle = { onToggle(t) }, onClick = { onOpenTask(t) }) }
                }
            }

            // ---- Shared with partner ----------------------------------------------------------------------------------------
            if (partner != null || shared.isNotEmpty()) item {
                Row(Modifier.fillMaxWidth().clickable(onClick = onShared).padding(horizontal = 20.dp).padding(top = 28.dp, bottom = 10.dp).heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Icon(Icons.Rounded.Group, null, Modifier.size(26.dp), tint = Od.muted)
                    Text(if (partner != null) "Shared with ${partner.firstName}" else "Shared", style = MaterialTheme.typography.titleLarge.copy(fontSize = 21.sp, fontWeight = FontWeight.Bold), color = Od.fg, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Icon(Icons.Rounded.ChevronRight, "Open shared tasks", Modifier.size(26.dp), tint = Od.fg)
                }
                if (shared.isEmpty()) DashedEmpty("Nothing shared yet")
                else HomeCard { shared.forEach { t -> SharedLine(t, ui, onClick = onShared) } }
            }

            item { Spacer(Modifier.height(8.dp)); RanaEntry(onRana) }
        }
    }
}

@Composable
private fun HomeCard(content: @Composable ColumnScope.() -> Unit) {
    val shape = OdShapes.card
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(Od.surface, shape).border(1.dp, Od.line(0.12f), shape), content = content)
}

@Composable
private fun DeadlineLine(t: Task, ui: AppUi, onToggle: () -> Unit, onClick: () -> Unit) {
    val u = UrgencyRules.of(t, ui.now)
    val due = t.dueAt
    val dueToday = due != null && TaskRules.dayOf(due, ui.zone) == ui.today
    val hot = u == Urgency.CRITICAL || u == Urgency.APPROACHING || u == Urgency.OVERDUE || dueToday
    Row(Modifier.fillMaxWidth().then(if (hot) Modifier.leftEdge(Od.accent) else Modifier).clickable(onClick = onClick).padding(start = 12.dp, end = 16.dp).heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        CheckButton(!t.isOpen, onToggle, if (t.isOpen) "Mark complete: ${t.title}" else "Mark incomplete: ${t.title}", size = 26.dp)
        Text(t.title, Modifier.weight(1f).padding(horizontal = 6.dp), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp), color = if (t.isOpen) Od.fg else Od.muted, maxLines = 1, overflow = TextOverflow.Ellipsis,
            textDecoration = if (t.isOpen) null else TextDecoration.LineThrough)
        if (due != null) Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Schedule, null, Modifier.size(16.dp), tint = if (hot) Od.accent else Od.muted)
            Text(if (dueToday) Fmt.time(due, ui.zone, ui.h24) else Fmt.deadline(due, ui.today, ui.zone, ui.h24), style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp), color = if (hot) Od.accent else Od.muted, maxLines = 1)
        }
    }
}

@Composable
private fun TaskLine(t: Task, ui: AppUi, onToggle: () -> Unit, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(start = 8.dp, end = 16.dp).heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically) {
        SquareCheck(!t.isOpen, onToggle, if (t.isOpen) "Mark complete: ${t.title}" else "Mark incomplete: ${t.title}")
        Text(t.title, Modifier.weight(1f).padding(horizontal = 4.dp), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp), color = if (t.isOpen) Od.fg else Od.muted, maxLines = 2, overflow = TextOverflow.Ellipsis,
            textDecoration = if (t.isOpen) null else TextDecoration.LineThrough)
        SyncBadge(t.syncState)
        t.plannedTime?.let { Row(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Schedule, null, Modifier.size(17.dp), tint = if (t.isOpen) Od.accent else Od.muted)
            Text(Fmt.clock(it, ui.h24), style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp), color = if (t.isOpen) Od.accent else Od.muted, maxLines = 1)
        } }
    }
}

/** A shared task: read-only state here (approval always happens on the Shared screen), with both members' avatars. */
@Composable
private fun SharedLine(t: Task, ui: AppUi, onClick: () -> Unit) {
    val ws = ui.data.workspace
    val state = t.sharedState ?: SharedState.ACTIVE
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(start = 8.dp, end = 16.dp).heightIn(min = 60.dp), verticalAlignment = Alignment.CenterVertically) {
        SquareCheck(state == SharedState.COMPLETED, null, "${t.title}: ${when (state) { SharedState.COMPLETED -> "completed"; SharedState.AWAITING_APPROVAL -> "awaiting approval"; else -> "active" }}")
        Column(Modifier.weight(1f).padding(horizontal = 4.dp, vertical = 6.dp)) {
            Text(t.title, style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp), color = if (state == SharedState.COMPLETED) Od.muted else Od.fg, maxLines = 1, overflow = TextOverflow.Ellipsis,
                textDecoration = if (state == SharedState.COMPLETED) TextDecoration.LineThrough else null)
            if (state == SharedState.AWAITING_APPROVAL) Text("Awaiting approval", style = MaterialTheme.typography.bodySmall, color = Od.warn)
        }
        SyncBadge(t.syncState)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Avatar(initialsOf(ws?.me?.name ?: "Me").take(1), false, 32.dp, solid = true)
            ws?.partner?.let { Avatar(initialsOf(it.name).take(1), true, 32.dp, solid = true) }
        }
    }
}

/** RANA: a quiet entry to today's briefing (the assistant itself is unchanged). */
@Composable
fun RanaEntry(onRana: () -> Unit) {
    OdCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), Od.accent, 0.22f, OdShapes.card, onClick = onRana) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            RanaMark(44.dp)
            Column(Modifier.weight(1f)) {
                Text("RANA briefing", style = MaterialTheme.typography.titleMedium, color = Od.fg)
                Text("Your deadlines and today’s plan", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
            }
            Icon(Icons.Rounded.ChevronRight, null, tint = Od.muted)
        }
    }
}
