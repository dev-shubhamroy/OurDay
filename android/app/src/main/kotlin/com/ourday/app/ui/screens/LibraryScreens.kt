package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ourday.app.sync.SyncStatus
import com.ourday.app.ui.*
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.Quote
import java.time.OffsetDateTime

// ---- Notification Centre --------------------------------------------------------------------------------------------------------

@Composable
fun NotificationCentreScreen(state: NotifState, onBack: () -> Unit, onRetry: () -> Unit, onMarkAll: () -> Unit, onOpen: (NotifRow) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Notifications", onBack = onBack, trailing = {
            if (state is NotifState.Loaded && state.rows.any { it.readAt == null }) TextButton(onClick = onMarkAll) { Text("Mark all read", color = Od.accent) }
        })
        when (state) {
            NotifState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Od.accent) }
            is NotifState.Error -> Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(state.message, style = MaterialTheme.typography.bodyLarge, color = Od.muted)
                OdButton("Try again", onRetry, style = OdButtonStyle.Soft, icon = Icons.Rounded.Refresh)
            }
            is NotifState.Loaded -> if (state.rows.isEmpty()) DashedEmpty("No notifications yet") else LazyColumn(contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp)) {
                items(state.rows, key = { it.id }) { r -> NotificationRow(r) { onOpen(r) } }
            }
        }
    }
}

@Composable
private fun NotificationRow(r: NotifRow, onClick: () -> Unit) {
    val unread = r.readAt == null
    val icon: ImageVector = when { r.subtype != null -> Icons.Rounded.Group; r.kind == "habit" -> Icons.Rounded.Repeat; r.kind == "partner" -> Icons.Rounded.Favorite; else -> Icons.Rounded.Flag }
    val at = runCatching { OffsetDateTime.parse(r.occurredAt ?: r.createdAt).toInstant().toEpochMilli() }.getOrDefault(0L)
    val shape = OdShapes.card
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp).background(if (unread) Od.accent.copy(alpha = 0.07f) else Od.surface, shape).border(1.dp, if (unread) Od.accent.copy(alpha = 0.4f) else Od.line(0.12f), shape)
            .clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(40.dp).background(Od.accent.copy(alpha = 0.12f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(21.dp), tint = Od.accent) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(r.title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium), color = Od.fg)
            Text(r.body, style = MaterialTheme.typography.bodyMedium, color = Od.muted)
            if (at > 0) Text(android.text.format.DateUtils.getRelativeTimeSpanString(at, System.currentTimeMillis(), android.text.format.DateUtils.MINUTE_IN_MILLIS).toString(), style = MaterialTheme.typography.bodySmall, color = Od.muted)
        }
        if (unread) Box(Modifier.padding(top = 6.dp).size(10.dp).background(Od.accent, CircleShape).semantics { contentDescription = "Unread" })
    }
}

// ---- Inspiration Library --------------------------------------------------------------------------------------------------------

@Composable
fun InspirationScreen(ui: AppUi, onBack: () -> Unit, vm: InspirationViewModel = hiltViewModel()) {
    val quotes = ui.data.quotes
    val busy by vm.busy.collectAsState()
    var editing by remember { mutableStateOf<Quote?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var selecting by rememberSaveable { mutableStateOf(false) }
    var selected by remember { mutableStateOf(setOf<String>()) }
    var confirm by remember { mutableStateOf(false) }
    val loading = quotes.isEmpty() && (ui.status is SyncStatus.Syncing || ui.lastSync == 0L) && ui.status !is SyncStatus.Offline && ui.status !is SyncStatus.Error

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ScreenHeader("Inspiration Library", onBack = onBack, trailing = {
                if (quotes.isNotEmpty()) TextButton(onClick = { selecting = !selecting; selected = emptySet() }) { Text(if (selecting) "Done" else "Select", color = Od.accent) }
                if (!selecting) IconButton(onClick = { adding = true }) { Icon(Icons.Rounded.Add, "Add a quote", tint = Od.accent) }
            })
            Text("Save quotes that inspire you.", Modifier.padding(horizontal = 20.dp, vertical = 2.dp), style = MaterialTheme.typography.bodyLarge, color = Od.muted)
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Od.accent) }
                quotes.isEmpty() && (ui.status is SyncStatus.Error || ui.status is SyncStatus.Offline) -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Couldn’t load your quotes. Check your connection and try again.", style = MaterialTheme.typography.bodyLarge, color = Od.muted)
                }
                quotes.isEmpty() -> Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    DashedEmpty("No saved quotes yet. RANA shows one from here in your briefing.")
                    Box(Modifier.padding(horizontal = 16.dp)) { OdButton("Add a quote", { adding = true }, icon = Icons.Rounded.Add) }
                }
                else -> LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = if (selecting) 110.dp else 24.dp)) {
                    items(quotes, key = { it.id }) { q ->
                        val on = q.id in selected
                        val shape = OdShapes.card
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp).background(Od.surface, shape).border(1.dp, if (on) Od.accent else Od.line(0.12f), shape)
                                .clickable { if (selecting) selected = if (on) selected - q.id else selected + q.id else editing = q }.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            if (selecting) Checkbox(on, { selected = if (on) selected - q.id else selected + q.id }, colors = CheckboxDefaults.colors(checkedColor = Od.accent))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("“${q.text}”", style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Serif, fontSize = 18.sp, lineHeight = 26.sp), color = Od.fg)
                                q.author?.let { Text("— $it", style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
                            }
                            if (!selecting) IconButton(onClick = { editing = q }) { Icon(Icons.Outlined.Edit, "Edit quote", tint = Od.muted) }
                        }
                    }
                }
            }
        }
        if (selecting && quotes.isNotEmpty()) Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Od.bg).navigationBarsPadding().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OdButton(if (selected.size == quotes.size) "Clear" else "Select all", { selected = if (selected.size == quotes.size) emptySet() else quotes.map { it.id }.toSet() }, Modifier.weight(1f), style = OdButtonStyle.Soft)
            OdButton("Delete (${selected.size})", { confirm = true }, Modifier.weight(1f), style = OdButtonStyle.Danger, enabled = selected.isNotEmpty(), icon = Icons.Rounded.Delete)
        }
    }
    if (adding || editing != null) QuoteEditor(editing, busy, { adding = false; editing = null }, { id, t, a -> vm.save(id, t, a) { adding = false; editing = null } },
        onDelete = editing?.let { q -> { vm.delete(setOf(q.id)) { adding = false; editing = null } } })
    if (confirm) ConfirmationDialog("Delete ${selected.size} quote${if (selected.size == 1) "" else "s"}?", "They are removed from the library on the web app and from RANA too. This can’t be undone.", "Delete", true,
        { confirm = false; vm.delete(selected) { selected = emptySet(); selecting = false } }, { confirm = false })
}

@Composable
private fun QuoteEditor(existing: Quote?, busy: Boolean, onDismiss: () -> Unit, onSave: (String?, String, String?) -> Unit, onDelete: (() -> Unit)?) {
    var text by rememberSaveable { mutableStateOf(existing?.text ?: "") }
    var author by rememberSaveable { mutableStateOf(existing?.author ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    AppBottomSheet(onDismiss, dirty = text != (existing?.text ?: "") || author != (existing?.author ?: "")) {
        Text(if (existing == null) "New quote" else "Edit quote", style = MaterialTheme.typography.titleLarge, color = Od.fg)
        OdTextField(text, { text = it; error = null }, "Quote", singleLine = false, minLines = 3, maxLines = 6, error = error != null)
        OdTextField(author, { author = it; error = null }, "Author (optional)")
        FormError(error)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onDelete != null) OdButton("Delete", onDelete, style = OdButtonStyle.Danger, icon = Icons.Rounded.Delete, enabled = !busy)
            Spacer(Modifier.weight(1f))
            OdButton("Cancel", onDismiss, style = OdButtonStyle.Ghost)
            OdButton("Save", {
                val t = text.trim()
                when { t.isEmpty() -> error = "Write the quote first."; t.length > 500 -> error = "Keep it under 500 characters."; author.trim().length > 100 -> error = "Author is limited to 100 characters."; else -> onSave(existing?.id, t, author.trim().ifBlank { null }) }
            }, loading = busy, enabled = !busy)
        }
    }
}
