package com.ourday.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import com.ourday.app.MainActivity
import com.ourday.app.R
import com.ourday.app.data.prefs.AppPrefs
import com.ourday.app.data.repo.OurDayRepository
import com.ourday.domain.notify.Destination
import com.ourday.domain.notify.NotificationRouting
import com.ourday.domain.rules.Urgency
import com.ourday.domain.rules.UrgencyRules
import com.ourday.domain.rules.WidgetItem
import com.ourday.domain.rules.WidgetNext
import com.ourday.domain.rules.WidgetRules
import com.ourday.domain.rules.WidgetState
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun repository(): OurDayRepository
    fun prefs(): AppPrefs
}

/** OurDay tokens (same values as the web) as Glance colour roles, light and dark. */
private val WidgetColors = ColorProviders(
    light = lightColorScheme(background = Color(0xFFFFFFFF), onBackground = Color(0xFF111113), surface = Color(0xFFF0F0F3), onSurface = Color(0xFF111113), onSurfaceVariant = Color(0xFF64646E),
        primary = Color(0xFFD6454C), error = Color(0xFFC8282E), tertiary = Color(0xFFB06400), secondary = Color(0xFF147850)),
    dark = darkColorScheme(background = Color(0xFF17171A), onBackground = Color(0xFFF3F3F5), surface = Color(0xFF202024), onSurface = Color(0xFFF3F3F5), onSurfaceVariant = Color(0xFFA4A4AD),
        primary = Color(0xFFFF6A6F), error = Color(0xFFE5484D), tertiary = Color(0xFFFFB547), secondary = Color(0xFF7BDDB6)),
)

private val TaskIdKey = ActionParameters.Key<String>("task_id")

private fun open(context: Context, d: Destination) = actionStartActivity(
    Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(NotificationRouting.deepLink(d))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
)

/**
 * Today's Tasks home-screen widget (Jetpack Glance). It reads the SAME Room database as the app, never a copy. It is re-rendered after
 * every local change and every sync; the OS refresh is hourly (cheap, no network) so the day rolls over without polling.
 */
class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(160.dp, 100.dp), DpSize(250.dp, 110.dp), DpSize(250.dp, 250.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val ep = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java)
        val data = ep.repository().data.first()
        val h24 = ep.prefs().use24h.first()
        val zone = ZoneId.systemDefault()
        val now = Instant.now()
        val ws = data.workspace
        provideContent { GlanceTheme(colors = WidgetColors) { Content(context, ws != null, ws?.me?.firstName, h24, zone, now, data.tasks, data.meId) } }
    }

    @androidx.compose.runtime.Composable
    private fun Content(context: Context, signedInWithData: Boolean, name: String?, h24: Boolean, zone: ZoneId, now: Instant, tasks: List<com.ourday.domain.model.Task>, me: String) {
        val size = LocalSize.current
        val expanded = size.height >= 200.dp
        val wide = size.width >= 220.dp
        val state = WidgetRules.build(tasks, me, now, zone, max = if (expanded) 7 else if (wide) 3 else 2)
        val c = GlanceTheme.colors
        Column(GlanceModifier.fillMaxSize().background(c.background).cornerRadius(22.dp).padding(12.dp)) {
            // Header: branding, remaining count; opens OurDay.
            Row(GlanceModifier.fillMaxWidth().clickable(open(context, Destination.Today)), verticalAlignment = Alignment.CenterVertically) {
                Image(ImageProvider(R.drawable.ic_widget_mark), "OurDay", GlanceModifier.size(26.dp))
                Spacer(GlanceModifier.width(8.dp))
                Text("Today", style = TextStyle(color = c.onBackground, fontSize = 17.sp, fontWeight = FontWeight.Bold), modifier = GlanceModifier.defaultWeight())
                if (signedInWithData && state.remaining > 0) Text("${state.remaining} left", style = TextStyle(color = c.primary, fontSize = 13.sp, fontWeight = FontWeight.Medium))
            }
            Spacer(GlanceModifier.height(8.dp))
            when {
                !signedInWithData -> Text("Open OurDay to sign in and sync.", style = TextStyle(color = c.onSurfaceVariant, fontSize = 13.sp), modifier = GlanceModifier.clickable(open(context, Destination.Today)))
                state.isEmpty -> Text("Nothing planned for today", style = TextStyle(color = c.onSurfaceVariant, fontSize = 13.sp), modifier = GlanceModifier.clickable(open(context, Destination.Today)))
                else -> {
                    state.next?.let { NextDeadline(context, it, h24, zone) }
                    state.items.forEach { TaskLine(context, it, h24) }
                    if (state.hidden > 0) Text("+${state.hidden} more", style = TextStyle(color = c.onSurfaceVariant, fontSize = 12.sp), modifier = GlanceModifier.padding(top = 2.dp).clickable(open(context, Destination.Today)))
                }
            }
        }
    }

    @androidx.compose.runtime.Composable
    private fun NextDeadline(context: Context, n: WidgetNext, h24: Boolean, zone: ZoneId) {
        val c = GlanceTheme.colors
        val tone = when (n.urgency) { Urgency.CRITICAL, Urgency.OVERDUE -> c.error; Urgency.APPROACHING -> c.tertiary; else -> c.primary }
        Column(GlanceModifier.fillMaxWidth().padding(bottom = 6.dp).background(c.surface).cornerRadius(12.dp).padding(horizontal = 10.dp, vertical = 6.dp).clickable(open(context, Destination.Task(n.id)))) {
            Text("NEXT DEADLINE", style = TextStyle(color = tone, fontSize = 10.sp, fontWeight = FontWeight.Bold))
            Text(n.title, maxLines = 1, style = TextStyle(color = c.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium))
            Text("${DateTimeFormatter.ofPattern(if (h24) "EEE HH:mm" else "EEE h:mm a", Locale.getDefault()).format(n.dueAt.atZone(zone))} · ${UrgencyRules.remainingText(n.remaining)}", style = TextStyle(color = tone, fontSize = 12.sp))
        }
    }

    @androidx.compose.runtime.Composable
    private fun TaskLine(context: Context, t: WidgetItem, h24: Boolean) {
        val c = GlanceTheme.colors
        Row(GlanceModifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            // The circle completes (or reopens) the task straight from the widget; the text opens it.
            Image(
                ImageProvider(if (t.done) R.drawable.ic_widget_checked else R.drawable.ic_widget_unchecked), if (t.done) "Reopen ${t.title}" else "Complete ${t.title}",
                GlanceModifier.size(26.dp).clickable(actionRunCallback<ToggleTaskAction>(actionParametersOf(TaskIdKey to t.id))),
            )
            Spacer(GlanceModifier.width(8.dp))
            Column(GlanceModifier.defaultWeight().clickable(open(context, Destination.Task(t.id)))) {
                Text(t.title, maxLines = 1, style = TextStyle(color = if (t.done) c.onSurfaceVariant else c.onBackground, fontSize = 14.sp, fontWeight = FontWeight.Medium))
                t.time?.let { Text(DateTimeFormatter.ofPattern(if (h24) "HH:mm" else "h:mm a", Locale.getDefault()).format(it), style = TextStyle(color = if (t.urgency == Urgency.CRITICAL) c.error else c.onSurfaceVariant, fontSize = 11.sp)) }
            }
        }
    }
}

/** Completing from the widget uses the app's normal offline-first path (queue + optimistic Room update + sync), so it is never lost. */
class ToggleTaskAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[TaskIdKey] ?: return
        val repo = EntryPointAccessors.fromApplication(context, WidgetEntryPoint::class.java).repository()
        val task = repo.data.first().tasks.firstOrNull { it.id == id } ?: return
        repo.setTaskCompleted(task, task.isOpen)
        TodayWidget().updateAll(context)
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}
