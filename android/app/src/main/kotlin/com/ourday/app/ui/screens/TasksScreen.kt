package com.ourday.app.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Sort
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
import com.ourday.domain.Validation
import com.ourday.domain.model.*
import com.ourday.domain.rules.Reminders
import com.ourday.domain.rules.TaskRules
import com.ourday.domain.rules.UrgencyRules
import com.ourday.domain.rules.ViewMode
import java.time.Duration
import java.time.Instant
import java.time.LocalTime

@Composable
fun TasksScreen(ui: AppUi, onOpen: (Task) -> Unit, onToggle: (Task) -> Unit, onMode: (ViewMode) -> Unit, onBack: (() -> Unit)? = null) {
    var status by rememberSaveable { mutableStateOf(TaskRules.StatusFilter.OPEN) }
    var kind by rememberSaveable { mutableStateOf(TaskRules.KindFilter.ALL) }
    var sort by rememberSaveable { mutableStateOf(TaskRules.Sort.DATE) }
    var menu by remember { mutableStateOf(false) }
    val d = ui.data
    // Partner Mode: the partner's personal tasks. Shared tasks live on the Shared tab in both modes.
    val tasks = TaskRules.list(ui.tasks, ui.subject, status, kind, TaskRules.OwnerFilter.BOTH, sort)

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(if (ui.isPartnerView) "${d.workspace?.partner?.firstName ?: "Partner"}’s tasks" else "Tasks", "Everything planned", onBack = onBack, trailing = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box {
                    IconButton(onClick = { menu = true }, Modifier.size(48.dp)) { Icon(Icons.Rounded.Sort, "Sort", tint = Od.muted) }
                    DropdownMenu(menu, { menu = false }, containerColor = Od.surface) {
                        listOf(TaskRules.Sort.DATE to "By date", TaskRules.Sort.NEWEST to "Newest first", TaskRules.Sort.TITLE to "By title").forEach { (s, label) ->
                            DropdownMenuItem(text = { Text(label, color = Od.fg) }, onClick = { sort = s; menu = false }, trailingIcon = { if (sort == s) Text("✓", color = Od.accent) })
                        }
                    }
                }
                ModeBar(ui, onMode)
            }
        })
        if (ui.isPartnerView) PartnerBanner(d.workspace?.partner?.firstName ?: "your partner")
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterPill("Open", status == TaskRules.StatusFilter.OPEN, { status = TaskRules.StatusFilter.OPEN })
            FilterPill("Completed", status == TaskRules.StatusFilter.COMPLETED, { status = TaskRules.StatusFilter.COMPLETED })
            FilterPill("All", status == TaskRules.StatusFilter.ALL, { status = TaskRules.StatusFilter.ALL })
            Spacer(Modifier.width(6.dp))
            FilterPill("Any type", kind == TaskRules.KindFilter.ALL, { kind = TaskRules.KindFilter.ALL })
            FilterPill("Daily", kind == TaskRules.KindFilter.DAILY, { kind = TaskRules.KindFilter.DAILY })
            FilterPill("Deadlines", kind == TaskRules.KindFilter.DEADLINE, { kind = TaskRules.KindFilter.DEADLINE })
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 112.dp)) {
            if (tasks.isEmpty()) item { DashedEmpty(if (status == TaskRules.StatusFilter.COMPLETED) "Nothing completed yet" else "No tasks here") }
            items(tasks, key = { it.id }) { t ->
                if (t.kind == TaskKind.DEADLINE) DeadlineCard(t, ui.now, ui.today, ui.zone, null, ui.h24, { onToggle(t) }, { onOpen(t) })
                else TaskCard(t, null, ui.h24, { onToggle(t) }, { onOpen(t) })
            }
        }
    }
}

/** Create or edit. New: choose Daily, Deadline or Shared. Edit: the kind is fixed. Unsaved text survives rotation. */
@Composable
fun TaskEditorSheet(existing: Task?, ui: AppUi, initialKind: TaskKind = TaskKind.DAILY, onSave: (OurDayRepository.TaskInput) -> Unit, onDelete: (() -> Unit)?, onDismiss: () -> Unit) {
    val today = ui.today
    var kind by rememberSaveable { mutableStateOf(existing?.kind ?: initialKind) }
    var title by rememberSaveable { mutableStateOf(existing?.title ?: "") }
    var notes by rememberSaveable { mutableStateOf(existing?.notes ?: "") }
    var date by rememberSaveable { mutableStateOf(existing?.let { if (it.dueAt != null) it.dueAt!!.atZone(ui.zone).toLocalDate() else it.date } ?: today) }
    var time by rememberSaveable { mutableStateOf(existing?.dueAt?.atZone(ui.zone)?.toLocalTime()?.withSecond(0)?.withNano(0) ?: LocalTime.of(18, 0)) }
    var planned by rememberSaveable { mutableStateOf<LocalTime?>(existing?.plannedTime) }
    var hasDeadline by rememberSaveable { mutableStateOf(existing?.dueAt != null || kind == TaskKind.DEADLINE) }
    var notify by rememberSaveable { mutableStateOf(existing?.notifySecondUser ?: false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val partner = ui.data.workspace?.partner?.firstName ?: "your partner"

    val dirty = title != (existing?.title ?: "") || notes != (existing?.notes ?: "")
    AppBottomSheet(onDismiss, dirty) {
        Text(if (existing == null) "New task" else "Edit task", style = MaterialTheme.typography.titleLarge, color = Od.fg)
        if (existing == null) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterPill("Daily task", kind == TaskKind.DAILY, { kind = TaskKind.DAILY; hasDeadline = false })
                FilterPill("Deadline", kind == TaskKind.DEADLINE, { kind = TaskKind.DEADLINE; hasDeadline = true })
                FilterPill("Shared", kind == TaskKind.SHARED, { kind = TaskKind.SHARED; hasDeadline = false })
            }
        }
        OdTextField(title, { title = it; error = null }, "Title", error = error != null && title.isBlank())
        OdTextField(notes, { notes = it }, "Description (optional)", singleLine = false, minLines = 2)
        when (kind) {
            TaskKind.DAILY -> {
                DatePickerField("Planned date", date, { date = it }, Modifier.fillMaxWidth())
                TimePickerField("Time (optional)", planned, { planned = it }, ui.h24, Modifier.fillMaxWidth(), clearable = true)
            }
            TaskKind.DEADLINE -> {
                DatePickerField("Deadline date", date, { date = it }, Modifier.fillMaxWidth(), minDate = if (existing == null) today else null)
                TimePickerField("Deadline time", time, { time = it ?: time }, ui.h24, Modifier.fillMaxWidth())
            }
            TaskKind.SHARED -> {
                SwitchRow("Add a deadline", "Optional. Finishing a shared task needs $partner’s approval.", hasDeadline, { hasDeadline = it })
                if (hasDeadline) {
                    DatePickerField("Deadline date", date, { date = it }, Modifier.fillMaxWidth(), minDate = if (existing == null) today else null)
                    TimePickerField("Deadline time", time, { time = it ?: time }, ui.h24, Modifier.fillMaxWidth())
                }
            }
        }
        if (kind != TaskKind.SHARED) SwitchRow("Notify $partner", "Controls notifications only. Both of you can always see and edit it.", notify, { notify = it })
        FormError(error)
        val dueInstant: Instant? = if (kind == TaskKind.DEADLINE || (kind == TaskKind.SHARED && hasDeadline)) date.atTime(time).atZone(ui.zone).toInstant() else null
        existing?.takeIf { it.kind != TaskKind.DAILY && it.dueAt != null && it.isOpen }?.let { Reminders.next(it, it.updatedAt ?: it.createdAt, ui.now) }?.let {
            Text("Next reminder: ${it.label.lowercase()} · in ${UrgencyRules.remainingText(Duration.between(ui.now, it.at)).removeSuffix(" left")}", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onDelete != null) OdButton("Delete", { confirmDelete = true }, style = OdButtonStyle.Danger, icon = Icons.Rounded.Delete)
            Spacer(Modifier.weight(1f))
            OdButton("Cancel", onDismiss, style = OdButtonStyle.Ghost)
            OdButton("Save", {
                val v = Validation.taskTitle(title)
                if (v is Validation.Result.Error) { error = v.message; return@OdButton }
                if (kind == TaskKind.DEADLINE && existing == null && dueInstant!!.isBefore(ui.now)) { error = "The deadline must be in the future."; return@OdButton }
                onSave(OurDayRepository.TaskInput(kind, title, notes, date, if (kind == TaskKind.DAILY) planned else null, dueInstant, notify)); onDismiss()
            })
        }
    }
    if (confirmDelete) ConfirmationDialog("Delete this task?", "It will be removed for both of you. This can’t be undone.", "Delete", true, { confirmDelete = false; onDelete?.invoke(); onDismiss() }, { confirmDelete = false })
}
