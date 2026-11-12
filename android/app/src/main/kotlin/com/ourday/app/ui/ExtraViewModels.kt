package com.ourday.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ourday.app.data.remote.isConfigured
import com.ourday.app.data.repo.OurDayRepository
import com.ourday.app.ui.components.SnackbarController
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import javax.inject.Inject

/** One row of the server's own `notifications` history (RLS: only yours). Nothing is invented on the phone. */
@Serializable
data class NotifRow(
    val id: String, val kind: String, val title: String, val body: String, @SerialName("task_id") val taskId: String? = null, @SerialName("habit_id") val habitId: String? = null,
    val subtype: String? = null, @SerialName("occurred_at") val occurredAt: String? = null, @SerialName("created_at") val createdAt: String, @SerialName("read_at") val readAt: String? = null,
)

sealed interface NotifState {
    data object Loading : NotifState
    data class Error(val message: String) : NotifState
    data class Loaded(val rows: List<NotifRow>) : NotifState
}

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val client: SupabaseClient) : ViewModel() {
    private val _state = MutableStateFlow<NotifState>(NotifState.Loading)
    val state: StateFlow<NotifState> = _state
    val unread: StateFlow<Int> = _state.map { s -> (s as? NotifState.Loaded)?.rows?.count { it.readAt == null } ?: 0 }.stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    fun load() = viewModelScope.launch {
        if (!isConfigured || client.auth.sessionStatus.value !is SessionStatus.Authenticated) { if (_state.value is NotifState.Loading) _state.value = NotifState.Error("Sign in to see your notifications."); return@launch }
        runCatching { client.from("notifications").select { order("occurred_at", Order.DESCENDING); limit(100) }.decodeList<NotifRow>() }
            .onSuccess { _state.value = NotifState.Loaded(it) }
            .onFailure { if (_state.value !is NotifState.Loaded) _state.value = NotifState.Error("Couldn’t load notifications. Check your connection and try again.") }
    }

    private fun patchLocal(ids: Set<String>, at: String?) { (_state.value as? NotifState.Loaded)?.let { l -> _state.value = NotifState.Loaded(l.rows.map { if (it.id in ids) it.copy(readAt = at) else it }) } }

    fun markRead(ids: Set<String>) = viewModelScope.launch {
        if (ids.isEmpty()) return@launch
        val at = Instant.now().toString()
        patchLocal(ids, at)
        runCatching { client.from("notifications").update(buildJsonObject { put("read_at", at) }) { filter { isIn("id", ids.toList()) } } }.onFailure { patchLocal(ids, null); SnackbarController.show("Couldn’t mark as read. Check your connection.") }
    }

    fun markAllRead() { (_state.value as? NotifState.Loaded)?.rows?.filter { it.readAt == null }?.map { it.id }?.toSet()?.let { markRead(it) } }
}

/** The Inspiration Library lives in Supabase (`inspiration_quotes`, private per person); the same rows feed the web app and RANA. Edits need a connection. */
@HiltViewModel
class InspirationViewModel @Inject constructor(private val client: SupabaseClient, private val repo: OurDayRepository) : ViewModel() {
    val busy = MutableStateFlow(false)

    fun save(id: String?, text: String, author: String?, done: () -> Unit) = viewModelScope.launch {
        busy.value = true
        val ok = runCatching {
            val row = buildJsonObject { put("text", text.trim()); put("author", author?.trim()?.ifBlank { null }) }
            if (id == null) client.from("inspiration_quotes").insert(row) else client.from("inspiration_quotes").update(row) { filter { eq("id", id) } }
            repo.refresh()
        }.isSuccess
        busy.value = false
        if (ok) done() else SnackbarController.show("Couldn’t save the quote. Check your connection and try again.")
    }

    fun delete(ids: Set<String>, done: () -> Unit) = viewModelScope.launch {
        busy.value = true
        val ok = runCatching { client.from("inspiration_quotes").delete { filter { isIn("id", ids.toList()) } }; repo.refresh() }.isSuccess
        busy.value = false
        if (ok) { done(); SnackbarController.show(if (ids.size == 1) "Quote deleted" else "${ids.size} quotes deleted") } else SnackbarController.show("Couldn’t delete. Check your connection and try again.")
    }
}
