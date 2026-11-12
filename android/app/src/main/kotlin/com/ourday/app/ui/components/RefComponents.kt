package com.ourday.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PeopleOutline
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.Task
import com.ourday.domain.rules.TaskRules
import com.ourday.domain.rules.Urgency
import com.ourday.domain.rules.UrgencyRules
import com.ourday.domain.rules.ViewMode
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

// Components of the reference-driven redesign (Home, Today, Deadlines, Habits). Every one of those screens is composed from these.

/** The one shared header: OurDay wordmark on the left; notification bell and the Partner Mode switch in the upper-right corner. */
@Composable
fun AppHeader(ui: AppUi, onMode: (ViewMode) -> Unit, onBell: () -> Unit, divider: Boolean = true) {
    Column(Modifier.fillMaxWidth().background(Od.bg)) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().height(64.dp).padding(start = 20.dp, end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                buildAnnotatedString { withStyle(SpanStyle(color = Od.fg)) { append("Our") }; withStyle(SpanStyle(color = Od.accent)) { append("Day") } },
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold, fontSize = 28.sp, letterSpacing = (-0.5).sp), modifier = Modifier.weight(1f), maxLines = 1,
            )
            IconButton(onClick = onBell, Modifier.size(48.dp)) { Icon(Icons.Outlined.NotificationsNone, "Notifications", Modifier.size(26.dp), tint = Od.fg) }
            Spacer(Modifier.width(4.dp))
            PartnerSwitch(ui, onMode)
        }
        if (divider) HorizontalDivider(color = Od.line(0.10f))
    }
}

/** Partner Mode: one tap switches the viewing filter. Off = your own day; on = the pill fills and shows the partner's initial. It never changes the account. */
@Composable
private fun PartnerSwitch(ui: AppUi, onMode: (ViewMode) -> Unit) {
    val partner = ui.data.workspace?.partner
    val on = ui.isPartnerView
    val enabled = partner != null
    val shape = RoundedCornerShape(22.dp)
    Row(
        Modifier.height(44.dp).widthIn(min = 68.dp).alpha(if (enabled) 1f else 0.4f).clip(shape)
            .background(Od.accent.copy(alpha = if (on) 0.30f else 0.12f), shape).border(1.5.dp, Od.accent.copy(alpha = if (on) 0.95f else 0.65f), shape)
            .semantics {
                role = Role.Switch
                contentDescription = "Partner Mode"
                stateDescription = if (!enabled) "Your partner hasn't joined yet" else if (on) "On, showing ${partner?.firstName}'s day" else "Off, showing your day"
            }
            .clickable(enabled = enabled) { onMode(if (on) ViewMode.ME else ViewMode.PARTNER) }.padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) {
        Icon(Icons.Outlined.PeopleOutline, null, Modifier.size(24.dp), tint = if (on) Od.fg else Od.accent)
        if (on && partner != null) Avatar(initialsOf(partner.name).take(1), true, 22.dp, solid = true)
    }
}

/** Small uppercase label, large title and an optional trailing slot (the coral add button). */
@Composable
fun PageHeading(eyebrow: String, title: String, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 22.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 8.dp)) {
            Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp, letterSpacing = 2.6.sp), color = Od.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(title, style = MaterialTheme.typography.displaySmall.copy(fontSize = 40.sp, lineHeight = 48.sp, fontWeight = FontWeight.Bold), color = Od.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        trailing?.invoke()
    }
}

/** The prominent coral add button next to a page heading. */
@Composable
fun AddButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(width = 56.dp, height = 48.dp).clip(RoundedCornerShape(16.dp)).background(Od.accent, RoundedCornerShape(16.dp)).semantics { contentDescription = label; role = Role.Button }.clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Rounded.Add, null, Modifier.size(28.dp), tint = Color.White) }
}

/** Section heading: coral-tinted icon tile, 22sp title and a trailing slot (chevron or a "+ Add" action). */
@Composable
fun SectionHead(icon: ImageVector, title: String, onClick: (() -> Unit)? = null, trailing: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 20.dp).padding(top = 22.dp, bottom = 12.dp).heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(40.dp).background(Od.accent.copy(alpha = 0.14f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(21.dp), tint = Od.accent) }
        Text(title, style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold), color = Od.fg, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (trailing != null) trailing() else if (onClick != null) Icon(Icons.Rounded.ChevronRight, null, Modifier.size(28.dp), tint = Od.fg)
    }
}

@Composable
fun AddAction(onClick: () -> Unit, label: String = "Add") {
    Row(Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(Icons.Rounded.Add, null, Modifier.size(20.dp), tint = Od.accent)
        Text(label, style = MaterialTheme.typography.titleSmall.copy(fontSize = 17.sp, fontWeight = FontWeight.Medium), color = Od.accent)
    }
}

/** A solid-coral pill for remaining time / status, like "16h 22m left" and "On track". */
@Composable
fun StatusChip(text: String, color: Color) {
    Text(
        text, style = MaterialTheme.typography.labelLarge.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium), color = color, maxLines = 1,
        modifier = Modifier.background(color.copy(alpha = 0.12f), CircleShape).border(1.dp, color.copy(alpha = 0.55f), CircleShape).padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

fun Modifier.leftEdge(color: Color): Modifier = drawBehind { drawRect(color, size = Size(4.dp.toPx(), size.height)) }

/** Today / Deadlines card: completion circle, title, clock + due time, remaining-time chip and chevron. Urgent or due-today cards get the coral left edge. */
@Composable
fun DeadlineRow(task: Task, now: Instant, today: LocalDate, zone: ZoneId, owner: Pair<String, Boolean>?, h24: Boolean, onToggle: () -> Unit, onClick: () -> Unit, edge: Boolean) {
    val u = UrgencyRules.of(task, now)
    val due = task.dueAt
    val dueToday = due != null && TaskRules.dayOf(due, zone) == today
    val tone = urgencyColor(u)
    SwipeToComplete(task.isOpen, onToggle, OdShapes.card, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        OdCard(Modifier.fillMaxWidth(), Od.line, 0.12f, OdShapes.card, dim = !task.isOpen, onClick = onClick) {
            Row(Modifier.fillMaxWidth().then(if (edge && task.isOpen) Modifier.leftEdge(tone) else Modifier).padding(start = 10.dp, end = 12.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                CheckButton(!task.isOpen, onToggle, if (task.isOpen) "Mark complete: ${task.title}" else "Mark incomplete: ${task.title}", size = 30.dp)
                Column(Modifier.weight(1f).padding(horizontal = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(task.title, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp, fontWeight = FontWeight.SemiBold), color = if (task.isOpen) Od.fg else Od.muted, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        textDecoration = if (task.isOpen) null else TextDecoration.LineThrough)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (due != null) {
                            Icon(Icons.Rounded.Schedule, null, Modifier.size(16.dp), tint = Od.muted)
                            Text(Fmt.deadline(due, today, zone, h24), style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp), color = Od.muted, maxLines = 2)
                        }
                        if (task.notifySecondUser) NotifyBell()
                        owner?.let { Avatar(initialsOf(it.first), it.second) }
                        SyncBadge(task.syncState)
                    }
                }
                if (task.isOpen) {
                    val text = if (due == null) "On track" else if (u == Urgency.NORMAL && !dueToday) "On track" else if (u == Urgency.OVERDUE) "Overdue" else UrgencyRules.remainingText(Duration.between(now, due))
                    StatusChip(text, tone)
                } else StatusChip("Done", Od.ok)
                Icon(Icons.Rounded.ChevronRight, null, Modifier.size(24.dp), tint = Od.fg)
            }
        }
    }
}

/** Full-width segmented filter: one coral segment is selected. */
@Composable
fun SegmentedFilter(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val outer = RoundedCornerShape(20.dp)
    Row(modifier.fillMaxWidth().background(Od.surface, outer).border(1.dp, Od.line(0.12f), outer).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            Box(
                Modifier.weight(1f).heightIn(min = 48.dp).clip(RoundedCornerShape(15.dp)).background(if (on) Od.accent else Color.Transparent, RoundedCornerShape(15.dp))
                    .semantics { role = Role.Tab; stateDescription = if (on) "Selected" else "" }.clickable { onSelect(i) }.padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) { Text(label, style = MaterialTheme.typography.titleSmall.copy(fontSize = 16.sp, fontWeight = FontWeight.Medium), color = if (on) Color.White else Od.fg.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** Compact square checkbox used in the Home lists: coral fill with a check when done. */
@Composable
fun SquareCheck(checked: Boolean, onToggle: (() -> Unit)?, label: String) {
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier.size(48.dp).semantics { contentDescription = label; stateDescription = if (checked) "Done" else "Not done"; role = Role.Checkbox }.then(if (onToggle != null) Modifier.clickable(onClick = onToggle) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(28.dp).background(if (checked) Od.accent else Color.Transparent, shape).border(2.dp, if (checked) Od.accent else Od.line(0.35f), shape), contentAlignment = Alignment.Center) {
            if (checked) Icon(Icons.Rounded.Check, null, Modifier.size(20.dp), tint = Color.White)
        }
    }
}
