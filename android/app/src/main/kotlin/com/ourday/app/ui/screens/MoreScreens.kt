package com.ourday.app.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ourday.app.BuildConfig
import com.ourday.app.data.prefs.ThemeMode
import com.ourday.app.notifications.Notifier
import com.ourday.app.sync.SyncStatus
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.RanaViewModel
import com.ourday.app.ui.SettingsViewModel
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Display
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.model.Task
import com.ourday.domain.rana.AttentionLevel
import com.ourday.domain.rules.TaskRules
import kotlinx.coroutines.launch
import java.time.ZoneId

@Composable
fun MoreScreen(ui: AppUi, onRana: () -> Unit, onSettings: () -> Unit, onPast: () -> Unit, onSync: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ScreenHeader("More")
        MoreRow(Icons.Rounded.AutoAwesome, "RANA briefing", "Your deadlines and today’s plan", onRana)
        MoreRow(Icons.Rounded.History, "Past and missed", "Overdue deadlines and open tasks from earlier days", onPast)
        MoreRow(Icons.Rounded.Sync, "Sync and offline", when { ui.pending > 0 -> "${ui.pending} change${if (ui.pending == 1) "" else "s"} waiting"; ui.issues.isNotEmpty() -> "${ui.issues.size} need attention"; else -> "Everything is saved" }, onSync)
        MoreRow(Icons.Rounded.Settings, "Settings", "Account, appearance, notifications", onSettings)
        Spacer(Modifier.height(112.dp))
    }
}

@Composable
private fun MoreRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    OdCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), Od.line, 0.10f, OdShapes.card, onClick = onClick) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.size(40.dp).background(Od.accent.copy(alpha = 0.10f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Od.accent) }
            Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium, color = Od.fg); Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
            Icon(Icons.Rounded.ChevronRight, null, tint = Od.muted)
        }
    }
}

@Composable
fun PastScreen(ui: AppUi, onBack: () -> Unit, onOpen: (Task) -> Unit, onToggle: (Task) -> Unit) {
    val d = ui.data
    val overdue = TaskRules.overdue(ui.tasks, ui.today, ui.now)
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Past and missed", onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(top = 8.dp, bottom = 112.dp)) {
            if (overdue.isEmpty()) item { DashedEmpty("Nothing overdue") }
            items(overdue.size) { i ->
                val t = overdue[i]
                if (t.kind == com.ourday.domain.model.TaskKind.DEADLINE) DeadlineCard(t, ui.now, ui.today, ui.zone, null, ui.h24, { onToggle(t) }, { onOpen(t) })
                else TaskCard(t, null, ui.h24, { onToggle(t) }, { onOpen(t) })
            }
        }
    }
}

@Composable
fun SyncScreen(ui: AppUi, onBack: () -> Unit, onSyncNow: () -> Unit, onDismiss: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ScreenHeader("Sync and offline", onBack = onBack)
        Panel {
            val status = when {
                ui.reauth -> "Sign in again to sync. Your changes are safe on this phone."
                ui.status is SyncStatus.Offline -> "Offline. OurDay keeps working and syncs when you’re back online."
                ui.status is SyncStatus.Syncing -> "Syncing…"
                ui.status is SyncStatus.Error -> (ui.status as SyncStatus.Error).message
                else -> "Up to date"
            }
            Text(status, style = MaterialTheme.typography.titleMedium, color = Od.fg)
            Text("Waiting to sync: ${ui.pending}", style = MaterialTheme.typography.bodyLarge, color = Od.fg)
            Text("Last synced: ${if (ui.lastSync == 0L) "never" else java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT).format(java.util.Date(ui.lastSync))}", style = MaterialTheme.typography.bodyLarge, color = Od.fg)
            Text("Changes are saved on this phone first, kept across restarts, and sent in order with retries. A change the server refuses is dropped and listed below; a change that clashes with a newer edit is never forced through.", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
            OdButton("Sync now", onSyncNow, style = OdButtonStyle.Soft, icon = Icons.Rounded.Sync)
        }
        if (ui.issues.isNotEmpty()) SectionTitle(Icons.Rounded.WarningAmber, "Needs attention", tint = Od.warn)
        ui.issues.forEach { i ->
            Panel {
                Text(if (i.state == "CONFLICT") "Changed elsewhere" else "Couldn’t be saved", style = MaterialTheme.typography.labelLarge, color = if (i.state == "CONFLICT") Od.warn else Od.danger)
                Text(if (i.state == "CONFLICT") "Someone edited ${i.message ?: "this"} since you did, so your edit was not applied. The newer version is shown." else (i.message ?: "The server refused that change."), style = MaterialTheme.typography.bodyMedium, color = Od.fg)
                OdButton("Dismiss", { onDismiss(i.entity) }, style = OdButtonStyle.Ghost)
            }
        }
        Spacer(Modifier.height(112.dp))
    }
}

// ---- RANA: greeting, saved quote, deadlines, today's plan, one closing action ----------------------------------------------------

@Composable
fun RanaScreen(h24: Boolean, onBack: () -> Unit, vm: RanaViewModel = hiltViewModel()) {
    val brief by vm.brief.collectAsState()
    LaunchedEffect(Unit) { vm.load() }
    DisposableEffect(Unit) { onDispose { vm.markShown() } }
    val b = brief
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Od.accent.copy(alpha = 0.10f), Od.bg, Od.bg)))) {
        if (b == null) { LoadingState("Preparing your briefing"); return@Box }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 22.dp, end = 22.dp, top = 8.dp, bottom = 40.dp)) {
            item {
                Row(Modifier.statusBarsPadding().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack, Modifier.size(48.dp)) { Icon(Icons.Rounded.Close, "Close briefing", tint = Od.muted) }
                    Spacer(Modifier.weight(1f)); RanaMark(36.dp)
                }
            }
            // A. greeting: nothing underneath it
            item { Text(b.greeting, style = MaterialTheme.typography.displaySmall, color = Od.fg, modifier = Modifier.padding(top = 18.dp, bottom = 8.dp)) }
            // B. the saved quote (hidden when the Inspiration Library is empty)
            b.quote?.let { q ->
                item {
                    Row(Modifier.padding(top = 18.dp).height(IntrinsicSize.Min)) {
                        Box(Modifier.width(3.dp).fillMaxHeight().background(Od.accent, RoundedCornerShape(3.dp)))
                        Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Eyebrow("JUST KNOW THAT –", color = Od.accent)
                            Text("“${q.text}”", style = MaterialTheme.typography.headlineMedium.copy(fontSize = 24.sp, lineHeight = 32.sp), color = Od.fg)
                            q.author?.let { Text("— $it", style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
                        }
                    }
                }
            }
            // C. deadlines that need attention
            if (b.deadlines.isNotEmpty()) {
                item { RanaSection("Deadlines", Icons.Rounded.Flag, Od.danger) }
                items(b.deadlines.size) { i ->
                    val a = b.deadlines[i]
                    val tone = if (a.level == AttentionLevel.APPROACHING) Od.warn else Od.danger
                    OdCard(Modifier.fillMaxWidth().padding(vertical = 4.dp), tone, if (a.level == AttentionLevel.APPROACHING) 0.38f else 0.5f, OdShapes.deadline) {
                        Column(Modifier.deadlineEdge(tone).padding(start = 20.dp, end = 14.dp, top = 12.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(a.title, style = MaterialTheme.typography.titleMedium, color = Od.fg, modifier = Modifier.weight(1f))
                                Pill(a.status, tone, fillAlpha = 0.12f, lineAlpha = 0.25f)
                            }
                            Text(a.detail, style = MaterialTheme.typography.bodyMedium, color = Od.muted)
                            a.ownerName?.let { Text("$it’s", style = MaterialTheme.typography.bodySmall, color = Od.partner) }
                        }
                    }
                }
            }
            // D. today's plan, in order
            if (b.plan.isNotEmpty()) {
                item { RanaSection("Today’s plan", Icons.Rounded.Checklist, Od.accent) }
                items(b.plan.size) { i ->
                    val p = b.plan[i]
                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(p.timeText, style = MaterialTheme.typography.labelLarge, color = Od.accent, modifier = Modifier.width(72.dp))
                        Column(Modifier.weight(1f)) {
                            Text(p.title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = Od.fg)
                            Text(listOfNotNull(p.detail.takeIf { it != "Planned task" }, p.ownerName?.let { "$it’s" }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = Od.muted)
                        }
                    }
                }
            }
            // E. closing: one action, no sign-off text
            item { OdButton("Let’s get started", onBack, Modifier.fillMaxWidth().padding(top = 28.dp)) }
        }
    }
}

@Composable
private fun RanaSection(title: String, icon: ImageVector, tint: androidx.compose.ui.graphics.Color) {
    Row(Modifier.padding(top = 30.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(28.dp).background(tint.copy(alpha = 0.12f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(15.dp), tint = tint) }
        Text(title, style = MaterialTheme.typography.titleLarge, color = Od.fg)
    }
}

// ---- Settings -----------------------------------------------------------------------------------------------------------------------

@Composable
fun SettingsScreen(ui: AppUi, email: String, onBack: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val theme by vm.theme.collectAsState()
    val h24 by vm.use24h.collectAsState()
    val localCheckIn by vm.localCheckIn.collectAsState()
    val nativeAlerts by vm.nativeAlerts.collectAsState()
    val server by vm.server.collectAsState()
    val serverError by vm.serverError.collectAsState()
    val fcm by vm.fcmReady.collectAsState()
    var permitted by remember { mutableStateOf(Notifier.canPost(ctx)) }
    var confirmSignOut by remember { mutableStateOf<Int?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permitted = it }
    LaunchedEffect(Unit) { vm.load() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ScreenHeader("Settings", onBack = onBack)
        SettingsGroup("Account") {
            Text(ui.data.workspace?.me?.name ?: email, style = MaterialTheme.typography.titleMedium, color = Od.fg)
            Text(email, style = MaterialTheme.typography.bodyMedium, color = Od.muted)
            ui.data.workspace?.let { Text("${it.name}${it.partner?.let { p -> " · with ${p.name}" } ?: ""}", style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
        }
        SettingsGroup("Appearance") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterPill("System", theme == ThemeMode.SYSTEM, { vm.setTheme(ThemeMode.SYSTEM) })
                FilterPill("Light", theme == ThemeMode.LIGHT, { vm.setTheme(ThemeMode.LIGHT) })
                FilterPill("Dark", theme == ThemeMode.DARK, { vm.setTheme(ThemeMode.DARK) })
            }
            SwitchRow("24-hour time", "Applies to deadlines and tasks in this app.", h24, vm::setUse24h)
            Text("Time zone: ${ZoneId.systemDefault().id} (follows this phone)", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
        }
        SettingsGroup("Notifications") {
            if (!permitted) {
                Text("Notifications are off for OurDay on this phone.", style = MaterialTheme.typography.bodyMedium, color = Od.fg)
                OdButton("Allow notifications", { if (Build.VERSION.SDK_INT >= 33) launcher.launch(Manifest.permission.POST_NOTIFICATIONS) }, icon = Icons.Rounded.NotificationsActive)
            } else Text("Allowed on this phone.", style = MaterialTheme.typography.bodyMedium, color = Od.ok)
            SwitchRow("Show OurDay notifications on this phone", "Deadline reminders, shared-task requests and partner activity, checked about every 15 minutes while the phone is online. Turn off “Phone notifications” in the OurDay web app on this phone to avoid seeing each one twice.", nativeAlerts, vm::setNativeAlerts)
            SwitchRow("9:30 PM habit check-in on this phone", "Asks about habits you haven’t answered yet. Android may run it a few minutes late.", localCheckIn, vm::setLocalCheckIn)
            server?.let { s ->
                Text("Shared with the web app and Mac", style = MaterialTheme.typography.labelLarge, color = Od.fg, modifier = Modifier.padding(top = 6.dp))
                SwitchRow("Notifications", "Master switch for every device.", s.master, { v -> vm.saveServer { it.copy(master = v) } })
                SwitchRow("Deadline reminders", null, s.deadlines, { v -> vm.saveServer { it.copy(deadlines = v) } }, enabled = s.master)
                SwitchRow("Habit check-ins", null, s.habits, { v -> vm.saveServer { it.copy(habits = v) } }, enabled = s.master)
                SwitchRow("Partner activity", null, s.partner, { v -> vm.saveServer { it.copy(partner = v) } }, enabled = s.master)
            }
            serverError?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
            Text(
                if (fcm) "Instant push (FCM) is configured in this build. Once the server sender is deployed, pushes arrive immediately and the 15-minute check turns itself off."
                else "Instant push (FCM) isn’t set up yet (needs a Firebase project and a server sender, see BUILD_AND_INSTALL.md). Until then notifications are checked about every 15 minutes.",
                style = MaterialTheme.typography.bodySmall, color = Od.muted,
            )
        }
        SettingsGroup("Sync") {
            Text("Waiting to sync: ${ui.pending}", style = MaterialTheme.typography.bodyLarge, color = Od.fg)
            OdButton("Sync now", vm::syncNow, style = OdButtonStyle.Soft, icon = Icons.Rounded.Sync)
        }
        SettingsGroup("About") {
            Text("OurDay for Android ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
            OdButton("Sign out", { scope.launch { confirmSignOut = vm.pendingChanges() } }, style = OdButtonStyle.Danger, icon = Icons.Rounded.Logout)
        }
        Spacer(Modifier.height(112.dp))
    }
    confirmSignOut?.let { n ->
        ConfirmationDialog(
            "Sign out?", if (n > 0) "$n change${if (n == 1) "" else "s"} haven’t synced yet and will be lost. Sync first if you can." else "This phone will forget your data. Your account and everything on the server stay as they are.",
            "Sign out", true, { confirmSignOut = null; vm.signOut() }, { confirmSignOut = null },
        )
    }
}

@Composable
private fun SettingsGroup(title: String, content: @Composable ColumnScope.() -> Unit) {
    Eyebrow(title, Modifier.padding(start = 24.dp, top = 22.dp, bottom = 6.dp), color = Od.accent)
    Panel(content = content)
}
