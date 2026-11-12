package com.ourday.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ourday.app.MainActivity
import com.ourday.app.R
import com.ourday.domain.notify.Category
import com.ourday.domain.notify.Destination
import com.ourday.domain.notify.NotificationRouting

object Channels {
    fun create(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        fun ch(c: Category, name: String, desc: String, importance: Int, vibrate: Boolean) = NotificationChannel(c.channelId, name, importance).apply {
            description = desc; enableVibration(vibrate); setShowBadge(true)
        }
        nm.createNotificationChannels(
            listOf(
                ch(Category.URGENT_DEADLINE, "Urgent deadlines", "Deadlines due within the hour. Shown as heads-up alerts.", NotificationManager.IMPORTANCE_HIGH, true),
                ch(Category.TASK, "Tasks", "Reminders for your tasks and deadlines.", NotificationManager.IMPORTANCE_DEFAULT, false),
                ch(Category.SHARED, "Shared tasks", "Reminders and approval requests from your partner.", NotificationManager.IMPORTANCE_DEFAULT, true),
                ch(Category.HABIT, "Habit check-ins", "The 9:30 PM question about today’s habits.", NotificationManager.IMPORTANCE_HIGH, true),
                ch(Category.RANA, "RANA briefing", "Your daily RANA briefing.", NotificationManager.IMPORTANCE_LOW, false),
            ),
        )
    }
}

object Notifier {
    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun tapIntent(context: Context, d: Destination, requestCode: Int): PendingIntent {
        val i = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(NotificationRouting.deepLink(d)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    @android.annotation.SuppressLint("MissingPermission") // guarded by canPost() just below
    fun show(context: Context, id: Int, category: Category, title: String, body: String, destination: Destination, actions: List<NotificationCompat.Action> = emptyList(), group: String? = null) {
        if (!canPost(context)) return
        val b = NotificationCompat.Builder(context, category.channelId)
            .setSmallIcon(R.drawable.ic_stat_ourday).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tapIntent(context, destination, id)).setAutoCancel(true)
            .setPriority(if (category == Category.URGENT_DEADLINE || category == Category.HABIT) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
        if (category == Category.URGENT_DEADLINE) b.setCategory(NotificationCompat.CATEGORY_REMINDER)
        group?.let { b.setGroup(it) }
        actions.forEach(b::addAction)
        runCatching { NotificationManagerCompat.from(context).notify(id, b.build()) }
    }
}
