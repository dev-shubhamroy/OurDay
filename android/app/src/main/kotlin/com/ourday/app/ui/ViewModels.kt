package com.ourday.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ourday.app.data.db.SyncIssueEntity
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.prefs.ThemeMode
import com.ourday.app.data.remote.PrefsDto
import com.ourday.app.data.remote.PrefsUpsert
import com.ourday.app.data.remote.RemoteReader
import com.ourday.app.data.repo.AppData
import com.ourday.app.data.repo.AuthRepository
import com.ourday.app.data.repo.AuthState
import com.ourday.app.data.repo.OurDayRepository
import com.ourday.app.notifications.CheckInScheduler
import com.ourday.app.notifications.DeviceTokens
import com.ourday.app.sync.SyncScheduler
import com.ourday.app.sync.SyncStatus
import com.ourday.app.ui.components.SnackbarController
import com.ourday.domain.model.*
import com.ourday.domain.rana.*
import com.ourday.domain.rules.ViewMode
import com.ourday.domain.rules.ViewRules
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject

data class AppUi(
    val data: AppData, val now: Instant, val zone: ZoneId, val today: LocalDate, val h24: Boolean, val status: SyncStatus, val pending: Int,
    val issues: List<SyncIssueEntity>, val reauth: Boolean, val lastSync: Long, val mode: ViewMode = ViewMode.ME,
) {
    val me: String get() = data.meId
    val partnerId: String? get() = data.workspace?.partner?.id
    /** Whose personal context is on screen. Partner Mode is a viewing filter only: it never changes the account. */
    val subject: String get() = ViewRules.subject(mode, me, partnerId)
    val isPartnerView: Boolean get() = mode == ViewMode.PARTNER
    val subjectName: String get() = data.workspace?.nameOf(subject)?.let { if (subject == me) "You" else it } ?: ""
    /** Personal tasks of the person being viewed (shared tasks are never filtered by mode). */
    val tasks: List<Task> get() = ViewRules.tasksFor(data.tasks, subject)
    val habits: List<Habit> get() = ViewRules.habitsFor(data.habits, data.memberIds, subject)
}

@HiltViewModel
class RootViewModel @Inject constructor(val auth: AuthRepository, private val appPrefs: AppPrefs, private val tokens: DeviceTokens, private val scheduler: SyncScheduler, @ApplicationContext private val ctx: android.content.Context) : ViewModel() {
    val authState: StateFlow<AuthState> = auth.state.stateIn(viewModelScope, SharingStarted.Eagerly, AuthState.Loading)
    val theme: StateFlow<ThemeMode> = appPrefs.themeMode.stateIn(viewModelScope, SharingStarted.Eagerly, ThemeMode.SYSTEM)

    /** Called once a person is signed in: start syncing, schedule the 9:30 PM check-in, register this device for push. */
    fun onSignedIn() {
        scheduler.syncSoon(); scheduler.schedulePeriodic(); CheckInScheduler.schedule(ctx)
        viewModelScope.launch { com.ourday.app.notifications.FloatingRanaScheduler.apply(ctx, appPrefs.floatingRanaOn.first()) }
        // FCM counts as active only if the token really reached the server (the device_tokens table exists); then the 15-minute checker steps aside.
        viewModelScope.launch { appPrefs.setFcmActive(tokens.registerCurrent(ctx)) }
    }
}

@HiltViewModel
class AuthViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    data class Ui(val busy: Boolean = false, val error: String? = null, val notice: String? = null)
    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui

    fun signIn(email: String, password: String) {
        if (_ui.value.busy) return
        _ui.value = Ui(busy = true)
        viewModelScope.launch { auth.signIn(email, password).onFailure { _ui.value = Ui(error = it.message) }.onSuccess { _ui.value = Ui() } }
    }

    fun signUp(name: String, email: String, password: String) {
        if (_ui.value.busy) return
        _ui.value = Ui(busy = true)
        viewModelScope.launch { auth.signUp(name, email, password).onFailure { _ui.value = Ui(error = it.message) }.onSuccess { _ui.value = Ui(notice = it) } }
    }

    fun clear() { _ui.value = Ui() }
}

@HiltViewModel
class AppViewModel @Inject constructor(private val repo: OurDayRepository, prefs: AppPrefs, private val reader: RemoteReader) : ViewModel() {
    private val ticker = flow { while (true) { emit(Instant.now()); delay(30_000) } }

    private val appPrefs = prefs

    val ui: StateFlow<AppUi?> = combine(
        repo.data, ticker, prefs.use24h, repo.syncStatus, repo.pendingCount,
    ) { d, now, h24, st, pending -> arrayOf<Any>(d, now, h24, st, pending) }
        .combine(combine(repo.issues, prefs.reauthNeeded, prefs.lastSync, prefs.viewModeWire) { i, r, l, m -> arrayOf<Any>(i, r, l, m) }) { a, t ->
            val zone = ZoneId.systemDefault()
            val data = a[0] as AppData
            @Suppress("UNCHECKED_CAST")
            AppUi(
                data, a[1] as Instant, zone, (a[1] as Instant).atZone(zone).toLocalDate(), a[2] as Boolean, a[3] as SyncStatus, a[4] as Int, t[0] as List<SyncIssueEntity>, t[1] as Boolean, t[2] as Long,
                ViewRules.resolve(ViewRules.fromWire(t[3] as String), data.workspace?.partner != null),
            )
        }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun setMode(mode: ViewMode) = viewModelScope.launch { appPrefs.setViewMode(ViewRules.wire(mode)) }

    private fun launch(block: suspend () -> Unit) = viewModelScope.launch { runCatching { block() }.onFailure { SnackbarController.show("That didn’t save. Please try again.") } }

    fun refresh() = launch { repo.refresh() }
    fun dismissIssue(entity: String) = launch { repo.dismissIssue(entity) }

    fun addTask(i: OurDayRepository.TaskInput) = launch { repo.addTask(i); SnackbarController.show("Added “${i.title.trim()}”") }
    fun editTask(old: Task, i: OurDayRepository.TaskInput) = launch { repo.editTask(old, i) }
    fun setCompleted(t: Task, completed: Boolean) = launch { repo.setTaskCompleted(t, completed) }
    fun deleteTask(id: String) = launch { repo.deleteTask(id); SnackbarController.show("Task deleted") }

    fun addHabit(i: OurDayRepository.HabitInput) = launch { repo.addHabit(i); SnackbarController.show("Habit added") }
    fun editHabit(old: Habit, i: OurDayRepository.HabitInput) = launch { repo.editHabit(old, i) }
    fun setHabitPaused(id: String, paused: Boolean) = launch { repo.setHabitPaused(id, paused) }
    fun deleteHabit(id: String) = launch { repo.deleteHabit(id); SnackbarController.show("Habit deleted") }
    fun setHabitDay(id: String, day: LocalDate, status: LogStatus?) = launch { repo.setHabitDay(id, day, status) }

    fun shared(function: String, taskId: String, approve: Boolean? = null, message: String? = null, done: String? = null) = viewModelScope.launch {
        val err = repo.sharedAction(function, taskId, approve, message)
        SnackbarController.show(err ?: done ?: "Done")
    }
}

@HiltViewModel
class RanaViewModel @Inject constructor(private val repo: OurDayRepository, private val prefs: AppPrefs) : ViewModel() {
    private val json = Json { ignoreUnknownKeys = true }
    private val _brief = MutableStateFlow<Brief?>(null)
    /** The concise briefing: greeting, saved quote, deadlines that need attention, today's plan. */
    val brief: StateFlow<Brief?> = _brief
    private var lastData: AppData? = null

    fun load() = viewModelScope.launch {
        val data = repo.data.first()
        lastData = data
        val ws = data.workspace ?: run { _brief.value = null; return@launch }
        val zone = ZoneId.systemDefault()
        val now = Instant.now()
        val (_, lastAt, _) = prefs.briefingState()
        // The key is the previous briefing's time: a refresh keeps the same quote, the NEXT briefing picks a new one.
        val key = "${ws.meId}|${lastAt ?: 0}"
        val sel = prefs.quoteSelectionJson()?.let { runCatching { json.decodeFromString(QuoteSelection.serializer(), it) }.getOrNull() } ?: QuoteSelection()
        val (quote, newSel) = QuoteSelector.select(data.quotes, key, sel)
        if (newSel != sel) prefs.saveQuoteSelection(json.encodeToString(QuoteSelection.serializer(), newSel))
        // RANA briefs the workspace's open work (a partner's items carry their name), whichever Partner Mode view is on screen.
        _brief.value = BriefBuilder.build(RanaInput(ws, data.tasks.filter { it.kind != TaskKind.SHARED }, data.habits, data.logs, now, zone, BriefingKind.FULL, emptyList(), null, quote))
    }

    /** Called when the briefing is closed: the next one gets a fresh quote. */
    fun markShown() = viewModelScope.launch {
        val d = lastData ?: return@launch
        val now = Instant.now()
        prefs.saveBriefingState(now.atZone(ZoneId.systemDefault()).toLocalDate().toString(), now.toEpochMilli(),
            json.encodeToString(MapSerializer(String.serializer(), String.serializer()), Rana.fingerprint(d.tasks)))
    }
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefs: AppPrefs, private val reader: RemoteReader, private val auth: AuthRepository, private val tokens: DeviceTokens, private val repo: OurDayRepository,
    @ApplicationContext private val ctx: android.content.Context,
) : ViewModel() {
    val theme = prefs.themeMode.stateIn(viewModelScope, SharingStarted.Eagerly, ThemeMode.SYSTEM)
    val use24h = prefs.use24h.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val localCheckIn = prefs.localCheckIn.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val nativeAlerts = prefs.nativeAlertsOn.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val floatingRana = prefs.floatingRanaOn.stateIn(viewModelScope, SharingStarted.Eagerly, false)
    val route = prefs.deliveryRoute.stateIn(viewModelScope, SharingStarted.Eagerly, "FCM")
    val server = MutableStateFlow<PrefsDto?>(null)
    val serverError = MutableStateFlow<String?>(null)
    val fcmReady = MutableStateFlow(false)

    fun load() = viewModelScope.launch {
        fcmReady.value = tokens.fcmAvailable(ctx)
        val uid = reader.currentUserId() ?: return@launch
        runCatching { reader.prefs(uid) }.onSuccess { server.value = it ?: PrefsDto(timezone = ZoneId.systemDefault().id); serverError.value = null }
            .onFailure { serverError.value = "Showing saved settings. Connect to change notification preferences." }
    }

    fun setTheme(m: ThemeMode) = viewModelScope.launch { prefs.setTheme(m) }
    fun setUse24h(v: Boolean) = viewModelScope.launch { prefs.setUse24h(v) }
    fun setNativeAlerts(v: Boolean) = viewModelScope.launch { prefs.setNativeAlerts(v) }
    fun setFloatingRana(v: Boolean) = viewModelScope.launch { prefs.setFloatingRana(v); com.ourday.app.notifications.FloatingRanaScheduler.apply(ctx, v) }
    fun setLocalCheckIn(v: Boolean) = viewModelScope.launch {
        prefs.setLocalCheckIn(v)
        if (v) CheckInScheduler.schedule(ctx) else CheckInScheduler.cancel(ctx)
    }

    /** Settings shared with the web app and Mac live in Supabase (one preferences row per person). */
    fun saveServer(update: (PrefsDto) -> PrefsDto) = viewModelScope.launch {
        val uid = reader.currentUserId() ?: return@launch
        val next = update(server.value ?: PrefsDto())
        server.value = next
        runCatching { reader.savePrefs(PrefsUpsert(uid, next.master, next.deadlines, next.habits, next.partner, next.unlockBriefing, ZoneId.systemDefault().id)) }
            .onFailure { SnackbarController.show("Couldn’t save that. Check your connection."); load() }
    }

    fun signOut() = viewModelScope.launch { runCatching { tokens.remove(ctx) }; CheckInScheduler.cancel(ctx); com.ourday.app.notifications.FloatingRanaScheduler.apply(ctx, false); auth.signOut() }
    suspend fun pendingChanges() = auth.pendingChanges()
    fun syncNow() = viewModelScope.launch { repo.refresh() }
}
