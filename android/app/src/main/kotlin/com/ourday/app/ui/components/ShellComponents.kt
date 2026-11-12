package com.ourday.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.app.ui.design.RanaMark
import com.ourday.app.ui.theme.Od

class NavItem(val route: String, val label: String, val icon: ImageVector)

/** The bottom navigation: one rounded container with a thin coral outline; the active tab's icon sits in a circular coral outline and is brighter. */
@Composable
fun OurDayNavBar(items: List<NavItem>, selected: (NavItem) -> Boolean, onSelect: (NavItem) -> Unit) {
    val shape = RoundedCornerShape(36.dp)
    Box(Modifier.fillMaxWidth().background(Od.bg).navigationBarsPadding().padding(horizontal = 14.dp, vertical = 8.dp)) {
        Row(Modifier.fillMaxWidth().height(72.dp).border(1.dp, Od.accent.copy(alpha = 0.7f), shape).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            items.forEach { t ->
                val on = selected(t)
                val tint = if (on) Od.accent else Od.accent.copy(alpha = 0.5f)
                Column(
                    Modifier.weight(1f).fillMaxHeight().clip(shape).semantics { role = Role.Tab; contentDescription = t.label }.clickable { onSelect(t) },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Box(Modifier.size(38.dp).then(if (on) Modifier.border(1.5.dp, Od.accent, CircleShape) else Modifier), contentAlignment = Alignment.Center) { Icon(t.icon, null, Modifier.size(24.dp), tint = tint) }
                    Text(t.label, style = MaterialTheme.typography.labelMedium.copy(fontSize = 11.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal), color = tint, maxLines = 1)
                }
            }
        }
    }
}

/** The two floating buttons, bottom-right above the navigation: RANA (bull) over the global Add button. They are stacked, so they never overlap. */
@Composable
fun BoxScope.FloatingActions(onRana: () -> Unit, onAdd: () -> Unit) {
    Column(Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.shadow(8.dp, CircleShape).semantics { contentDescription = "Open RANA briefing"; role = Role.Button }.clip(CircleShape).clickable(onClick = onRana)) { RanaMark(54.dp) }
        Box(
            Modifier.size(58.dp).shadow(8.dp, CircleShape).background(Od.accent, CircleShape).semantics { contentDescription = "Add"; role = Role.Button }.clip(CircleShape).clickable(onClick = onAdd),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Rounded.Add, null, Modifier.size(30.dp), tint = Color.White) }
    }
}

/** The one Add menu: each option opens the existing editor. */
@Composable
fun AddMenuSheet(onTask: () -> Unit, onDeadline: () -> Unit, onHabit: () -> Unit, onDismiss: () -> Unit) {
    AppBottomSheet(onDismiss) {
        Text("Add", style = MaterialTheme.typography.titleLarge, color = Od.fg)
        AddOption(Icons.Rounded.TaskAlt, "Create Task", "A daily task for your day") { onDismiss(); onTask() }
        AddOption(Icons.Rounded.Flag, "Create Deadline", "Something due at a specific time") { onDismiss(); onDeadline() }
        AddOption(Icons.Rounded.Repeat, "Create Habit", "Build a streak, alone or together") { onDismiss(); onHabit() }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun AddOption(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).background(Od.surface, shape).border(1.dp, Od.line(0.12f), shape).clip(shape).semantics { role = Role.Button }.clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(42.dp).background(Od.accent.copy(alpha = 0.14f), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(22.dp), tint = Od.accent) }
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium, color = Od.fg); Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
        Icon(Icons.Rounded.ChevronRight, null, tint = Od.muted)
    }
}
