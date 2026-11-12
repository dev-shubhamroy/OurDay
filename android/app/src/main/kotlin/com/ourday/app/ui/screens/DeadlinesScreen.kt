package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.app.sync.SyncStatus
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.Task
import com.ourday.domain.rules.TaskRules

/**
 * Active deadlines only (no Active/Past switch): today's, then future ones. The Past container sits at the very bottom of the list and
 * opens the existing Past / missed view, so it is only seen after scrolling past everything active.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeadlinesScreen(ui: AppUi, onOpen: (Task) -> Unit, onToggle: (Task) -> Unit, onAdd: () -> Unit, onPast: () -> Unit, onRefresh: () -> Unit) {
    val d = ui.data
    val ws = d.workspace
    val today = TaskRules.todayDeadlines(ui.tasks, ui.today, ui.now, ui.zone)
    val future = TaskRules.futureDeadlines(ui.tasks, ui.today, ui.now, ui.zone)
    val past = TaskRules.overdue(ui.tasks, ui.today, ui.now).size
    fun owner(t: Task): Pair<String, Boolean>? = if (ui.isPartnerView || t.createdBy == d.meId) null else ws?.nameOf(t.createdBy)?.let { it to true }

    PullToRefreshBox(isRefreshing = ui.status is SyncStatus.Syncing, onRefresh = onRefresh) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item { PageHeading("Time-sensitive", "Deadlines", trailing = { AddButton("Add a deadline", onAdd) }) }
            item { SyncStrip(ui) }
            if (ui.isPartnerView) item { PartnerBanner(ws?.partner?.firstName ?: "your partner") }
            if (today.isEmpty() && future.isEmpty()) item { Spacer(Modifier.height(16.dp)); DashedEmpty("No active deadlines") }
            if (today.isNotEmpty()) {
                item { SectionHead(Icons.Rounded.Flag, "Today", trailing = { Count(today.size) }) }
                items(today.size, key = { "t" + today[it].id }) { i -> val t = today[i]; DeadlineRow(t, ui.now, ui.today, ui.zone, owner(t), ui.h24, { onToggle(t) }, { onOpen(t) }, edge = true) }
            }
            if (future.isNotEmpty()) {
                item { SectionHead(Icons.Rounded.Flag, "Future deadlines", trailing = { Count(future.size) }) }
                items(future.size, key = { "f" + future[it].id }) { i -> val t = future[i]; DeadlineRow(t, ui.now, ui.today, ui.zone, owner(t), ui.h24, { onToggle(t) }, { onOpen(t) }, edge = false) }
            }
            item { PastContainer(past, onPast) }
        }
    }
}

@Composable
private fun Count(n: Int) = Text(n.toString(), style = MaterialTheme.typography.titleMedium.copy(fontSize = 20.sp, fontWeight = FontWeight.Normal), color = Od.muted)

@Composable
private fun PastContainer(count: Int, onClick: () -> Unit) {
    val shape = OdShapes.card
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 40.dp).heightIn(min = 64.dp).background(Od.surface, shape).border(1.dp, Od.line(0.12f), shape)
            .semantics { role = Role.Button }.clickable(onClick = onClick).padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        androidx.compose.material3.Icon(Icons.Outlined.Inventory2, null, Modifier.size(26.dp), tint = Od.muted)
        Text("Past ($count)", style = MaterialTheme.typography.titleMedium.copy(fontSize = 20.sp, fontWeight = FontWeight.SemiBold), color = Od.fg, modifier = Modifier.weight(1f))
        androidx.compose.material3.Icon(Icons.Rounded.ChevronRight, null, Modifier.size(26.dp), tint = Od.fg)
    }
}
