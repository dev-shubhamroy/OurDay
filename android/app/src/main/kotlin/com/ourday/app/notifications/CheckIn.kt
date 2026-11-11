package com.ourday.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.repo.OurDayRepository
import com.ourday.domain.model.LogStatus
import com.ourday.domain.notify.Category
import com.ourday.domain.notify.Destination
import com.ourday.domain.rules.CheckIn
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.ZoneId
import java.time.ZonedDateTime
import javax.inject.Inject

/**
 * The 9:30 PM habit check-in, scheduled with WorkManager (survives reboot) and rescheduled after time-zone / clock changes.
 * HONEST LIMITS: Android may delay WorkManager work by minutes (Doze, battery optimisation, OEM task killers); it does not
 * guarantee the exact minute. If the phone is off at 9:30 PM the question appears when it next runs. Unanswered days count as
 * missed by midnight because a scheduled past day without a completion is MISSED by definition (nothing needs to be written).
 */
object CheckInScheduler {
    private const val WORK = "habit-checkin"

    fun schedule(context: Context, now: ZonedDateTime = ZonedDateTime.now(ZoneId.systemDefault())) {
        val delay = Duration.between(now, CheckIn.nextAt(now)).coerceAtLeast(Duration.ofSeconds(30))
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<CheckInWorker>().setInitialDelay(delay).build())
    }

    fun cancel(context: Context) { WorkManager.getInstance(context).cancelUniqueWork(WORK) }

    const val ACTION_ANSWER = "com.ourday.app.CHECKIN_ANSWER"
    const val EXTRA_HABIT = "habit"
    const val EXTRA_YES = "yes"
    const val EXTRA_ID = "nid"
}

@HiltWorker
class CheckInWorker @AssistedInject constructor(@Assisted context: Context, @Assisted params: WorkerParameters, private val repo: OurDayRepository, private val prefs: AppPrefs) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        try {
            if (prefs.localCheckIn.first()) {
                val data = repo.data.first()
                val today = java.time.LocalDate.now()
                val ask = CheckIn.toAsk(data.habits, data.memberIds, data.meId, today, data.logs)
                ask.forEach { h ->
                    val id = h.id.hashCode()
                    fun action(yes: Boolean, label: String) = NotificationCompat.Action.Builder(
                        0, label,
                        PendingIntent.getBroadcast(
                            ctx, id * 2 + if (yes) 1 else 0,
                            Intent(ctx, CheckInReceiver::class.java).setAction(CheckInScheduler.ACTION_ANSWER).putExtra(CheckInScheduler.EXTRA_HABIT, h.id).putExtra(CheckInScheduler.EXTRA_YES, yes).putExtra(CheckInScheduler.EXTRA_ID, id),
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                        ),
                    ).build()
                    Notifier.show(ctx, id, Category.HABIT, "Habit check-in", "Did you complete “${h.title}” today?", Destination.Habits, listOf(action(true, "Yes"), action(false, "No")), "habit-checkins")
                }
            }
        } finally {
            CheckInScheduler.schedule(ctx) // tomorrow's 9:30 PM
        }
        return Result.success()
    }
}

/** Yes / No from the notification: writes only this person's own log, idempotently (never downgrades a completion). */
@AndroidEntryPoint
class CheckInReceiver : BroadcastReceiver() {
    @Inject lateinit var repo: OurDayRepository
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != CheckInScheduler.ACTION_ANSWER) return
        val habit = intent.getStringExtra(CheckInScheduler.EXTRA_HABIT) ?: return
        val yes = intent.getBooleanExtra(CheckInScheduler.EXTRA_YES, false)
        val nid = intent.getIntExtra(CheckInScheduler.EXTRA_ID, 0)
        val pending = goAsync()
        scope.launch {
            try {
                val today = java.time.LocalDate.now()
                val write = CheckIn.resolve(if (yes) CheckIn.Answer.YES else CheckIn.Answer.NO, repo.currentLog(habit, today))
                if (write != null) repo.setHabitDay(habit, today, write)
            } finally {
                NotificationManagerCompat.from(context).cancel(nid)
                pending.finish()
            }
        }
    }
}

/** Reboot, time-zone change, clock change, app update: schedule the check-in again for the (new) local 9:30 PM and sync. */
@AndroidEntryPoint
class SystemEventsReceiver : BroadcastReceiver() {
    @Inject lateinit var sync: com.ourday.app.sync.SyncScheduler
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIMEZONE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_MY_PACKAGE_REPLACED)) return
        CheckInScheduler.schedule(context)
        sync.syncSoon()
    }
}
