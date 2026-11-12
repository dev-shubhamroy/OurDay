package com.ourday.app.notifications

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.app.KeyguardManager
import android.os.PowerManager
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.ourday.app.MainActivity
import com.ourday.app.R
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.repo.OurDayRepository
import com.ourday.domain.model.TaskKind
import com.ourday.domain.rana.*
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * The floating RANA briefing: a compact window drawn OVER other apps (TYPE_APPLICATION_OVERLAY) about every three hours.
 *
 * HONEST LIMITS
 *  - It needs the "Display over other apps" permission (SYSTEM_ALERT_WINDOW). Without it nothing is shown and Settings explains how to grant it.
 *  - Timing uses a WorkManager periodic job (3 h, 30 min flex). Android may run it later (Doze, battery optimisation, OEM task killers), so
 *    "every three hours" is a target, not a guarantee. After downtime it runs once, never a burst of missed briefings, and the next one is
 *    scheduled from then. It survives reboots (WorkManager persists it) and follows the phone's local time zone.
 *  - It is skipped while the screen is off or the phone is locked (never over the lock screen), is not focusable (so it never captures
 *    typing or interrupts calls), always has a Dismiss button and disappears on its own after three minutes.
 *  - No foreground service is used.
 */
object FloatingRanaScheduler {
    private const val PERIODIC = "floating-rana"

    fun canDraw(context: Context) = Settings.canDrawOverlays(context)

    /** Idempotent: KEEP means re-applying never creates a second schedule. */
    fun apply(context: Context, enabled: Boolean) {
        val wm = WorkManager.getInstance(context)
        if (enabled && canDraw(context)) wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<FloatingRanaWorker>(3, TimeUnit.HOURS, 30, TimeUnit.MINUTES).build())
        else wm.cancelUniqueWork(PERIODIC)
    }

    fun showNow(context: Context) { WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<FloatingRanaWorker>().build()) }

    fun permissionIntent(context: Context) = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
}

@HiltWorker
class FloatingRanaWorker @AssistedInject constructor(@Assisted context: Context, @Assisted params: WorkerParameters, private val repo: OurDayRepository, private val prefs: AppPrefs) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!prefs.floatingRanaOn.first() || !Settings.canDrawOverlays(ctx)) return Result.success()
        val pm = ctx.getSystemService(PowerManager::class.java)
        val km = ctx.getSystemService(KeyguardManager::class.java)
        if (!pm.isInteractive || km.isKeyguardLocked) return Result.success() // never over the lock screen or a dark screen
        val data = repo.data.first()
        val ws = data.workspace ?: return Result.success()
        val now = Instant.now()
        val quote = QuoteSelector.select(data.quotes, "floating|${ws.meId}|${now.toEpochMilli() / TimeUnit.HOURS.toMillis(3)}", QuoteSelection()).first
        val brief = BriefBuilder.build(RanaInput(ws, data.tasks.filter { it.kind != TaskKind.SHARED }, data.habits, data.logs, now, ZoneId.systemDefault(), BriefingKind.FULL, emptyList(), null, quote))
        val closed = CompletableDeferred<Unit>()
        val main = Handler(Looper.getMainLooper())
        var view: View? = null
        val wm = ctx.getSystemService(WindowManager::class.java)
        main.post {
            runCatching {
                val v = build(ctx, brief) { closed.complete(Unit) }
                view = v
                wm.addView(v, params(ctx))
            }.onFailure { closed.complete(Unit) }
        }
        withTimeoutOrNull(3 * 60_000L) { closed.await() }
        main.post { view?.let { runCatching { wm.removeView(it) } } }
        return Result.success()
    }

    private fun params(ctx: Context): WindowManager.LayoutParams {
        val dm = ctx.resources.displayMetrics
        return WindowManager.LayoutParams(
            dm.widthPixels - dp(ctx, 28), WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL; y = dp(ctx, 56) }
    }

    private fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

    private fun build(ctx: Context, b: Brief, close: () -> Unit): View {
        val coral = Color.parseColor("#FF6B6B"); val fg = Color.parseColor("#F4F2F5"); val muted = Color.parseColor("#9996A1")
        fun tv(text: String, size: Float, color: Int, bold: Boolean = false, serif: Boolean = false, italic: Boolean = false) = TextView(ctx).apply {
            this.text = text; textSize = size; setTextColor(color)
            typeface = Typeface.create(if (serif) Typeface.SERIF else Typeface.SANS_SERIF, if (bold && italic) Typeface.BOLD_ITALIC else if (bold) Typeface.BOLD else if (italic) Typeface.ITALIC else Typeface.NORMAL)
        }
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(ctx, 18), dp(ctx, 14), dp(ctx, 18), dp(ctx, 16))
            background = GradientDrawable().apply { setColor(Color.parseColor("#111114")); cornerRadius = dp(ctx, 24).toFloat(); setStroke(dp(ctx, 1), Color.parseColor("#66FF6B6B")) }
            elevation = dp(ctx, 12).toFloat()
        }
        val top = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val avatar = ImageView(ctx).apply {
            setImageResource(R.drawable.rana_bull); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(ctx, 3), dp(ctx, 3), dp(ctx, 3), dp(ctx, 3))
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#1A1A20")); setStroke(dp(ctx, 1), Color.parseColor("#88FF6B6B")) }
            contentDescription = "RANA"
        }
        top.addView(avatar, LinearLayout.LayoutParams(dp(ctx, 44), dp(ctx, 44)))
        val lead = b.greetingLead.trimEnd(',', ' ')
        top.addView(tv(if (b.name.isBlank()) lead else "$lead, ${b.name}", 18f, fg, bold = true, serif = true).apply { setPadding(dp(ctx, 12), 0, dp(ctx, 8), 0) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        top.addView(tv("✕", 18f, muted).apply { setPadding(dp(ctx, 12), dp(ctx, 8), dp(ctx, 4), dp(ctx, 8)); contentDescription = "Dismiss"; setOnClickListener { close() } })
        root.addView(top)
        b.quote?.let { q ->
            root.addView(tv("JUST KNOW THAT –", 11f, coral, bold = true).apply { letterSpacing = 0.12f; setPadding(0, dp(ctx, 12), 0, dp(ctx, 4)) })
            root.addView(tv("“${q.text}”", 15f, fg, serif = true))
            q.author?.let { root.addView(tv("— $it", 12f, muted).apply { setPadding(0, dp(ctx, 2), 0, 0) }) }
        }
        b.deadlines.firstOrNull()?.let { a ->
            val card = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL; setPadding(dp(ctx, 14), dp(ctx, 10), dp(ctx, 14), dp(ctx, 10))
                background = GradientDrawable().apply { setColor(Color.parseColor("#1A1214")); cornerRadius = dp(ctx, 16).toFloat(); setStroke(dp(ctx, 1), Color.parseColor("#66FF6B6B")) }
            }
            card.addView(tv(a.status.uppercase(), 11f, coral, bold = true).apply { letterSpacing = 0.1f })
            card.addView(tv(a.title, 16f, fg, bold = true))
            card.addView(tv(a.detail, 13f, muted))
            root.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 12) })
        }
        if (b.plan.isNotEmpty()) {
            root.addView(tv("Today’s plan", 13f, muted, bold = true).apply { setPadding(0, dp(ctx, 12), 0, dp(ctx, 2)) })
            b.plan.take(3).forEach { p -> root.addView(tv("${p.timeText}   ${p.title}", 14f, fg).apply { setPadding(0, dp(ctx, 2), 0, dp(ctx, 2)) }) }
        }
        val open = tv("Open full briefing", 15f, Color.WHITE, bold = true).apply {
            gravity = Gravity.CENTER; setPadding(0, dp(ctx, 12), 0, dp(ctx, 12))
            background = GradientDrawable().apply { setColor(Color.parseColor("#F26262")); cornerRadius = dp(ctx, 22).toFloat() }
            setOnClickListener {
                runCatching { ctx.startActivity(Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("ourday://rana")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
                close()
            }
        }
        root.addView(open, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 14) })
        return root
    }
}
