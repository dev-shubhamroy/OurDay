package com.ourday.app.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.store by preferencesDataStore("ourday_prefs")

enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** Device-local preferences (DataStore). Settings that must sync between devices live in Supabase (notification_preferences). */
@Singleton
class AppPrefs @Inject constructor(@ApplicationContext private val context: Context) {
    private val theme = stringPreferencesKey("theme")
    private val time24 = booleanPreferencesKey("time24")
    private val checkInLocal = booleanPreferencesKey("checkin_local")
    private val lastBriefingDay = stringPreferencesKey("last_briefing_day")
    private val lastBriefingAt = longPreferencesKey("last_briefing_at")
    private val briefingFingerprint = stringPreferencesKey("briefing_fp")
    private val quoteSelection = stringPreferencesKey("quote_selection")
    private val lastSyncMs = longPreferencesKey("last_sync_ms")
    private val needsReauth = booleanPreferencesKey("needs_reauth")
    private val route = stringPreferencesKey("delivery_route")
    private val fcmToken = stringPreferencesKey("fcm_token")
    private val viewMode = stringPreferencesKey("view_mode")
    private val notifSince = longPreferencesKey("notif_since_ms")
    private val notifShown = stringPreferencesKey("notif_shown_ids")
    private val nativeAlerts = booleanPreferencesKey("native_alerts")
    private val floatingRana = booleanPreferencesKey("floating_rana")
    private val fcmRegistered = booleanPreferencesKey("fcm_registered")

    val themeMode: Flow<ThemeMode> = context.store.data.map { runCatching { ThemeMode.valueOf(it[theme] ?: "SYSTEM") }.getOrDefault(ThemeMode.SYSTEM) }
    val use24h: Flow<Boolean> = context.store.data.map { it[time24] ?: false }
    val localCheckIn: Flow<Boolean> = context.store.data.map { it[checkInLocal] ?: true }
    val lastSync: Flow<Long> = context.store.data.map { it[lastSyncMs] ?: 0L }
    val reauthNeeded: Flow<Boolean> = context.store.data.map { it[needsReauth] ?: false }
    /** Partner Mode is remembered across restarts (the web keeps it in localStorage). */
    val viewModeWire: Flow<String> = context.store.data.map { it[viewMode] ?: "me" }
    val nativeAlertsOn: Flow<Boolean> = context.store.data.map { it[nativeAlerts] ?: true }
    val fcmActive: Flow<Boolean> = context.store.data.map { it[fcmRegistered] ?: false }
    val deliveryRoute: Flow<String> = context.store.data.map { it[route] ?: "FCM" }

    suspend fun setViewMode(wire: String) = context.store.edit { it[viewMode] = wire }
    suspend fun setNativeAlerts(v: Boolean) = context.store.edit { it[nativeAlerts] = v }
    /** The floating RANA briefing (every three hours) is opt-in: it needs the "display over other apps" permission. */
    val floatingRanaOn: Flow<Boolean> = context.store.data.map { it[floatingRana] ?: false }
    suspend fun setFloatingRana(v: Boolean) = context.store.edit { it[floatingRana] = v }
    suspend fun setFcmActive(v: Boolean) = context.store.edit { it[fcmRegistered] = v }
    suspend fun notifSince(): Long = context.store.data.map { it[notifSince] ?: 0L }.first()
    suspend fun setNotifSince(ms: Long) = context.store.edit { it[notifSince] = ms }
    suspend fun shownIds(): Set<String> = context.store.data.map { (it[notifShown] ?: "").split(',').filter(String::isNotBlank).toSet() }.first()
    suspend fun saveShownIds(ids: Set<String>) = context.store.edit { it[notifShown] = ids.toList().takeLast(200).joinToString(",") }
    suspend fun setTheme(m: ThemeMode) = context.store.edit { it[theme] = m.name }
    suspend fun setUse24h(v: Boolean) = context.store.edit { it[time24] = v }
    suspend fun setLocalCheckIn(v: Boolean) = context.store.edit { it[checkInLocal] = v }
    suspend fun setLastSync(ms: Long) = context.store.edit { it[lastSyncMs] = ms }
    suspend fun setNeedsReauth(v: Boolean) = context.store.edit { it[needsReauth] = v }
    suspend fun setDeliveryRoute(v: String) = context.store.edit { it[route] = v }

    suspend fun briefingState(): Triple<String?, Long?, String?> = context.store.data.map { Triple(it[lastBriefingDay], it[lastBriefingAt], it[briefingFingerprint]) }.let { f -> f.first() }
    suspend fun saveBriefingState(day: String, atMs: Long, fingerprintJson: String) = context.store.edit { it[lastBriefingDay] = day; it[lastBriefingAt] = atMs; it[briefingFingerprint] = fingerprintJson }
    suspend fun quoteSelectionJson(): String? = context.store.data.map { it[quoteSelection] }.first()
    suspend fun saveQuoteSelection(json: String) = context.store.edit { it[quoteSelection] = json }
    suspend fun fcmToken(): String? = context.store.data.map { it[fcmToken] }.first()
    suspend fun saveFcmToken(t: String?) = context.store.edit { if (t == null) it.remove(fcmToken) else it[fcmToken] = t }
    suspend fun clearUserState() = context.store.edit { it.remove(lastBriefingDay); it.remove(lastBriefingAt); it.remove(briefingFingerprint); it.remove(quoteSelection); it.remove(needsReauth); it.remove(lastSyncMs); it.remove(notifSince); it.remove(notifShown); it.remove(viewMode); it.remove(fcmRegistered) }
}
