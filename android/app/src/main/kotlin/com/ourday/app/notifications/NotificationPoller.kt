package com.ourday.app.notifications

import android.content.Context
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.remote.isConfigured
import com.ourday.domain.notify.DeliveryRules
import com.ourday.domain.notify.NotificationRouting
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.OffsetDateTime
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class NotificationDto(
    val id: String, val kind: String, val title: String, val body: String, @SerialName("task_id") val taskId: String? = null, @SerialName("habit_id") val habitId: String? = null,
    val subtype: String? = null, @SerialName("created_at") val createdAt: String, @SerialName("read_at") val readAt: String? = null,
)

/**
 * Shows OurDay's EXISTING server-made notifications (deadline reminders, shared-task requests/reminders, partner activity) as native Android
 * notifications, WITHOUT Firebase: the backend already writes one row per notification to `notifications` (RLS: only yours), so the app reads
 * the new ones whenever it syncs (about every 15 minutes in the background, and whenever the app is opened or changes data).
 *
 * It invents no triggers and no second reminder engine. It does not replace instant push: WorkManager cannot run more often than every
 * 15 minutes, so a 5-minute deadline reminder can arrive late. FCM fixes that (see BUILD_AND_INSTALL.md); once FCM is registered this checker
 * switches itself off so a notification is never shown twice. The 21:30 habit rows are skipped here because the on-device check-in handles them.
 */
@Singleton
class NotificationPoller @Inject constructor(@ApplicationContext private val context: Context, private val client: SupabaseClient, private val prefs: AppPrefs) {

    suspend fun checkNew(): Int {
        if (!isConfigured || !Notifier.canPost(context)) return 0
        if (DeliveryRules.mode(prefs.fcmActive.first(), prefs.nativeAlertsOn.first()) != DeliveryRules.Mode.CHECK_NEW) return 0
        if (client.auth.sessionStatus.value !is SessionStatus.Authenticated) return 0
        val since = prefs.notifSince()
        if (since == 0L) { prefs.setNotifSince(DeliveryRules.nextCursor(0, emptyList(), System.currentTimeMillis())); return 0 } // first run: no flood of old history
        val rows = runCatching {
            client.from("notifications").select {
                filter { gt("created_at", Instant.ofEpochMilli(since).toString()) }
                order("created_at", Order.ASCENDING); limit(50)
            }.decodeList<NotificationDto>()
        }.getOrNull() ?: return 0
        if (rows.isEmpty()) return 0
        val shown = prefs.shownIds().toMutableSet()
        val habitLocal = prefs.localCheckIn.first()
        var count = 0
        var newest = since
        for (r in rows) {
            val at = runCatching { OffsetDateTime.parse(r.createdAt).toInstant().toEpochMilli() }.getOrDefault(since)
            newest = maxOf(newest, at)
            if (!DeliveryRules.shouldShow(r.id, r.kind, r.readAt != null, shown, habitLocal)) continue
            val routed = NotificationRouting.route(r.kind, r.subtype, r.taskId, r.habitId)
            Notifier.show(context, r.id.hashCode(), routed.category, r.title, r.body, routed.destination)
            shown += r.id; count++
        }
        prefs.saveShownIds(shown)
        prefs.setNotifSince(DeliveryRules.nextCursor(since, listOf(newest), System.currentTimeMillis()))
        return count
    }
}
