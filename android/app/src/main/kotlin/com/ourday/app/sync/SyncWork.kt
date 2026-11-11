package com.ourday.app.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dagger.Lazy
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context, @Assisted params: WorkerParameters, private val manager: Lazy<SyncManager>,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val r = manager.get().sync() ?: return if (manager.get().status.value is SyncStatus.Idle) Result.success() else Result.retry()
        // Network trouble: WorkManager retries with exponential backoff. An expired session retries too, so queued changes
        // go out as soon as the person signs in again. Nothing is ever discarded here.
        return if (r.networkDown || r.authExpired) Result.retry() else Result.success()
    }
}

@Singleton
class SyncScheduler @Inject constructor(@ApplicationContext private val context: Context) {
    private val wm get() = WorkManager.getInstance(context)
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Send queued changes (and refresh) as soon as there is a connection; backs off exponentially after failures. */
    fun syncSoon() {
        wm.enqueueUniqueWork(
            "sync-now", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build(),
        )
    }

    /** A periodic safety net (WorkManager's minimum is 15 minutes; Android may run it later in Doze). */
    fun schedulePeriodic() {
        wm.enqueueUniquePeriodicWork(
            "sync-periodic", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(online).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build(),
        )
    }

    fun cancelAll() { wm.cancelUniqueWork("sync-now"); wm.cancelUniqueWork("sync-periodic") }
}
