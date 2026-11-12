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
import androidx.compose.ui.graphics.Color
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
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 150.dp)) {
        item { PageHeading("Consistency", "Habits") }
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
                Text(h.title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Od.fg)
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
            // Current streaks only: one per person (a personal habit shows just its owner).
            Row(horizontalArrangement = Arrangement.spacedBy(22.dp), verticalAlignment = Alignment.CenterVertically) {
                participants.forEach { uid ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("🔥", fontSize = 22.sp)
                        Text("${HabitRules.streak(h, uid, ui.today, logs)}", style = MaterialTheme.typography.headlineMedium.copy(fontSize = 26.sp, fontWeight = FontWeight.Bold), color = Od.fg)
                        Text(if (uid != d.meId) "${name(uid)}’s streak" else if (participants.size > 1) "My streak" else "current streak", style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp), color = Od.muted)
                    }
                }
            }
            // One calendar for everyone on this habit; each person's completions have their own marker colour.
            HabitMonthCalendar(h, participants, ui, logs, ::name, d.meId)
            if (iParticipate && !h.paused) {
                val y = ui.today.minusDays(1)
                if (HabitRules.dayState(h, d.meId, y, ui.today, logs) == DayState.MISSED) OdButton("I did it yesterday", { onSetDay(y, LogStatus.DONE) }, style = OdButtonStyle.Soft)
            }
        }
    }
}

@Composable
private fun markerColor(uid: String, me: String) = if (uid == me) Od.accent else Od.partner

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
/** Full month: all dates, the real state of each, previous / next month. Done = a coloured dot per person; missed = red tint; scheduled = outline; unscheduled = dim. */
@Composable
private fun HabitMonthCalendar(h: Habit, participants: List<String>, ui: AppUi, logs: Map<String, Map<LocalDate, HabitLog>>, name: (String) -> String, me: String) {
    var month by rememberSaveable(h.id) { mutableStateOf(java.time.YearMonth.from(ui.today).toString()) }
    val ym = java.time.YearMonth.parse(month)
    val lead = ym.atDay(1).dayOfWeek.value - 1
    val cells: List<LocalDate?> = List(lead) { null } + (1..ym.lengthOfMonth()).map { ym.atDay(it) }
    val shape = RoundedCornerShape(10.dp)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton({ month = ym.minusMonths(1).toString() }, Modifier.size(44.dp)) { Icon(Icons.Rounded.ChevronLeft, "Previous month", tint = Od.fg) }
            Text("${ym.month.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.getDefault())} ${ym.year}", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp, fontWeight = FontWeight.SemiBold), color = Od.fg, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            IconButton({ month = ym.plusMonths(1).toString() }, Modifier.size(44.dp)) { Icon(Icons.Rounded.ChevronRight, "Next month", tint = Od.fg) }
        }
        Row(Modifier.fillMaxWidth()) {
            listOf("M", "T", "W", "T", "F", "S", "S").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = Od.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
        }
        (cells + List((7 - cells.size % 7) % 7) { null }).chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                week.forEach { day ->
                    if (day == null) { Spacer(Modifier.weight(1f).height(44.dp)); return@forEach }
                    val states = participants.associateWith { HabitRules.dayState(h, it, day, ui.today, logs) }
                    val scheduled = states.values.any { it != DayState.OFF }
                    val missed = day <= ui.today && states.values.any { it == DayState.MISSED }
                    val doneBy = participants.filter { states[it] == DayState.DONE }
                    val desc = "${day.dayOfMonth}: " + when {
                        doneBy.isNotEmpty() -> "done by ${doneBy.joinToString { name(it) }}"; missed -> "missed"; scheduled -> "scheduled"; else -> "not scheduled"
                    }
                    Box(
                        Modifier.weight(1f).height(44.dp).background(if (missed && doneBy.isEmpty()) Od.danger.copy(alpha = 0.16f) else Color.Transparent, shape)
                            .border(if (day == ui.today) 1.5.dp else 1.dp, if (day == ui.today) Od.accent else if (scheduled && doneBy.isEmpty() && !missed) Od.line(0.22f) else Color.Transparent, shape)
                            .semantics { contentDescription = desc },
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(day.dayOfMonth.toString(), style = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, fontWeight = if (doneBy.isNotEmpty()) FontWeight.Bold else FontWeight.Normal), color = if (scheduled) Od.fg else Od.muted.copy(alpha = 0.5f))
                            Row(Modifier.height(8.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                                doneBy.forEach { Box(Modifier.size(7.dp).background(markerColor(it, me), CircleShape)) }
                            }
                        }
                    }
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            participants.forEach { uid -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) { Box(Modifier.size(9.dp).background(markerColor(uid, me), CircleShape)); Text("${name(uid)} done", style = MaterialTheme.typography.bodySmall, color = Od.muted) } }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) { Box(Modifier.size(9.dp).background(Od.danger.copy(alpha = 0.5f), CircleShape)); Text("Missed", style = MaterialTheme.typography.bodySmall, color = Od.muted) }
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
