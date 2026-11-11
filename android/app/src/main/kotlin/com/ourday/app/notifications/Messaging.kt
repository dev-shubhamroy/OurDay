package com.ourday.app.notifications

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.remote.isConfigured
import com.ourday.domain.notify.NotificationRouting
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class DeviceTokenRow(@SerialName("user_id") val userId: String, val token: String, val platform: String = "android", val route: String = "fcm")

/**
 * Native push registration. FCM only works once YOU add your own google-services.json (see BUILD_AND_INSTALL.md); without it nothing
 * here runs. The backend table `device_tokens` and the FCM sender are a PREPARED, UNAPPLIED backward-compatible migration, so
 * registration quietly does nothing until the backend supports it. Web Push is untouched.
 */
@Singleton
class DeviceTokens @Inject constructor(private val client: SupabaseClient, private val prefs: AppPrefs) {
    fun fcmAvailable(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

    suspend fun registerCurrent(context: Context): Boolean {
        if (!isConfigured || !fcmAvailable(context)) return false
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull() ?: return false
        return register(token)
    }

    suspend fun register(token: String): Boolean {
        prefs.saveFcmToken(token)
        val uid = client.auth.currentUserOrNull()?.id ?: return false
        return runCatching { client.from("device_tokens").upsert(DeviceTokenRow(uid, token)) { onConflict = "token" } }.isSuccess
    }

    /** Called on sign-out so a signed-out phone stops receiving this person's notifications. */
    suspend fun remove(context: Context) {
        val token = prefs.fcmToken() ?: return
        runCatching { client.from("device_tokens").delete { filter { eq("token", token) } } }
        prefs.saveFcmToken(null)
        if (fcmAvailable(context)) runCatching { FirebaseMessaging.getInstance().deleteToken().await() }
    }
}

@AndroidEntryPoint
class OurDayMessagingService : FirebaseMessagingService() {
    @Inject lateinit var tokens: DeviceTokens
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onNewToken(token: String) { scope.launch { tokens.register(token) } }

    /** Same payload as the web push: kind, subtype, task_id, habit_id, title, body. Routed to a channel and a screen by one tested rule set. */
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val routed = NotificationRouting.route(d["kind"], d["subtype"], d["task_id"], d["habit_id"], d["minutes_to_deadline"]?.toLongOrNull())
        val id = (d["id"] ?: message.messageId ?: System.nanoTime().toString()).hashCode()
        Notifier.show(this, id, routed.category, d["title"] ?: message.notification?.title ?: "OurDay", d["body"] ?: message.notification?.body ?: "", routed.destination)
    }
}
