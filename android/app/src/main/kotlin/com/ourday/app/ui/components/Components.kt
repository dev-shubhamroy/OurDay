package com.ourday.app.ui.components

import android.app.TimePickerDialog
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.*
import com.ourday.domain.rules.Urgency
import com.ourday.domain.rules.UrgencyRules
import com.ourday.domain.rules.ViewMode
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// ---- snackbars: one controller for the whole app --------------------------------------------------------------------------

object SnackbarController {
    private val _events = kotlinx.coroutines.flow.MutableSharedFlow<String>(extraBufferCapacity = 8)
    val events = _events
    fun show(message: String) { _events.tryEmit(message) }
}

object Fmt {
    fun time(i: Instant, zone: ZoneId, h24: Boolean): String = DateTimeFormatter.ofPattern(if (h24) "HH:mm" else "h:mm a", Locale.getDefault()).format(i.atZone(zone))
    fun clock(t: LocalTime, h24: Boolean): String = DateTimeFormatter.ofPattern(if (h24) "HH:mm" else "h:mm a", Locale.getDefault()).format(t)
    fun day(d: LocalDate, today: LocalDate): String = when (d) {
        today -> "Today"; today.plusDays(1) -> "Tomorrow"; today.minusDays(1) -> "Yesterday"
        else -> DateTimeFormatter.ofPattern("EEE d MMM", Locale.getDefault()).format(d)
    }
    fun longDate(d: LocalDate): String = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.getDefault()).format(d)
    fun deadline(i: Instant, today: LocalDate, zone: ZoneId, h24: Boolean): String = "${day(i.atZone(zone).toLocalDate(), today)}, ${time(i, zone, h24)}"
}

// ---- headers ----------------------------------------------------------------------------------------------------------------

/** Page header like the web PageHeader: eyebrow, big Manrope title, optional trailing slot (the Partner Mode toggle lives here). */
@Composable
fun ScreenHeader(title: String, eyebrow: String? = null, onBack: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(start = if (onBack != null) 8.dp else 20.dp, end = 16.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Od.fg) }
        Column(Modifier.weight(1f).padding(end = 8.dp)) {
            if (eyebrow != null) Eyebrow(eyebrow)
            Text(title, style = MaterialTheme.typography.headlineMedium, color = Od.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

@Composable
fun EmptyState(message: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DashedEmpty(message)
        if (action != null) Box(Modifier.padding(horizontal = 16.dp)) { action() }
    }
}

@Composable fun LoadingState(label: String = "Loading", modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(Od.bg).semantics { contentDescription = label }, contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Od.accent) }
}

@Composable
fun ErrorState(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = Od.danger)
        if (onRetry != null) OdButton("Try again", onRetry, style = OdButtonStyle.Soft)
    }
}

@Composable
fun ConfirmationDialog(title: String, text: String, confirmLabel: String, destructive: Boolean = false, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss, shape = OdShapes.card, containerColor = Od.surface, titleContentColor = Od.fg, textContentColor = Od.muted,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) }, text = { Text(text, style = MaterialTheme.typography.bodyLarge) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirmLabel, color = if (destructive) Od.danger else Od.accent, fontWeight = FontWeight.SemiBold) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = Od.muted) } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppBottomSheet(onDismiss: () -> Unit, dirty: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    var askDiscard by remember { mutableStateOf(false) }
    // Swiping the sheet away, tapping outside or pressing Back never silently loses typed text.
    ModalBottomSheet(
        onDismissRequest = { if (dirty) askDiscard = true else onDismiss() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), shape = OdShapes.sheet, containerColor = Od.surface, scrimColor = Od.bg.copy(alpha = 0.7f),
        dragHandle = { BottomSheetDefaults.DragHandle(color = Od.line(0.25f)) },
    ) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp).navigationBarsPadding().imePadding(), verticalArrangement = Arrangement.spacedBy(14.dp), content = content)
    }
    if (askDiscard) ConfirmationDialog("Discard your changes?", "What you typed hasn’t been saved.", "Discard", true, { askDiscard = false; onDismiss() }, { askDiscard = false })
}

@Composable
fun odTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Od.accent.copy(alpha = 0.60f), unfocusedBorderColor = Od.line(0.15f), errorBorderColor = Od.danger,
    focusedContainerColor = Od.bg.copy(alpha = 0.5f), unfocusedContainerColor = Od.bg.copy(alpha = 0.5f), cursorColor = Od.accent,
    focusedLabelColor = Od.accent, unfocusedLabelColor = Od.muted, focusedTextColor = Od.fg, unfocusedTextColor = Od.fg,
)

@Composable
fun OdTextField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, singleLine: Boolean = true, minLines: Int = 1, maxLines: Int = if (singleLine) 1 else 4, error: Boolean = false) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = { Text(label) }, singleLine = singleLine, minLines = minLines, maxLines = maxLines, isError = error, shape = OdShapes.input, colors = odTextFieldColors())
}

// ---- date and time ---------------------------------------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(label: String, value: LocalDate?, onChange: (LocalDate) -> Unit, modifier: Modifier = Modifier, minDate: LocalDate? = null) {
    var open by remember { mutableStateOf(false) }
    OdButton(value?.let { DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.getDefault()).format(it) } ?: label, { open = true }, modifier, OdButtonStyle.Ghost, Icons.Rounded.CalendarMonth)
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = (value ?: LocalDate.now()).atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates { override fun isSelectableDate(utcTimeMillis: Long) = minDate == null || Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneId.of("UTC")).toLocalDate() >= minDate })
        DatePickerDialog(onDismissRequest = { open = false }, shape = OdShapes.card, colors = DatePickerDefaults.colors(containerColor = Od.surface), confirmButton = {
            TextButton(onClick = { state.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneId.of("UTC")).toLocalDate()) }; open = false }) { Text("OK", color = Od.accent) }
        }, dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel", color = Od.muted) } }) {
            DatePicker(state, colors = DatePickerDefaults.colors(containerColor = Od.surface, selectedDayContainerColor = Od.button, todayDateBorderColor = Od.accent, todayContentColor = Od.accent))
        }
    }
}

@Composable
fun TimePickerField(label: String, value: LocalTime?, onChange: (LocalTime?) -> Unit, h24: Boolean, modifier: Modifier = Modifier, clearable: Boolean = false) {
    val ctx = LocalContext.current
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        OdButton(value?.let { Fmt.clock(it, h24) } ?: label, {
            val v = value ?: LocalTime.of(18, 0)
            TimePickerDialog(ctx, { _, h, m -> onChange(LocalTime.of(h, m)) }, v.hour, v.minute, h24).show()
        }, Modifier.weight(1f), OdButtonStyle.Ghost, Icons.Rounded.Schedule)
        if (clearable && value != null) IconButton(onClick = { onChange(null) }, Modifier.size(48.dp)) { Icon(Icons.Rounded.Close, "Clear time", tint = Od.muted) }
    }
}

// ---- cards -------------------------------------------------------------------------------------------------------------------

@Composable
fun SyncBadge(state: SyncState, modifier: Modifier = Modifier) {
    if (state == SyncState.SYNCED) return
    val (text, color) = when (state) {
        SyncState.PENDING -> "Waiting to sync" to Od.muted
        SyncState.SYNCING -> "Syncing…" to Od.accent
        SyncState.FAILED -> "Couldn’t save" to Od.danger
        SyncState.CONFLICT -> "Changed elsewhere" to Od.warn
        SyncState.SYNCED -> "" to Color.Unspecified
    }
    Text(text, style = MaterialTheme.typography.labelMedium, color = color, modifier = modifier)
}

/** Swipe right to complete (the web SwipeRow). The row springs back; the task's state flips through the normal flow. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeToComplete(enabled: Boolean, onComplete: () -> Unit, shape: androidx.compose.ui.graphics.Shape, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    if (!enabled) { Box(modifier) { content() }; return }
    val state = rememberSwipeToDismissBoxState(confirmValueChange = { if (it == SwipeToDismissBoxValue.StartToEnd) { onComplete(); false } else false })
    SwipeToDismissBox(
        state = state, modifier = modifier, enableDismissFromEndToStart = false,
        backgroundContent = {
            Box(Modifier.fillMaxSize().background(Od.ok.copy(alpha = 0.20f), shape).padding(start = 20.dp), contentAlignment = Alignment.CenterStart) { Icon(Icons.Rounded.Check, "Complete", tint = Od.ok) }
        },
    ) { content() }
}

@Composable
private fun MetaLine(task: Task, today: LocalDate, zone: ZoneId, h24: Boolean, now: Instant, u: Urgency, subdued: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        task.dueAt?.let { due ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Rounded.Schedule, null, Modifier.size(13.dp), tint = Od.muted)
                Text(if (subdued) Fmt.time(due, zone, h24) else Fmt.deadline(due, today, zone, h24), style = MaterialTheme.typography.bodySmall, color = Od.muted)
            }
            if (task.isOpen) Text(UrgencyRules.remainingText(Duration.between(now, due)), style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = urgencyColor(u))
            else task.completedAt?.let { Text("Completed ${Fmt.time(it, zone, h24)}", style = MaterialTheme.typography.labelMedium, color = Od.ok) }
        }
    }
}

/** The web DeadlineCard: coloured edge and border by urgency, check button, title, time + remaining, urgency badge, bell, owner. */
@Composable
fun DeadlineCard(
    task: Task, now: Instant, today: LocalDate, zone: ZoneId, owner: Pair<String, Boolean>?, h24: Boolean, onToggle: () -> Unit, onClick: () -> Unit,
    modifier: Modifier = Modifier, subdued: Boolean = false, dayChip: String? = null,
) {
    val u = UrgencyRules.of(task, now)
    val aura = urgencyColor(u)
    SwipeToComplete(task.isOpen, onToggle, OdShapes.deadline, modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp)) {
        OdCard(Modifier.fillMaxWidth(), aura, urgencyLine(u, subdued), OdShapes.deadline, dim = !task.isOpen, onClick = onClick) {
            Row(Modifier.fillMaxWidth().deadlineEdge(aura).padding(start = 10.dp, end = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                CheckButton(!task.isOpen, onToggle, if (task.isOpen) "Mark complete: ${task.title}" else "Mark incomplete: ${task.title}")
                Column(Modifier.weight(1f).padding(start = 2.dp, end = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(task.title, style = MaterialTheme.typography.titleMedium, color = if (task.isOpen) Od.fg else Od.muted,
                        textDecoration = if (task.isOpen) null else TextDecoration.LineThrough)
                    MetaLine(task, today, zone, h24, now, u, subdued)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        UrgencyBadge(u)
                        dayChip?.let { Pill(it.uppercase(), if (it == "Today") Od.accent else Od.muted, fillAlpha = 0.08f, lineAlpha = 0.25f) }
                        if (task.notifySecondUser) NotifyBell()
                        owner?.let { Avatar(initialsOf(it.first), it.second) }
                        SyncBadge(task.syncState)
                    }
                }
            }
        }
    }
}

/** A daily task: solid and focused (the web TaskCard / TaskRow). */
@Composable
fun TaskCard(task: Task, owner: Pair<String, Boolean>?, h24: Boolean, onToggle: (() -> Unit)?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    SwipeToComplete(onToggle != null && task.isOpen, { onToggle?.invoke() }, OdShapes.tile, modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        OdCard(Modifier.fillMaxWidth(), if (task.isOpen) Od.accent else Od.ok, 0.12f, OdShapes.tile, dim = !task.isOpen, onClick = onClick) {
            Row(Modifier.fillMaxWidth().padding(start = 6.dp, end = 12.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (onToggle != null) CheckButton(!task.isOpen, onToggle, if (task.isOpen) "Mark complete: ${task.title}" else "Mark incomplete: ${task.title}") else Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f).padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(task.title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = if (task.isOpen) Od.fg else Od.muted,
                        textDecoration = if (task.isOpen) null else TextDecoration.LineThrough)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        val meta = when { task.plannedTime != null -> "Planned ${Fmt.clock(task.plannedTime!!, h24)}"; task.plannedTime == null && task.kind == TaskKind.DAILY -> "Anytime"; else -> null }
                        if (meta != null) Text(meta, style = MaterialTheme.typography.bodySmall, color = Od.muted)
                        if (task.notifySecondUser) NotifyBell()
                        SyncBadge(task.syncState)
                    }
                }
                owner?.let { Avatar(initialsOf(it.first), it.second) }
            }
        }
    }
}

@Composable
fun SwitchRow(title: String, subtitle: String? = null, checked: Boolean, onChange: (Boolean) -> Unit, enabled: Boolean = true) {
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(enabled = enabled) { onChange(!checked) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = if (enabled) Od.fg else Od.muted)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Od.muted)
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled, colors = SwitchDefaults.colors(checkedTrackColor = Od.accent, checkedThumbColor = Color.White, uncheckedTrackColor = Od.line(0.15f), uncheckedThumbColor = Od.muted, uncheckedBorderColor = Od.line(0.2f)))
    }
}

@Composable
fun FormError(message: String?) { AnimatedVisibility(message != null) { Text(message.orEmpty(), color = Od.danger, style = MaterialTheme.typography.bodyMedium) } }

/** A panel (web `.panel`): 20dp radius, surface fill, hairline border. */
@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    OdCard(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), Od.line, 0.10f, OdShapes.card) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content) }
}
