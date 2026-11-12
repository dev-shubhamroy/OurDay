package com.ourday.app.ui.design

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.ourday.app.R
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

/** RANA's official avatar: the supplied bull image, shown undistorted (Fit) on a dark disc. The image's own transparency is preserved. */
@Composable
fun RanaMark(size: Dp = 40.dp, modifier: Modifier = Modifier) {
    Box(modifier.size(size).background(Color(0xFF1A1A20), CircleShape).border(1.dp, Od.accent.copy(alpha = 0.55f), CircleShape).clip(CircleShape), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.rana_bull), "RANA", Modifier.fillMaxSize().padding(size * 0.08f), contentScale = ContentScale.Fit)
    }
}

/** "Viewing Aanya's day": shown in Partner Mode so it is never unclear whose context is on screen. */
@Composable
fun PartnerBanner(name: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).background(Od.accent2.copy(alpha = 0.12f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Viewing $name’s tasks and habits. Shared items stay available in both modes.", style = MaterialTheme.typography.bodyMedium, color = Od.accent2)
    }
}
