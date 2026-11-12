package com.ourday.app.ui.nav

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.ourday.app.data.repo.AuthState
import com.ourday.app.notifications.Notifier
import com.ourday.app.ui.*
import com.ourday.app.ui.components.*
import com.ourday.app.ui.screens.*
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OurDayTheme
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import com.ourday.domain.notify.Destination

private enum class Tab(val route: String, val label: String, val icon: ImageVector, val iconSelected: ImageVector) {
    HOME("home", "Home", Icons.Outlined.Home, Icons.Rounded.Home),
    TODAY("today", "Today", Icons.Outlined.EventAvailable, Icons.Rounded.EventAvailable),
    DEADLINES("deadlines", "Deadlines", Icons.Outlined.TrackChanges, Icons.Rounded.TrackChanges),
    HABITS("habits", "Habits", Icons.Outlined.LocalFireDepartment, Icons.Rounded.LocalFireDepartment),
    MORE("more", "More", Icons.Outlined.GridView, Icons.Rounded.GridView),
}

/** Routes that show the shared header (logo, bell, Partner Mode switch). */
private val HEADER_ROUTES = setOf(Tab.HOME.route, Tab.TODAY.route, Tab.DEADLINES.route, Tab.HABITS.route)
/** Full-screen routes that keep the bottom navigation visible (no tab is selected on them). */
private val TAB_BAR_EXTRA_ROUTES = setOf("tasks", "shared")

@Composable
fun OurDayRoot(deepLink: Destination?, onDeepLinkHandled: () -> Unit) {
    val root: RootViewModel = hiltViewModel()
    val theme by root.theme.collectAsState()
    val auth by root.authState.collectAsState()
    OurDayTheme(theme) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when (val a = auth) {
                AuthState.Loading -> LoadingState("Opening OurDay")
                AuthState.SignedOut -> AuthScreen()
                is AuthState.SignedIn -> {
                    LaunchedEffect(a.userId) { root.onSignedIn() }
                    AppShell(a, deepLink, onDeepLinkHandled)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppShell(auth: AuthState.SignedIn, deepLink: Destination?, onDeepLinkHandled: () -> Unit) {
    val vm: AppViewModel = hiltViewModel()
    val ui by vm.ui.collectAsState()
    val nav = rememberNavController()
    val backEntry by nav.currentBackStackEntryAsState()
    val route = backEntry?.destination?.route
    val snackbar = remember { SnackbarHostState() }
    val ctx = LocalContext.current

    val notifVm: NotificationsViewModel = hiltViewModel()
    val notifState by notifVm.state.collectAsState()
    val unread by notifVm.unread.collectAsState()
    LaunchedEffect(ui?.lastSync) { notifVm.load() }
    var pending by remember { mutableStateOf<Destination?>(null) }
    var addMenu by remember { mutableStateOf(false) }
    var taskEditor by remember { mutableStateOf<TaskEditorState?>(null) }
    var habitEditor by remember { mutableStateOf<HabitEditorState?>(null) }

    LaunchedEffect(Unit) { SnackbarController.events.collect { snackbar.showSnackbar(it) } }

    // Ask for notification permission once (Android 13+), right after the first sign-in.
    var asked by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) { if (!asked && Build.VERSION.SDK_INT >= 33 && !Notifier.canPost(ctx)) { asked = true; permission.launch(Manifest.permission.POST_NOTIFICATIONS) } }

    // Notification taps and ourday:// links.
    LaunchedEffect(deepLink) { if (deepLink != null) { pending = deepLink; onDeepLinkHandled() } }
    LaunchedEffect(pending, ui?.data?.tasks?.size) {
        val d = pending ?: return@LaunchedEffect
        when (d) {
            Destination.Today -> nav.navigateTab(Tab.TODAY.route)
            Destination.Habits -> nav.navigateTab(Tab.HABITS.route)
            Destination.Shared, is Destination.SharedTask -> nav.navigate("shared") { launchSingleTop = true }
            Destination.Rana -> nav.navigate("rana")
            is Destination.Task -> {
                nav.navigateTab(Tab.TODAY.route)
                val t = ui?.data?.tasks?.firstOrNull { it.id == d.id } ?: return@LaunchedEffect // wait for data
                taskEditor = TaskEditorState(t, t.kind)
            }
        }
        pending = null
    }

    val showTabs = Tab.entries.any { it.route == route } || route in TAB_BAR_EXTRA_ROUTES
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = Od.bg,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (showTabs) OurDayNavBar(
                Tab.entries.map { NavItem(it.route, it.label, it.icon) },
                selected = { t -> backEntry?.destination?.hierarchy?.any { it.route == t.route } == true },
                onSelect = { nav.navigateTab(it.route) },
            )
        },
    ) { padding ->
        val u = ui
        Column(Modifier.padding(padding).consumeWindowInsets(padding)) {
            if (u != null && route in HEADER_ROUTES) AppHeader(u, vm::setMode, onBell = { nav.navigate("notifications") { launchSingleTop = true } }, divider = route != Tab.HOME.route, unread = unread > 0)
            Box(Modifier.weight(1f)) {
            if (u == null) LoadingState("Loading") else NavHost(
                nav, startDestination = Tab.HOME.route,
                enterTransition = { fadeIn(tween(180)) + slideInHorizontally(tween(220)) { it / 12 } },
                exitTransition = { fadeOut(tween(120)) },
                popEnterTransition = { fadeIn(tween(180)) },
                popExitTransition = { fadeOut(tween(120)) + slideOutHorizontally(tween(200)) { it / 12 } },
            ) {
                composable(Tab.HOME.route) {
                    HomeScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }, { taskEditor = TaskEditorState(null, TaskKind.DAILY) },
                        { nav.navigateTab(Tab.DEADLINES.route) }, { nav.navigate("tasks") { launchSingleTop = true } }, { nav.navigate("shared") { launchSingleTop = true } }, { nav.navigate("rana") }, vm::refresh)
                }
                composable(Tab.TODAY.route) {
                    TodayScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }, { h -> habitEditor = HabitEditorState(h) },
                        { h -> val st = com.ourday.domain.rules.HabitRules.dayState(h, u.data.meId, u.today, u.today, u.data.logs[h.id].orEmpty()); vm.setHabitDay(h.id, u.today, if (st == com.ourday.domain.rules.DayState.DONE) null else com.ourday.domain.model.LogStatus.DONE) },
                        { taskEditor = TaskEditorState(null, TaskKind.DAILY) }, { nav.navigateTab(Tab.DEADLINES.route) }, { nav.navigateTab(Tab.HABITS.route) }, vm::refresh)
                }
                composable(Tab.DEADLINES.route) {
                    DeadlinesScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }, { taskEditor = TaskEditorState(null, TaskKind.DEADLINE) }, { nav.navigate("past") { launchSingleTop = true } }, vm::refresh)
                }
                composable(Tab.HABITS.route) { HabitsScreen(u, { habitEditor = HabitEditorState(it) }, { habitEditor = HabitEditorState(null) }, { h, day, st -> vm.setHabitDay(h.id, day, st) }) }
                composable("tasks") { TasksScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }, vm::setMode, onBack = { nav.popBackStack() }) }
                composable("shared") { SharedScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { f, id, approve, msg, done -> vm.shared(f, id, approve, msg, done) }, onBack = { nav.popBackStack() }) }
                composable(Tab.MORE.route) { MoreScreen(u, { nav.navigate("settings") }, { nav.navigate("sync") }, { nav.navigate("inspiration") }) }
                composable("rana") { RanaScreen(u, { nav.popBackStack() }, { nav.navigateTab(Tab.TODAY.route) }) }
                composable("notifications") {
                    NotificationCentreScreen(notifState, { nav.popBackStack() }, notifVm::load, notifVm::markAllRead) { r ->
                        notifVm.markRead(setOf(r.id))
                        pending = com.ourday.domain.notify.NotificationRouting.route(r.kind, r.subtype, r.taskId, r.habitId).destination
                    }
                }
                composable("inspiration") { InspirationScreen(u, { nav.popBackStack() }) }
                composable("settings") { SettingsScreen(u, auth.email, { nav.popBackStack() }) }
                composable("past") { PastScreen(u, { nav.popBackStack() }, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }) }
                composable("sync") { SyncScreen(u, { nav.popBackStack() }, vm::refresh, vm::dismissIssue) }
            }
            if (u != null && Tab.entries.any { it.route == route }) FloatingActions(onRana = { nav.navigate("rana") { launchSingleTop = true } }, onAdd = { addMenu = true })
            }
        }
    }

    if (addMenu) AddMenuSheet(
        onTask = { taskEditor = TaskEditorState(null, TaskKind.DAILY) }, onDeadline = { taskEditor = TaskEditorState(null, TaskKind.DEADLINE) }, onHabit = { habitEditor = HabitEditorState(null) }, onDismiss = { addMenu = false },
    )
    ui?.let { u ->
        taskEditor?.let { s ->
            TaskEditorSheet(s.task, u, s.kind, onSave = { i -> if (s.task == null) vm.addTask(i) else vm.editTask(s.task, i) }, onDelete = s.task?.let { t -> { vm.deleteTask(t.id) } }, onDismiss = { taskEditor = null })
        }
        habitEditor?.let { s ->
            HabitEditorSheet(s.habit, u, onSave = { i -> if (s.habit == null) vm.addHabit(i) else vm.editHabit(s.habit, i) },
                onPause = s.habit?.let { h -> { p: Boolean -> vm.setHabitPaused(h.id, p) } }, onDelete = s.habit?.let { h -> { vm.deleteHabit(h.id) } }, onDismiss = { habitEditor = null })
        }
    }
}

private data class TaskEditorState(val task: Task?, val kind: TaskKind)
private data class HabitEditorState(val habit: com.ourday.domain.model.Habit?)

private fun androidx.navigation.NavController.navigateTab(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}
