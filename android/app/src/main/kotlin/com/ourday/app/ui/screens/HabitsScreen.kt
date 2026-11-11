package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ourday.app.data.repo.OurDayRepository
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.Validation
import com.ourday.domain.model.*
import com.ourday.domain.rules.*
import java.time.LocalDate

private enum class HabitFilter { ALL, MINE, PARTNER, SHARED }

@Composable
fun HabitsScreen(ui: AppUi, onEdit: (Habit) -> Unit, onSetDay: (Habit, LocalDate, LogStatus?) -> Unit, onMode: (ViewMode) -> Unit) {
    var filter by rememberSaveable { mutableStateOf(HabitFilter.ALL) }
    val d = ui.data
    val partner = d.workspace?.partner
    // All follows the mode (the viewed person's personal habits plus shared ones); Mine / Partner's / Shared look at the whole workspace.
    val shown = when (filter) {
        HabitFilter.ALL -> ui.habits
        HabitFilter.MINE -> d.habits.filter { HabitRules.scope(it, d.memberIds, d.meId) == HabitScope.PERSONAL }
        HabitFilter.PARTNER -> d.habits.filter { HabitRules.scope(it, d.memberIds, d.meId) == HabitScope.PARTNER }
        HabitFilter.SHARED -> d.habits.filter { HabitRules.scope(it, d.memberIds, d.meId) == HabitScope.SHARED }
    }
    Column(Modifier.fillMaxSize()) {
        ScreenHeader(if (ui.isPartnerView) "${partner?.firstName ?: "Partner"}’s habits" else "Habits", "Everyone keeps their own record", trailing = { ModeBar(ui, onMode) })
        if (ui.isPartnerView) PartnerBanner(partner?.firstName ?: "your partner")
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterPill("All", filter == HabitFilter.ALL, { filter = HabitFilter.ALL })
            FilterPill("Mine", filter == HabitFilter.MINE, { filter = HabitFilter.MINE })
            FilterPill(partner?.firstName?.let { "$it’s" } ?: "Partner’s", filter == HabitFilter.PARTNER, { filter = HabitFilter.PARTNER })
            FilterPill("Shared", filter == HabitFilter.SHARED, { filter = HabitFilter.SHARED })
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 112.dp)) {
            if (shown.isEmpty()) item { DashedEmpty("No habits here") }
            items(shown, key = { it.id }) { h -> HabitCard(h, ui, onEdit = { onEdit(h) }, onSetDay = { day, st -> onSetDay(h, day, st) }) }
        }
    }
}

@Composable
fun HabitCard(h: Habit, ui: AppUi, onEdit: () -> Unit, onSetDay: (LocalDate, LogStatus?) -> Unit) {
    val d = ui.data
    val ws = d.workspace
    val logs = d.logs[h.id].orEmpty()
    val participants = HabitRules.participants(h, d.memberIds)
    val scope = HabitRules.scope(h, d.memberIds, d.meId)
    val canManage = HabitRules.canManage(h, d.memberIds, d.meId)
    var expanded by rememberSaveable(h.id) { mutableStateOf(false) }

    OdCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), Od.accent2, 0.22f, OdShapes.card, dim = h.paused) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(h.title, style = MaterialTheme.typography.titleMedium, color = Od.fg)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        ScopeBadge(scope)
                        Text(HabitRules.scheduleLabel(h) + if (h.paused) " · Paused" else "", style = MaterialTheme.typography.bodySmall, color = Od.muted)
                        SyncBadge(h.syncState)
                    }
                }
                if (canManage) IconButton(onClick = onEdit, Modifier.size(44.dp)) { Icon(Icons.Rounded.Edit, "Edit ${h.title}", tint = Od.muted) }
            }
            // One row per participant: independent status and streak; the action is only ever on YOUR OWN row.
            participants.forEach { uid ->
                val state = HabitRules.dayState(h, uid, ui.today, ui.today, logs)
                val streak = HabitRules.streak(h, uid, ui.today, logs)
                val mine = uid == d.meId
                Row(Modifier.fillMaxWidth().background(Od.elevated.copy(alpha = 0.6f), OdShapes.input).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Avatar(initialsOf(ws?.nameOf(uid)?.let { if (mine) ws.me?.name ?: it else it } ?: "?"), !mine, 26.dp)
                    Column(Modifier.weight(1f)) {
                        Text(if (mine) "You" else ws?.nameOf(uid) ?: "Partner", style = MaterialTheme.typography.labelLarge, color = Od.fg)
                        Text(
                            when (state) { DayState.DONE -> "Done today"; DayState.MISSED -> "Missed"; DayState.PENDING -> "Not yet today"; DayState.OFF -> "Not scheduled today" },
                            style = MaterialTheme.typography.bodySmall, color = when (state) { DayState.DONE -> Od.ok; DayState.MISSED -> Od.danger; else -> Od.muted },
                        )
                    }
                    if (streak > 0) Pill("$streak", Od.warn, Icons.Rounded.LocalFireDepartment, fillAlpha = 0.12f, lineAlpha = 0f)
                    if (mine && !h.paused && state != DayState.OFF) {
                        if (state == DayState.DONE) OdButton("Undo", { onSetDay(ui.today, null) }, style = OdButtonStyle.Ghost, modifier = Modifier.height(40.dp))
                        else {
                            if (state == DayState.PENDING) OdButton("Missed", { onSetDay(ui.today, LogStatus.MISSED) }, style = OdButtonStyle.Ghost, modifier = Modifier.height(40.dp))
                            OdButton("Done", { onSetDay(ui.today, LogStatus.DONE) }, style = OdButtonStyle.Soft, icon = Icons.Rounded.Check, modifier = Modifier.height(40.dp))
                        }
                    }
                }
            }
            val who = if (d.meId in participants) d.meId else participants.firstOrNull()
            if (who != null) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
                        Text(if (expanded) "Hide history" else "History", color = Od.accent); Icon(if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, null, tint = Od.accent)
                    }
                }
                if (expanded) HabitHistory(h, who, ui, logs, canEditDay = who == d.meId, onSetDay = onSetDay)
            }
        }
    }
}

@Composable
private fun HabitHistory(h: Habit, user: String, ui: AppUi, logs: Map<String, Map<LocalDate, HabitLog>>, canEditDay: Boolean, onSetDay: (LocalDate, LogStatus?) -> Unit) {
    val history = HabitRules.history(h, user, ui.today, logs, 60)
    val rate = HabitRules.completionRate(h, user, ui.today, logs)
    val best = HabitRules.longestStreak(h, user, ui.today, logs)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Best streak $best${if (rate != null) " · last 30 days $rate%" else ""}", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
        history.take(30).chunked(10).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { o ->
                    val c = when (o.state) { DayState.DONE -> Od.ok; DayState.MISSED -> Od.danger; else -> Od.line(0.2f) }
                    Box(Modifier.size(22.dp).background(c.copy(alpha = if (o.state == DayState.PENDING) 0.5f else 0.9f), CircleShape))
                }
            }
        }
        Text("Newest first. Green done, red missed. Days the habit isn’t scheduled are not shown.", style = MaterialTheme.typography.bodySmall, color = Od.muted)
        if (canEditDay) {
            val y = ui.today.minusDays(1)
            if (HabitRules.dayState(h, user, y, ui.today, logs) == DayState.MISSED) OdButton("I did it yesterday", { onSetDay(y, LogStatus.DONE) }, style = OdButtonStyle.Soft)
        }
    }
}

@Composable
fun HabitEditorSheet(existing: Habit?, ui: AppUi, onSave: (OurDayRepository.HabitInput) -> Unit, onPause: ((Boolean) -> Unit)?, onDelete: (() -> Unit)?, onDismiss: () -> Unit) {
    var title by rememberSaveable { mutableStateOf(existing?.title ?: "") }
    var notes by rememberSaveable { mutableStateOf(existing?.notes ?: "") }
    var shared by rememberSaveable { mutableStateOf(existing?.isShared ?: false) }
    var everyDay by rememberSaveable { mutableStateOf(existing?.scheduleDays == null) }
    var days by rememberSaveable { mutableStateOf((existing?.scheduleDays ?: setOf(1, 2, 3, 4, 5)).toList()) }
    var start by rememberSaveable { mutableStateOf(existing?.startDate ?: ui.today) }
    var notify by rememberSaveable { mutableStateOf(existing?.notifySecondUser ?: false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf(false) }
    val partner = ui.data.workspace?.partner?.firstName ?: "your partner"
    val names = listOf(1 to "M", 2 to "T", 3 to "W", 4 to "T", 5 to "F", 6 to "S", 0 to "S")

    val dirty = title != (existing?.title ?: "") || notes != (existing?.notes ?: "")
    AppBottomSheet(onDismiss, dirty) {
        Text(if (existing == null) "New habit" else "Edit habit", style = MaterialTheme.typography.titleLarge, color = Od.fg)
        OdTextField(title, { title = it; error = null }, "Habit name", error = error != null && title.isBlank())
        OdTextField(notes, { notes = it }, "Description (optional)", singleLine = false, minLines = 2)
        if (existing == null) SwitchRow("Shared with $partner", if (shared) "You each keep an independent record and streak." else "Only you check it off. It stays visible to both of you.", shared, { shared = it })
        Text("Repeats", style = MaterialTheme.typography.labelLarge, color = Od.fg)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterPill("Every day", everyDay, { everyDay = true })
            FilterPill("Selected days", !everyDay, { everyDay = false })
        }
        if (!everyDay) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            names.forEach { (n, label) ->
                val on = n in days
                Box(Modifier.weight(1f).heightIn(min = 44.dp).background(if (on) Od.accent.copy(alpha = 0.15f) else androidx.compose.ui.graphics.Color.Transparent, OdShapes.control)
                    .border(1.dp, if (on) Od.accent.copy(alpha = 0.5f) else Od.line(0.15f), OdShapes.control).clickable { days = if (on) days - n else days + n }, contentAlignment = Alignment.Center) {
                    Text(label, style = MaterialTheme.typography.labelLarge, color = if (on) Od.accent else Od.muted)
                }
            }
        }
        if (existing == null) DatePickerField("Start date", start, { start = it }, Modifier.fillMaxWidth())
        if (!shared) SwitchRow("Notify $partner", "Controls notifications only.", notify, { notify = it })
        if (existing != null && onPause != null) SwitchRow("Active", if (existing.paused) "Paused: not scheduled and not asked about." else "Scheduled as set above.", !existing.paused, { onPause(!it); onDismiss() })
        FormError(error)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onDelete != null) OdButton("Delete", { confirm = true }, style = OdButtonStyle.Danger, icon = Icons.Rounded.Delete)
            Spacer(Modifier.weight(1f))
            OdButton("Cancel", onDismiss, style = OdButtonStyle.Ghost)
            OdButton("Save", {
                val v = Validation.habitTitle(title)
                if (v is Validation.Result.Error) { error = v.message; return@OdButton }
                if (!everyDay && days.isEmpty()) { error = "Pick at least one day."; return@OdButton }
                onSave(OurDayRepository.HabitInput(title, notes, shared, if (everyDay) null else days.toSet(), start, notify)); onDismiss()
            })
        }
    }
    if (confirm) ConfirmationDialog("Delete this habit?", "Its history is deleted for both of you. This can’t be undone.", "Delete", true, { confirm = false; onDelete?.invoke(); onDismiss() }, { confirm = false })
}
