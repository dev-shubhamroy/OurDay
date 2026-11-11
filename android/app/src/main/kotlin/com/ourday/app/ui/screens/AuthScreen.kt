package com.ourday.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ourday.app.data.remote.isConfigured
import com.ourday.app.ui.AuthViewModel
import com.ourday.app.ui.components.FormError
import com.ourday.app.ui.components.odTextFieldColors
import com.ourday.app.ui.design.OdButton
import com.ourday.app.ui.design.OdCard
import com.ourday.app.ui.design.RanaMark
import com.ourday.app.ui.theme.Od
import com.ourday.app.ui.theme.OdShapes

@Composable
fun AuthScreen(vm: AuthViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsState()
    var signUp by rememberSaveable { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    val submit = { if (signUp) vm.signUp(name, email, password) else vm.signIn(email, password) }

    Column(
        Modifier.fillMaxSize().background(Od.bg).systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            RanaMark(48.dp)
            Column { Text("OurDay", style = MaterialTheme.typography.headlineMedium, color = Od.fg); Text("Plan together. Stay in sync.", style = MaterialTheme.typography.bodySmall, color = Od.muted) }
        }
        Spacer(Modifier.height(8.dp))
        OdCard(Modifier.fillMaxWidth(), Od.accent, 0.18f, OdShapes.card) {
            Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (signUp) "Create your account" else "Welcome back", style = MaterialTheme.typography.headlineMedium, color = Od.fg)
                Text(if (signUp) "It takes a few seconds." else "Sign in to your shared OurDay.", style = MaterialTheme.typography.bodyMedium, color = Od.muted)
                if (!isConfigured) FormError("This build has no Supabase settings. Add them to android/local.properties (see .env.example) and rebuild.")
                if (signUp) OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Your name") }, singleLine = true, shape = OdShapes.input, colors = odTextFieldColors(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true, shape = OdShapes.input, colors = odTextFieldColors(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
                OutlinedTextField(
                    password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true, shape = OdShapes.input, colors = odTextFieldColors(),
                    visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { submit() }),
                    trailingIcon = { IconButton(onClick = { show = !show }) { Icon(if (show) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, if (show) "Hide password" else "Show password", tint = Od.muted) } },
                )
                FormError(ui.error)
                ui.notice?.let { Text(it, color = Od.ok, style = MaterialTheme.typography.bodyMedium) }
                OdButton(if (signUp) "Create account" else "Sign in", { submit() }, Modifier.fillMaxWidth(), enabled = isConfigured, loading = ui.busy)
                TextButton(onClick = { signUp = !signUp; vm.clear() }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(if (signUp) "I already have an account" else "New here? Create an account", color = Od.accent) }
            }
        }
        Text("Use the same email and password as the OurDay web app. To join a partner, accept their invitation in the web app first.", style = MaterialTheme.typography.bodySmall, color = Od.muted)
    }
}
