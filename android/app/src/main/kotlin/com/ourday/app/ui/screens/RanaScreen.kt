package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ourday.app.ui.AppUi
import com.ourday.app.ui.RanaViewModel
import com.ourday.app.ui.components.*
import com.ourday.app.ui.design.*
import com.ourday.app.ui.theme.Display
import com.ourday.app.ui.theme.Od
import com.ourday.domain.model.Task
import com.ourday.domain.model.TaskKind
import com.ourday.domain.rules.TaskRules
import java.time.Duration
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Serif = FontFamily.Serif

/** "14h 11m" / "40m": the live time remaining (the clock behind [AppUi.now] ticks every 30 s). */
private fun remaining(d: Duration): String { val m = d.toMinutes().coerceAtLeast(0); return if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m" }

/** The personalised daily briefing: date, greeting, saved quote, today's deadlines, today's plan as a timeline and one closing action. RANA's logic is unchanged. */
@Composable
fun RanaScreen(ui: AppUi, onBack: () -> Unit, onStart: () -> Unit, vm: RanaViewModel = hiltViewModel()) {
    val brief by vm.brief.collectAsState()
    LaunchedEffect(Unit) { vm.load() }
    DisposableEffect(Unit) { onDispose { vm.markShown() } }
    val b = brief
    Box(Modifier.fillMaxSize().background(Od.bg)) {
        if (b == null) { LoadingState("Preparing your briefing"); return@Box }
        val d = ui.data
        val dueToday = TaskRules.todayDeadlines(d.tasks.filter { it.kind != TaskKind.SHARED }, ui.today, ui.now, ui.zone).filter { it.isOpen && it.dueAt != null && it.dueAt!! >= ui.now }
        val hero = dueToday.firstOrNull()
        val others = if (dueToday.isNotEmpty()) dueToday.drop(1).take(3).map { RanaDeadline(it.title, it.dueAt!!, null) } else emptyList()
        val fallback = if (dueToday.isEmpty()) b.deadlines.take(3) else emptyList()
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 22.dp, end = 22.dp, bottom = 48.dp)) {
            item {
                Row(Modifier.statusBarsPadding().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(46.dp).border(1.dp, Od.line(0.2f), CircleShape).clip(CircleShape).clickable(onClick = onBack), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Close, "Close briefing", tint = Od.fg) }
                    Spacer(Modifier.weight(1f)); RanaMark(46.dp)
                }
            }
            item {
                Row(Modifier.padding(top = 26.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(7.dp).background(Od.accent, CircleShape))
                    Text(DateTimeFormatter.ofPattern("EEEE · d MMMM", Locale.getDefault()).format(ui.today).uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp, letterSpacing = 2.4.sp), color = Od.muted)
                }
            }
            item {
                Text(b.greetingLead.trimEnd(',', ' ') + ",", Modifier.padding(top = 10.dp), style = TextStyleSerif(40, FontStyle.Italic), color = Od.fg)
                if (b.name.isNotBlank()) Text(b.name, style = MaterialTheme.typography.displaySmall.copy(fontFamily = Display, fontSize = 48.sp, lineHeight = 54.sp, fontWeight = FontWeight.ExtraBold), color = Od.accent)
            }
            b.quote?.let { q ->
                item {
                    Column(Modifier.padding(top = 30.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("JUST KNOW THAT –", style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp, letterSpacing = 2.4.sp), color = Od.accent)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("“", style = TextStyleSerif(54, FontStyle.Normal, FontWeight.Bold), color = Od.accent, modifier = Modifier.offset(y = (-4).dp))
                            Column {
                                Text(q.text, style = TextStyleSerif(28, FontStyle.Normal), color = Od.fg)
                                q.author?.let { Text("— $it", Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
                            }
                        }
                    }
                }
            }
            if (hero != null) item { HeroDeadline(hero, ui) }
            items(others) { o -> CompactDeadline(o.title, Fmt.time(o.due, ui.zone, ui.h24), remaining(Duration.between(ui.now, o.due)) + " left") }
            items(fallback) { a -> CompactDeadline(a.title, null, a.detail) }
            if (b.plan.isNotEmpty()) {
                item {
                    Row(Modifier.padding(top = 34.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(34.dp).background(Od.accent.copy(alpha = 0.14f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) { Box(Modifier.size(12.dp).border(2.dp, Od.accent, RoundedCornerShape(3.dp))) }
                        Text("Today’s plan", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold, fontSize = 22.sp), color = Od.fg)
                    }
                }
                items(b.plan.size) { i ->
                    val p = b.plan[i]
                    val lineC = Od.line(0.25f); val dotC = if (i == 0) Od.accent else Od.muted
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                        Box(Modifier.width(26.dp).fillMaxHeight().drawBehind {
                            drawLine(lineC, Offset(size.width / 2, if (i == 0) size.height / 2 else 0f), Offset(size.width / 2, if (i == b.plan.lastIndex) size.height / 2 else size.height), 2.dp.toPx())
                            drawCircle(dotC, 5.dp.toPx(), Offset(size.width / 2, size.height / 2))
                        })
                        Row(
                            Modifier.weight(1f).padding(vertical = 5.dp).background(Od.surface, RoundedCornerShape(18.dp)).border(1.dp, Od.line(0.12f), RoundedCornerShape(18.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(p.title, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp, fontWeight = FontWeight.Medium), color = Od.fg)
                                p.ownerName?.let { Text("$it’s", Modifier.border(1.dp, Od.line(0.25f), CircleShape).padding(horizontal = 10.dp, vertical = 2.dp), style = MaterialTheme.typography.bodySmall, color = Od.muted) }
                            }
                            if (p.timeText.any { it.isDigit() }) Text(p.timeText, Modifier.background(Od.elevated, CircleShape).padding(horizontal = 12.dp, vertical = 6.dp), style = MaterialTheme.typography.bodyMedium, color = Od.fg, maxLines = 1)
                        }
                    }
                }
            }
            item {
                Row(
                    Modifier.padding(top = 30.dp).fillMaxWidth().height(64.dp).background(Color(0xFFF26262), RoundedCornerShape(32.dp)).clip(RoundedCornerShape(32.dp)).clickable(onClick = onStart).padding(start = 28.dp, end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Let’s get started", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium.copy(fontSize = 19.sp, fontWeight = FontWeight.Bold), color = Color.White)
                    Box(Modifier.size(42.dp).background(Color.White.copy(alpha = 0.22f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.ArrowForward, null, tint = Color.White) }
                }
            }
        }
    }
}

private class RanaDeadline(val title: String, val due: java.time.Instant, val note: String?)

@Composable
private fun TextStyleSerif(size: Int, style: FontStyle, weight: FontWeight = FontWeight.Normal) =
    MaterialTheme.typography.displaySmall.copy(fontFamily = Serif, fontSize = size.sp, lineHeight = (size * 1.2f).sp, fontStyle = style, fontWeight = weight)

@Composable
private fun HeroDeadline(t: Task, ui: AppUi) {
    val due = t.dueAt!!
    val shape = RoundedCornerShape(26.dp)
    Column(Modifier.padding(top = 30.dp).fillMaxWidth().background(Color(0xFF1A1214), shape).border(1.dp, Od.accent.copy(alpha = 0.55f), shape).padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("DEADLINE TODAY", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall.copy(fontSize = 13.sp, letterSpacing = 2.4.sp), color = Od.accent)
            Text(Fmt.time(due, ui.zone, ui.h24), style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), color = Od.fg)
        }
        Text(t.title, style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.SemiBold), color = Od.fg)
        HorizontalDivider(color = Od.line(0.18f))
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(remaining(Duration.between(ui.now, due)), style = MaterialTheme.typography.displaySmall.copy(fontFamily = Display, fontSize = 40.sp, fontWeight = FontWeight.ExtraBold), color = Od.accent)
            Text("left", Modifier.padding(bottom = 6.dp), style = MaterialTheme.typography.bodyLarge, color = Od.muted)
        }
    }
}

@Composable
private fun CompactDeadline(title: String, time: String?, detail: String) {
    val shape = RoundedCornerShape(22.dp)
    Row(Modifier.padding(top = 12.dp).fillMaxWidth().border(1.dp, Od.line(0.2f), shape).padding(horizontal = 20.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp, fontWeight = FontWeight.Medium), color = Od.fg)
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = Od.accent)
        }
        if (time != null) Text(time, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), color = Od.fg)
    }
}
