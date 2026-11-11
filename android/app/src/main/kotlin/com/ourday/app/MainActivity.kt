package com.ourday.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.ourday.app.ui.nav.OurDayRoot
import com.ourday.domain.notify.Destination
import com.ourday.domain.notify.NotificationRouting
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var deepLink by mutableStateOf<Destination?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        deepLink = parse(intent)
        setContent { OurDayRoot(deepLink) { deepLink = null } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        parse(intent)?.let { deepLink = it }
    }

    private fun parse(i: Intent?): Destination? = i?.data?.toString()?.let(NotificationRouting::parse)
}
