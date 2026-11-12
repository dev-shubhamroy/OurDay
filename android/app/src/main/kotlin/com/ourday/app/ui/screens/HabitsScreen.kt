package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
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

private enum class HabitFilter(val label: String) { ALL("All"), PERSONAL("Personal"), PARTNER("Partner’s"), SHARED("Shared") }

@Composable
fun HabitsScreen(ui: AppUi, onEdit: (Habit) -> Unit, onAdd: () -> Unit, onSetDay: (Habit, LocalDate, LogStatus?) -> Unit) {
    var filter by rememberSaveable { mutableStateOf(HabitFilter.ALL) }
    val d = ui.data
    val partner = d.workspace?.partner
    // All follows the mode (the viewed person's personal habits plus shared ones); Personal / Partner's / Shared look at the whole workspace.
    val shown = when (filter) {
        HabitFilter.ALL -> ui.habits
        HabitFilter.PERSONAL -> d.habits.filter { HabitRules.scope(it, d.memberIds, d.meId) == HabitScope.PERSONAL }
        HabitFilter.PARTNER -> d.habits.filter { HabitRules.scope(it, d.memberIds, d.meId) == HabitScope.PARTNER }
        HabitFilter.SHARED -> d.habits.filter { HabitRules.scope(it, d.memberIds, d.meId) == HabitScope.SHARED }
    }
    val summary = HabitRules.summary(d.habits, d.memberIds, ui.subject, ui.today, d.logs)
    val filters = if (partner != null || filter == HabitFilter.PARTNER) HabitFilter.entries else HabitFilter.entries - HabitFilter.PARTNER
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageHeading("Consistency", "Habits", trailing = { AddButton("Add a habit", onAdd) }) }
        item { SyncStrip(ui) }
        if (ui.isPartnerView) item { PartnerBanner(partner?.firstName ?: "your partner") }
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Metric("${summary.done}/${summary.total}", "done today", Modifier.weight(1f))
                Box(Modifier.width(1.dp).height(28.dp).background(Od.line(0.15f)))
                Metric("${summary.bestStreak}", "-day best streak", Modifier.weight(1f))
            }
        }
        item {
            SegmentedFilter(filters.map { if (it == HabitFilter.PARTNER) partner?.firstName?.let { n -> "$n’s" } ?: it.label else it.label }, filters.indexOf(filter), { filter = filters[it] }, Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }
        if (shown.isEmpty()) item { Spacer(Modifier.height(12.dp)); DashedEmpty("No habits here") }
        items(shown, key = { it.id }) { h -> HabitCard(h, ui, onEdit = { onEdit(h) }, onSetDay = { day, st -> onSetDay(h, day, st) }) }
    }
}

@Composable
private fun Metric(value: String, label: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.Bottom) {
        Text(value, style = MaterialTheme.typography.headlineMedium.copy(fontSize = 28.sp, fontWeight = FontWeight.Bold), color = Od.fg, maxLines = 1)
        Text(" $label", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp), color = Od.muted, modifier = Modifier.padding(bottom = 3.dp), maxLines = 2)
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun HabitCard(h: Habit, ui: AppUi, onEdit: () -> Unit, onSetDay: (LocalDate, LogStatus?) -> Unit) {
    val d = ui.data
    val ws = d.workspace
    val logs = d.logs[h.id].orEmpty()
    // Me first, then the partner (shared habits): every person keeps an independent record, streak and history.
    val participants = HabitRules.participants(h, d.memberIds).sortedBy { it != d.meId }
    val scope = HabitRules.scope(h, d.memberIds, d.meId)
    val canManage = HabitRules.canManage(h, d.memberIds, d.meId)
    var expanded by rememberSaveable(h.id) { mutableStateOf(false) }
    fun name(uid: String) = if (uid == d.meId) "You" else ws?.nameOf(uid)?.substringBefore(' ') ?: "Partner"
    fun initials(uid: String) = initialsOf((if (uid == d.meId) ws?.me?.name else ws?.nameOf(uid)) ?: "?")
    val myState = HabitRules.dayState(h, d.meId, ui.today, ui.today, logs)
    val iParticipate = d.meId in participants

    OdCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), Od.line, 0.12f, OdShapes.card, dim = h.paused) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(h.title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Od.fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (canManage) IconButton(onClick = onEdit, Modifier.size(48.dp)) { Icon(Icons.Outlined.Edit, "Edit ${h.title}", Modifier.size(24.dp), tint = Od.muted) }
                // The check acts on YOUR OWN record only; a partner's personal habit shows their state read-only.
                if (iParticipate && !h.paused && myState != DayState.OFF) CheckButton(myState == DayState.DONE, { onSetDay(ui.today, if (myState == DayState.DONE) null else LogStatus.DONE) }, if (myState == DayState.DONE) "Undo: ${h.title}" else "Mark done: ${h.title}", size = 38.dp)
                else Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { ReadOnlyCheck(participants.firstOrNull()?.let { HabitRules.dayState(h, it, ui.today, ui.today, logs) } == DayState.DONE) }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ScopeBadge(scope)
                Text(HabitRules.scheduleLabel(h) + if (h.paused) " · Paused" else "", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp), color = Od.muted)
                SyncBadge(h.syncState)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                participants.forEach { uid ->
                    val st = HabitRules.dayState(h, uid, ui.today, ui.today, logs)
                    val label = when (st) { DayState.DONE -> "Done"; DayState.MISSED -> "Missed"; DayState.PENDING -> "Pending"; DayState.OFF -> "Not scheduled today" }
                    val shape = CircleShape
                    Row(Modifier.background(Od.elevated.copy(alpha = 0.6f), shape).border(1.dp, Od.line(0.12f), shape).padding(start = 6.dp, end = 14.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Avatar(initials(uid), uid != d.meId, 30.dp)
                        Text("${name(uid)} · $label", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp), color = when (st) { DayState.DONE -> Od.ok; DayState.MISSED -> Od.danger; else -> Od.fg }, maxLines = 1)
                    }
                }
            }
            // Statistics: current streak, longest streak and the real completion rate of the last 7 days, per person.
            val panel = RoundedCornerShape(16.dp)
            Column(Modifier.fillMaxWidth().border(1.dp, Od.accent.copy(alpha = 0.55f), panel).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                participants.forEach { uid ->
                    val cur = HabitRules.streak(h, uid, ui.today, logs)
                    val best = HabitRules.longestStreak(h, uid, ui.today, logs)
                    val week = HabitRules.completionRate(h, uid, ui.today, logs, 7)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Avatar(initials(uid), uid != d.meId, 30.dp)
                            Text(name(uid), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp), color = Od.fg)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(36.dp)) {
                            Stat("Current", Icons.Outlined.LocalFireDepartment, cur)
                            Stat("Longest", Icons.Outlined.EmojiEvents, best)
                        }
                        Text(if (week != null) "$week% this week" else "No scheduled days yet this week", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp), color = Od.fg)
                    }
                }
            }
            val who = if (ui.subject in participants) ui.subject else participants.firstOrNull()
            if (who != null) {
                WeekStrip(HabitRules.week(h, who, ui.today, logs), ui.today)
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
private fun Stat(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, value: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp, letterSpacing = 2.sp), color = Od.muted)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, Modifier.size(26.dp), tint = Od.muted)
            Text(value.toString(), style = MaterialTheme.typography.headlineMedium.copy(fontSize = 34.sp, fontWeight = FontWeight.Bold), color = Od.fg)
        }
    }
}

/** Monday to Sunday of this week: weekday letter, the real date and that day's real state. */
@Composable
private fun WeekStrip(week: List<HabitRules.Occurrence>, today: LocalDate) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        week.forEach { o ->
            val future = o.day > today
            val (bg, fg) = when {
                o.state == DayState.DONE -> Od.ok.copy(alpha = 0.22f) to Od.ok
                o.state == DayState.MISSED && !future -> Od.danger.copy(alpha = 0.18f) to Od.danger
                else -> Od.elevated to Od.fg
            }
            val shape = RoundedCornerShape(10.dp)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(o.day.dayOfWeek.getDisplayName(java.time.format.TextStyle.NARROW, java.util.Locale.getDefault()), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp), color = Od.muted)
                Box(
                    Modifier.fillMaxWidth().height(44.dp).background(bg, shape).then(if (o.day == today) Modifier.border(1.5.dp, Od.accent, shape) else Modifier).alpha(if (o.state == DayState.OFF || future) 0.55f else 1f)
                        .semantics { contentDescription = "${o.day.dayOfMonth}: ${when (o.state) { DayState.DONE -> "done"; DayState.MISSED -> if (future) "scheduled" else "missed"; DayState.PENDING -> "scheduled"; DayState.OFF -> "not scheduled" }}" },
                    contentAlignment = Alignment.Center,
                ) { Text(o.day.dayOfMonth.toString(), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, fontWeight = if (o.state == DayState.DONE) FontWeight.Bold else FontWeight.Normal), color = fg, maxLines = 1) }
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
