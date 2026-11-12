package com.ourday.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ourday.app.R
import com.ourday.app.data.prefs.ThemeMode

/**
 * OurDay design tokens: the SAME values as the web app (frontend/src/styles/index.css, "Fusion": graphite base, soft crimson accent,
 * colour-coded sections). Dark is the approved palette, light is its derived counterpart. Change colours here only.
 *   bg / surface / elevated / line   base surfaces and hairlines      fg / muted   text
 *   accent (soft crimson) / button   brand                             danger = urgent, warn = approaching, ok = progress
 *   accent2 = habit violet, partner = partner activity, electric = today blue
 */
@Immutable
class OdColors(
    val dark: Boolean, val bg: Color, val surface: Color, val elevated: Color, val accent: Color, val button: Color, val accent2: Color, val electric: Color,
    val glow: Color, val fg: Color, val muted: Color, val line: Color, val ok: Color, val warn: Color, val danger: Color, val partner: Color, val onFill: Color,
) {
    /** Hairline / border colour at the given strength (the web uses `border-line/10` etc.). */
    fun line(alpha: Float) = line.copy(alpha = alpha)
}

private val DarkTokens = OdColors(
    dark = true, bg = Color(0xFF111114), surface = Color(0xFF1A1A20), elevated = Color(0xFF25252C), accent = Color(0xFFFF6B6B), button = Color(0xFFFF6B6B),
    accent2 = Color(0xFFF15A67), electric = Color(0xFF4C8DF6), glow = Color(0xFFFFB3B6), fg = Color(0xFFF4F2F5), muted = Color(0xFF9996A1), line = Color.White,
    ok = Color(0xFF7BDDB6), warn = Color(0xFFFFB547), danger = Color(0xFFE5484D), partner = Color(0xFFC9B8FF), onFill = Color(0xFF111114),
)
private val LightTokens = OdColors(
    dark = false, bg = Color(0xFFF7F7F8), surface = Color.White, elevated = Color(0xFFF0F0F3), accent = Color(0xFFD6454C), button = Color(0xFFD23B41),
    accent2 = Color(0xFF6954C8), electric = Color(0xFF2664D2), glow = Color(0xFFAA2830), fg = Color(0xFF111113), muted = Color(0xFF64646E), line = Color.Black,
    ok = Color(0xFF147850), warn = Color(0xFFB06400), danger = Color(0xFFC8282E), partner = Color(0xFF6954C8), onFill = Color.White,
)

val LocalOd = staticCompositionLocalOf { DarkTokens }
val Od: OdColors @Composable @ReadOnlyComposable get() = LocalOd.current

/** Kept for the status colours used across screens. */
@Immutable data class Extra(val ok: Color, val warn: Color, val danger: Color, val partner: Color)
val MaterialTheme.extra: Extra @Composable @ReadOnlyComposable get() = Od.let { Extra(it.ok, it.warn, it.danger, it.partner) }

/** Radii from the web tokens: card 20, tile / control 14, input 12, deadline card 16. */
object OdShapes {
    val card = RoundedCornerShape(20.dp)
    val tile = RoundedCornerShape(14.dp)
    val control = RoundedCornerShape(14.dp)
    val input = RoundedCornerShape(12.dp)
    val deadline = RoundedCornerShape(16.dp)
    val sheet = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
}

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, weight: Int) = Font(res, weight = FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

/** Manrope for headings and titles, Inter for everything else: the same pairing as the web app. */
val Display = FontFamily(variable(R.font.manrope, 500), variable(R.font.manrope, 600), variable(R.font.manrope, 700), variable(R.font.manrope, 800))
val Body = FontFamily(variable(R.font.inter, 400), variable(R.font.inter, 500), variable(R.font.inter, 600), variable(R.font.inter, 700))

private val Type = Typography(
    displaySmall = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.8).sp),
    headlineLarge = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.6).sp),
    headlineMedium = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.4).sp),
    titleLarge = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall = TextStyle(fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = Body, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = Body, fontSize = 13.sp, lineHeight = 19.sp),
    bodySmall = TextStyle(fontFamily = Body, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = Body, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, letterSpacing = 0.1.sp),
    labelMedium = TextStyle(fontFamily = Body, fontWeight = FontWeight.Medium, fontSize = 12.sp, letterSpacing = 0.2.sp),
    // the web "eyebrow": 11px, semibold, uppercase, wide tracking
    labelSmall = TextStyle(fontFamily = Body, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 1.5.sp),
)

@Composable
fun OurDayTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.DARK -> true; ThemeMode.LIGHT -> false }
    val t = if (dark) DarkTokens else LightTokens
    val scheme = if (dark) darkColorScheme(
        primary = t.accent, onPrimary = Color.White, primaryContainer = t.accent.copy(alpha = 0.18f), onPrimaryContainer = t.accent,
        secondary = t.accent2, onSecondary = t.onFill, secondaryContainer = t.accent2.copy(alpha = 0.18f), onSecondaryContainer = t.accent2,
        tertiary = t.electric, background = t.bg, onBackground = t.fg, surface = t.bg, onSurface = t.fg, surfaceVariant = t.elevated, onSurfaceVariant = t.muted,
        surfaceContainer = t.surface, surfaceContainerLow = t.surface, surfaceContainerHigh = t.surface, surfaceContainerHighest = t.elevated,
        outline = t.line(0.30f), outlineVariant = t.line(0.12f), error = t.danger, onError = Color.White,
    ) else lightColorScheme(
        primary = t.accent, onPrimary = Color.White, primaryContainer = t.accent.copy(alpha = 0.12f), onPrimaryContainer = t.accent,
        secondary = t.accent2, onSecondary = Color.White, secondaryContainer = t.accent2.copy(alpha = 0.12f), onSecondaryContainer = t.accent2,
        tertiary = t.electric, background = t.bg, onBackground = t.fg, surface = t.bg, onSurface = t.fg, surfaceVariant = t.elevated, onSurfaceVariant = t.muted,
        surfaceContainer = t.surface, surfaceContainerLow = t.surface, surfaceContainerHigh = t.surface, surfaceContainerHighest = t.elevated,
        outline = t.line(0.30f), outlineVariant = t.line(0.12f), error = t.danger, onError = Color.White,
    )
    CompositionLocalProvider(LocalOd provides t) {
        MaterialTheme(
            colorScheme = scheme, typography = Type,
            shapes = Shapes(extraSmall = RoundedCornerShape(8.dp), small = OdShapes.input, medium = OdShapes.tile, large = OdShapes.card, extraLarge = OdShapes.card),
            content = content,
        )
    }
}
