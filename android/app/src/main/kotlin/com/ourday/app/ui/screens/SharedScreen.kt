package com.ourday.app.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.*
import com.ourday.domain.rules.ViewRules

private enum class SharedFilter(val label: String) { ALL("All"), ACTIVE("Active"), AWAITING("Awaiting approval"), COMPLETED("Completed") }

/**
 * Shared tasks stay visible in BOTH modes. Every state change is a server-side function that needs the OTHER person's approval,
 * so these actions need a connection and say so; nothing is faked offline.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun SharedScreen(ui: AppUi, onOpen: (Task) -> Unit, onAction: (function: String, taskId: String, approve: Boolean?, message: String?, done: String?) -> Unit, onBack: (() -> Unit)? = null) {
    var filter by rememberSaveable { mutableStateOf(SharedFilter.ALL) }
    var remind by remember { mutableStateOf<Task?>(null) }
    val d = ui.data
    val all = ViewRules.sharedTasks(d.tasks).sortedByDescending { it.createdAt }
    fun state(t: Task) = t.sharedState ?: SharedState.ACTIVE
    val shown = all.filter { when (filter) { SharedFilter.ALL -> true; SharedFilter.ACTIVE -> state(it) == SharedState.ACTIVE; SharedFilter.AWAITING -> state(it) == SharedState.AWAITING_APPROVAL; SharedFilter.COMPLETED -> state(it) == SharedState.COMPLETED } }
        .sortedBy { state(it) == SharedState.COMPLETED }
    val partner = d.workspace?.partner

    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Shared", partner?.let { "With ${it.firstName}" } ?: "Together", onBack = onBack)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SharedFilter.entries.forEach { f -> FilterPill(f.label, filter == f, { filter = f }) }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 112.dp)) {
            if (shown.isEmpty()) item { DashedEmpty(if (all.isEmpty()) "Nothing shared yet. Tap + to add something you two do together." else "Nothing here") }
            items(shown, key = { it.id }) { t ->
                val s = state(t)
                val iRequested = t.completionRequestedBy == d.meId
                val otherName = partner?.firstName ?: "your partner"
                val tone = when (s) { SharedState.ACTIVE -> Od.accent; SharedState.AWAITING_APPROVAL -> Od.warn; SharedState.COMPLETED -> Od.ok }
                OdCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), tone, if (s == SharedState.AWAITING_APPROVAL) 0.4f else 0.2f, OdShapes.card, dim = s == SharedState.COMPLETED, onClick = { onOpen(t) }) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("Shared", Od.accent2, Icons.Rounded.Group)
                            Pill(when (s) { SharedState.ACTIVE -> "Active"; SharedState.AWAITING_APPROVAL -> "Awaiting approval"; SharedState.COMPLETED -> "Completed" }, tone)
                            Spacer(Modifier.weight(1f)); SyncBadge(t.syncState)
                        }
                        Text(t.title, style = MaterialTheme.typography.titleMedium, color = Od.fg)
                        t.notes?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val creator = d.workspace?.nameOf(t.createdBy) ?: "your partner"
                            Avatar(initialsOf(creator), t.createdBy != d.meId)
                            Text("Created by ${if (t.createdBy == d.meId) "you" else creator}" + (t.dueAt?.let { " · " + Fmt.deadline(it, ui.today, ui.zone, ui.h24) } ?: ""), style = MaterialTheme.typography.bodySmall, color = Od.muted)
                        }
                        if (s == SharedState.AWAITING_APPROVAL) Text(
                            if (iRequested) "You asked $otherName to confirm. It isn’t completed until they approve." else "${d.workspace?.nameOf(t.completionRequestedBy)} says this is done. Do you agree?",
                            style = MaterialTheme.typography.bodyMedium, color = Od.warn,
                        )
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            when {
                                s == SharedState.ACTIVE -> OdButton("Request completion", { onAction("request_shared_completion", t.id, null, null, "Asked for approval") }, icon = Icons.Rounded.DoneAll, enabled = partner != null)
                                s == SharedState.AWAITING_APPROVAL && !iRequested -> {
                                    OdButton("Approve", { onAction("review_shared_completion", t.id, true, null, "Completion approved") }, icon = Icons.Rounded.ThumbUp)
                                    OdButton("Reject", { onAction("review_shared_completion", t.id, false, null, "Sent back to active") }, style = OdButtonStyle.Ghost, icon = Icons.Rounded.ThumbDown)
                                }
                                s == SharedState.COMPLETED -> OdButton("Reopen", { onAction("reopen_shared_task", t.id, null, null, "Task reopened") }, style = OdButtonStyle.Ghost, icon = Icons.Rounded.Replay)
                            }
                            if (s != SharedState.COMPLETED && partner != null) OdButton("Remind $otherName", { remind = t }, style = OdButtonStyle.Soft, icon = Icons.Rounded.NotificationsActive)
                        }
                    }
                }
            }
        }
    }
    remind?.let { t ->
        var msg by remember(t.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { remind = null }, shape = OdShapes.card, containerColor = Od.surface, title = { Text("Remind ${d.workspace?.partner?.firstName ?: "your partner"}", color = Od.fg, style = MaterialTheme.typography.titleLarge) },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { OdTextField(msg, { if (it.length <= 200) msg = it }, "Message", singleLine = false, minLines = 2); Text("Only they see this, for 24 hours.", style = MaterialTheme.typography.bodySmall, color = Od.muted) } },
            confirmButton = { TextButton(enabled = msg.isNotBlank(), onClick = { onAction("send_task_reminder", t.id, null, msg.trim(), "Reminder sent"); remind = null }) { Text("Send reminder", color = Od.accent) } },
            dismissButton = { TextButton(onClick = { remind = null }) { Text("Cancel", color = Od.muted) } },
        )
    }
}
