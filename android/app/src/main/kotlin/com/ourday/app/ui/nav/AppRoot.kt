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
import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import com.ourday.domain.notify.Destination

private enum class Tab(val route: String, val label: String, val icon: ImageVector, val iconSelected: ImageVector) {
    TODAY("today", "Today", Icons.Outlined.Today, Icons.Rounded.Today),
    TASKS("tasks", "Tasks", Icons.Outlined.TaskAlt, Icons.Rounded.TaskAlt),
    HABITS("habits", "Habits", Icons.Outlined.Loop, Icons.Rounded.Loop),
    SHARED("shared", "Shared", Icons.Outlined.Group, Icons.Rounded.Group),
    MORE("more", "More", Icons.Outlined.MoreHoriz, Icons.Rounded.MoreHoriz),
}

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

    var taskEditor by remember { mutableStateOf<TaskEditorState?>(null) }
    var habitEditor by remember { mutableStateOf<HabitEditorState?>(null) }

    LaunchedEffect(Unit) { SnackbarController.events.collect { snackbar.showSnackbar(it) } }

    // Ask for notification permission once (Android 13+), right after the first sign-in.
    var asked by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) { if (!asked && Build.VERSION.SDK_INT >= 33 && !Notifier.canPost(ctx)) { asked = true; permission.launch(Manifest.permission.POST_NOTIFICATIONS) } }

    // Notification taps and ourday:// links.
    LaunchedEffect(deepLink, ui?.data?.tasks?.size) {
        val d = deepLink ?: return@LaunchedEffect
        when (d) {
            Destination.Today -> nav.navigateTab(Tab.TODAY.route)
            Destination.Habits -> nav.navigateTab(Tab.HABITS.route)
            Destination.Shared, is Destination.SharedTask -> nav.navigateTab(Tab.SHARED.route)
            Destination.Rana -> nav.navigate("rana")
            is Destination.Task -> {
                nav.navigateTab(Tab.TODAY.route)
                val t = ui?.data?.tasks?.firstOrNull { it.id == d.id } ?: return@LaunchedEffect // wait for data
                taskEditor = TaskEditorState(t, t.kind)
            }
        }
        onDeepLinkHandled()
    }

    val showTabs = Tab.entries.any { it.route == route }
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        contentWindowInsets = WindowInsets(0),
        floatingActionButton = {
            if (showTabs && route != Tab.MORE.route) FloatingActionButton(onClick = {
                when (route) {
                    Tab.HABITS.route -> habitEditor = HabitEditorState(null)
                    Tab.SHARED.route -> taskEditor = TaskEditorState(null, TaskKind.SHARED)
                    else -> taskEditor = TaskEditorState(null, TaskKind.DAILY)
                }
            }, containerColor = Od.button, contentColor = androidx.compose.ui.graphics.Color.White, shape = com.ourday.app.ui.theme.OdShapes.card) { Icon(Icons.Rounded.Add, "Add") }
        },
        bottomBar = {
            if (showTabs) Column {
                androidx.compose.material3.HorizontalDivider(color = Od.line(0.10f))
                NavigationBar(containerColor = Od.surface, tonalElevation = 0.dp) {
                    Tab.entries.forEach { t ->
                        val selected = backEntry?.destination?.hierarchy?.any { it.route == t.route } == true
                        NavigationBarItem(
                            selected = selected, onClick = { nav.navigateTab(t.route) }, icon = { Icon(if (selected) t.iconSelected else t.icon, null) }, label = { Text(t.label, style = MaterialTheme.typography.labelMedium) },
                            colors = NavigationBarItemDefaults.colors(selectedIconColor = Od.accent, selectedTextColor = Od.accent, indicatorColor = Od.accent.copy(alpha = 0.15f), unselectedIconColor = Od.muted, unselectedTextColor = Od.muted),
                        )
                    }
                }
            }
        },
    ) { padding ->
        val u = ui
        Box(Modifier.padding(padding).consumeWindowInsets(padding)) {
            if (u == null) LoadingState("Loading") else NavHost(
                nav, startDestination = Tab.TODAY.route,
                enterTransition = { fadeIn(tween(180)) + slideInHorizontally(tween(220)) { it / 12 } },
                exitTransition = { fadeOut(tween(120)) },
                popEnterTransition = { fadeIn(tween(180)) },
                popExitTransition = { fadeOut(tween(120)) + slideOutHorizontally(tween(200)) { it / 12 } },
            ) {
                composable(Tab.TODAY.route) {
                    TodayScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }, { h -> habitEditor = HabitEditorState(h) },
                        { h -> val st = com.ourday.domain.rules.HabitRules.dayState(h, u.data.meId, u.today, u.today, u.data.logs[h.id].orEmpty()); vm.setHabitDay(h.id, u.today, if (st == com.ourday.domain.rules.DayState.DONE) null else com.ourday.domain.model.LogStatus.DONE) },
                        { nav.navigate("rana") }, vm::refresh, vm::setMode)
                }
                composable(Tab.TASKS.route) { TasksScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }, vm::setMode) }
                composable(Tab.HABITS.route) { HabitsScreen(u, { habitEditor = HabitEditorState(it) }, { h, day, st -> vm.setHabitDay(h.id, day, st) }, vm::setMode) }
                composable(Tab.SHARED.route) { SharedScreen(u, { taskEditor = TaskEditorState(it, it.kind) }, { f, id, approve, msg, done -> vm.shared(f, id, approve, msg, done) }) }
                composable(Tab.MORE.route) { MoreScreen(u, { nav.navigate("rana") }, { nav.navigate("settings") }, { nav.navigate("past") }, { nav.navigate("sync") }) }
                composable("rana") { RanaScreen(u.h24, { nav.popBackStack() }) }
                composable("settings") { SettingsScreen(u, auth.email, { nav.popBackStack() }) }
                composable("past") { PastScreen(u, { nav.popBackStack() }, { taskEditor = TaskEditorState(it, it.kind) }, { vm.setCompleted(it, it.isOpen) }) }
                composable("sync") { SyncScreen(u, { nav.popBackStack() }, vm::refresh, vm::dismissIssue) }
            }
        }
    }

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
