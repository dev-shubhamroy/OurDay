package com.ourday.app.ui.design

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.material3.ripple
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes
import com.ourday.domain.rules.Urgency
import com.ourday.domain.rules.ViewMode

// Reusable OurDay building blocks (the Compose counterparts of the web's AuroraCard, CheckButton, UrgencyBadge, Avatar, SectionHeader,
// ViewModeToggle, Segmented chips, EmptyState). Every screen is composed from these, so a visual change is made once.

/** The web's `.aurora` card: a flat surface with a hairline border tinted by the card's "aura". */
@Composable
fun OdCard(
    modifier: Modifier = Modifier, aura: Color = Od.accent, line: Float = 0.12f, shape: Shape = OdShapes.tile, dim: Boolean = false,
    onClick: (() -> Unit)? = null, content: @Composable BoxScope.() -> Unit,
) {
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed && onClick != null) 0.985f else 1f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMedium), label = "press")
    Box(
        modifier.scale(scale).clip(shape).background(Od.surface, shape).border(1.dp, aura.copy(alpha = line), shape)
            .then(if (onClick != null) Modifier.clickable(src, ripple(), onClick = onClick) else Modifier)
            .then(if (dim) Modifier.alpha(0.74f) else Modifier),
        content = content,
    )
}

/** The deadline card's coloured edge (4dp, inset 14dp top and bottom, like the web `::before`). */
fun Modifier.deadlineEdge(color: Color): Modifier = this.drawBehind {
    drawRoundRect(color, topLeft = Offset(0f, 14.dp.toPx()), size = androidx.compose.ui.geometry.Size(4.dp.toPx(), size.height - 28.dp.toPx()), cornerRadius = CornerRadius(4.dp.toPx()))
}

@Composable
fun urgencyColor(u: Urgency): Color = when (u) {
    Urgency.OVERDUE, Urgency.CRITICAL -> Od.danger
    Urgency.APPROACHING -> Od.warn
    Urgency.DONE -> Od.ok
    Urgency.NORMAL -> Od.accent
}

/** Border strength per urgency (web: critical .5, approaching .38, normal .24). */
fun urgencyLine(u: Urgency, subdued: Boolean = false): Float = when (u) {
    Urgency.OVERDUE, Urgency.CRITICAL -> if (subdued) 0.38f else 0.5f
    Urgency.APPROACHING -> if (subdued) 0.28f else 0.38f
    Urgency.NORMAL -> if (subdued) 0.18f else 0.24f
    Urgency.DONE -> 0.14f
}

/** Round completion control; completed = green fill with a check (the web CheckButton). 44dp touch target around a 30dp visual. */
@Composable
fun CheckButton(checked: Boolean, onToggle: () -> Unit, label: String, modifier: Modifier = Modifier, size: Dp = 30.dp) {
    val fill by animateColorAsState(if (checked) Od.ok else Color.Transparent, label = "check-fill")
    val border by animateColorAsState(if (checked) Od.ok else Od.line(0.30f), label = "check-border")
    Box(
        modifier.size(48.dp).semantics { contentDescription = label; stateDescription = if (checked) "Done" else "Not done"; role = Role.Checkbox }.clickable(onClick = onToggle),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(size).background(fill, CircleShape).border(2.dp, border, CircleShape), contentAlignment = Alignment.Center) {
            if (checked) Icon(Icons.Rounded.Check, null, Modifier.fillMaxSize(0.62f), tint = Color.White)
        }
    }
}

@Composable
fun UrgencyBadge(u: Urgency) {
    val (label, color, icon) = when (u) {
        Urgency.OVERDUE -> Triple("Overdue", Od.danger, Icons.Rounded.ErrorOutline)
        Urgency.CRITICAL -> Triple("Critical", Od.danger, Icons.Rounded.WarningAmber)
        Urgency.APPROACHING -> Triple("Approaching", Od.warn, Icons.Rounded.HourglassBottom)
        Urgency.DONE -> Triple("Done", Od.ok, Icons.Rounded.CheckCircle)
        Urgency.NORMAL -> Triple("On track", Od.accent, Icons.Rounded.Schedule)
    }
    Pill(label, color, icon, fillAlpha = 0.12f, lineAlpha = 0.25f)
}

@Composable
fun Pill(text: String, color: Color, icon: ImageVector? = null, fillAlpha: Float = 0.10f, lineAlpha: Float = 0.20f) {
    Row(
        Modifier.clip(CircleShape).background(color.copy(alpha = fillAlpha), CircleShape).border(1.dp, color.copy(alpha = lineAlpha), CircleShape).padding(horizontal = 8.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (icon != null) Icon(icon, null, Modifier.size(12.dp), tint = color)
        Text(text, style = MaterialTheme.typography.labelMedium.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold), color = color, maxLines = 1)
    }
}

@Composable
fun Avatar(initials: String, partner: Boolean, size: Dp = 20.dp, modifier: Modifier = Modifier) {
    val c = if (partner) Od.accent2 else Od.accent
    Box(modifier.size(size).background(c.copy(alpha = 0.20f), CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, color = c, style = MaterialTheme.typography.labelSmall.copy(fontSize = (size.value * 0.42f).sp, letterSpacing = 0.sp))
    }
}

fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (parts.isEmpty()) return "?"
    return (if (parts.size == 1) parts[0].take(2) else "${parts.first()[0]}${parts.last()[0]}").uppercase()
}

@Composable
fun NotifyBell() {
    Box(Modifier.size(24.dp).background(Od.accent.copy(alpha = 0.10f), CircleShape), contentAlignment = Alignment.Center) {
        Icon(Icons.Rounded.NotificationsActive, "Both of you are notified", Modifier.size(14.dp), tint = Od.accent)
    }
}

/** 11sp, uppercase, wide-tracked, muted: the web `.eyebrow`. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = Od.muted) = Text(text.uppercase(), modifier, color = color, style = MaterialTheme.typography.labelSmall)

/** Section header: a 32dp rounded icon tile, a Manrope title and an optional right-hand action (the web SectionHeader). */
@Composable
fun SectionTitle(icon: ImageVector, title: String, modifier: Modifier = Modifier, tint: Color = Od.accent, meta: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 20.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(32.dp).background(tint.copy(alpha = 0.10f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(16.dp), tint = tint) }
        Text(title, style = MaterialTheme.typography.titleLarge, color = Od.fg, modifier = Modifier.weight(1f))
        meta?.invoke()
    }
}

/** A calm empty state: a dashed outline and one line of text. No illustration. */
@Composable
fun DashedEmpty(text: String, modifier: Modifier = Modifier) {
    val color = Od.line(0.22f)
    Box(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).drawBehind {
            drawRoundRect(color, cornerRadius = CornerRadius(14.dp.toPx()), style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))))
        }.padding(horizontal = 16.dp, vertical = 18.dp),
    ) { Text(text, style = MaterialTheme.typography.bodyMedium, color = Od.muted) }
}

/** Filter chip: hairline outline; selected = accent border and tint (the web Segmented / filter buttons). 44dp touch height. */
@Composable
fun FilterPill(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, leading: ImageVector? = null, count: Int? = null) {
    val border by animateColorAsState(if (selected) Od.accent.copy(alpha = 0.40f) else Od.line(0.15f), label = "pill-border")
    val fill by animateColorAsState(if (selected) Od.accent.copy(alpha = 0.15f) else Color.Transparent, label = "pill-fill")
    Row(
        modifier.heightIn(min = 44.dp).clip(OdShapes.control).background(fill, OdShapes.control).border(1.dp, border, OdShapes.control)
            .semantics { role = Role.Tab; stateDescription = if (selected) "Selected" else "" }.clickable(onClick = onClick).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (leading != null) Icon(leading, null, Modifier.size(16.dp), tint = if (selected) Od.accent else Od.muted)
        Text(label, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium), color = if (selected) Od.accent else Od.muted, maxLines = 1)
        if (count != null) Text(count.toString(), style = MaterialTheme.typography.labelMedium, color = if (selected) Od.accent else Od.muted,
            modifier = Modifier.background(Od.line(0.10f), CircleShape).padding(horizontal = 6.dp))
    }
}

/**
 * My Mode / Partner Mode (the web ViewModeToggle). A viewing filter: it never changes the account or workspace.
 * Two avatar segments; the selected one expands to show the name, so the current mode is always explicit.
 */
@Composable
fun ModeToggle(meName: String, partnerName: String?, mode: ViewMode, onChange: (ViewMode) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.height(44.dp).clip(OdShapes.control).background(Od.line(0.08f), OdShapes.control).border(1.dp, Od.line(0.10f), OdShapes.control).semantics { contentDescription = "Viewing mode" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Segment("My Mode", initialsOf(meName), meName.substringBefore(' '), false, mode == ViewMode.ME, true) { onChange(ViewMode.ME) }
        Segment("Partner Mode", partnerName?.let(::initialsOf) ?: "?", partnerName?.substringBefore(' ') ?: "Partner", true, mode == ViewMode.PARTNER, partnerName != null) { onChange(ViewMode.PARTNER) }
    }
}

@Composable
private fun Segment(description: String, initials: String, label: String, partner: Boolean, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val tint = if (partner) Od.accent2 else Od.accent
    val fill by animateColorAsState(if (selected) tint.copy(alpha = 0.15f) else Color.Transparent, label = "seg")
    Row(
        Modifier.fillMaxHeight().padding(2.dp).clip(RoundedCornerShape(12.dp)).background(fill, RoundedCornerShape(12.dp))
            .then(if (selected) Modifier.border(1.dp, tint.copy(alpha = 0.40f), RoundedCornerShape(12.dp)) else Modifier)
            .semantics { contentDescription = description; role = Role.RadioButton; stateDescription = if (selected) "Selected" else if (!enabled) "Your partner hasn't joined yet" else "" }
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Avatar(initials, partner, 22.dp, Modifier.alpha(if (enabled) 1f else 0.4f))
        if (selected) Text(label, style = MaterialTheme.typography.labelLarge, color = tint, maxLines = 1)
    }
}

/** Buttons: primary uses the brand button red, soft is accent-tinted, ghost is a hairline (the web Button variants). */
enum class OdButtonStyle { Primary, Soft, Ghost, Danger }

@Composable
fun OdButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, style: OdButtonStyle = OdButtonStyle.Primary, icon: ImageVector? = null, enabled: Boolean = true, loading: Boolean = false) {
    val (bg, fg, border) = when (style) {
        OdButtonStyle.Primary -> Triple(Od.button, Color.White, Color.Transparent)
        OdButtonStyle.Soft -> Triple(Od.accent.copy(alpha = 0.10f), Od.accent, Od.accent.copy(alpha = 0.25f))
        OdButtonStyle.Ghost -> Triple(Color.Transparent, Od.muted, Od.line(0.10f))
        OdButtonStyle.Danger -> Triple(Od.danger.copy(alpha = 0.10f), Od.danger, Od.danger.copy(alpha = 0.30f))
    }
    val src = remember { MutableInteractionSource() }
    val pressed by src.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, label = "btn")
    Row(
        modifier.scale(scale).heightIn(min = 48.dp).clip(OdShapes.control).background(bg, OdShapes.control).border(1.dp, border, OdShapes.control)
            .alpha(if (enabled) 1f else 0.5f).clickable(src, ripple(), enabled = enabled && !loading, onClick = onClick).padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = fg)
        else if (icon != null) Icon(icon, null, Modifier.size(18.dp), tint = fg)
        Text(text, style = MaterialTheme.typography.labelLarge, color = fg, maxLines = 1)
    }
}
