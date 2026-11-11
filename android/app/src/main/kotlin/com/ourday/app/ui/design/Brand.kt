package com.ourday.app.ui.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ourday.app.ui.theme.Od

/** RANA's mark: a calm visor with two eyes (the same identity as the web favicon and the Mac window). */
@Composable
fun RanaMark(size: Dp = 40.dp, modifier: Modifier = Modifier) {
    val accent = Od.accent
    Canvas(modifier.size(size).semantics { contentDescription = "RANA" }) {
        val s = this.size.minDimension
        drawRoundRect(Brush.linearGradient(listOf(Color(0xFF1A2A42), Color(0xFF080D18))), size = Size(s, s), cornerRadius = CornerRadius(s * 0.28f))
        val faceW = s * 0.64f
        val faceH = s * 0.40f
        val left = (s - faceW) / 2
        val top = (s - faceH) / 2
        drawRoundRect(Color(0xFF0B1220), Offset(left, top), Size(faceW, faceH), CornerRadius(faceH * 0.45f))
        drawRoundRect(accent.copy(alpha = 0.55f), Offset(left, top), Size(faceW, faceH), CornerRadius(faceH * 0.45f), style = Stroke(s * 0.03f))
        val eyeW = s * 0.11f
        val eyeH = s * 0.15f
        drawRoundRect(accent, Offset(s * 0.5f - eyeW * 1.9f, s * 0.5f - eyeH / 2), Size(eyeW, eyeH), CornerRadius(eyeW / 2))
        drawRoundRect(accent, Offset(s * 0.5f + eyeW * 0.9f, s * 0.5f - eyeH / 2), Size(eyeW, eyeH), CornerRadius(eyeW / 2))
    }
}

/** "Viewing Aanya's day": shown in Partner Mode so it is never unclear whose context is on screen. */
@Composable
fun PartnerBanner(name: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).background(Od.accent2.copy(alpha = 0.12f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Viewing $name’s tasks and habits. Shared items stay available in both modes.", style = MaterialTheme.typography.bodyMedium, color = Od.accent2)
    }
}
