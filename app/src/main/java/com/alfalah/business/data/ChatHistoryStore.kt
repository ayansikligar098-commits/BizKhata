package com.alfalah.business.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.Base64
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.aiChatDataStore: DataStore<Preferences> by preferencesDataStore(name = "bizkhata_ai_chat")

/**
 * AI Assistant chat history — persisted per business profile in the
 * app-private DataStore (UPDATE 9 §11, UPDATE 10 §9, UPDATE 11 §10/§14).
 *
 * Why DataStore and not a new Room table: adding a Room entity would
 * need a database version bump + a schema migration, and the chat is
 * explicitly NOT a financial record — a conversation NEVER becomes a
 * financial record unless a confirmed backend operation creates one.
 * History lives here, money lives in Room; the two never mix.
 *
 * A profile's history is a list of sessions. The current session is the
 * live conversation; "New Chat" archives the current session (it stays
 * searchable) and starts a fresh one. "Clear" deletes all sessions for
 * the profile only — other profiles are untouched. Switching profile
 * switches history immediately (profile isolation).
 *
 * Encoding: fields are Base64 (URL-safe, no padding) joined by unit
 * separators, so newlines / commas / Hindi text in messages cannot
 * corrupt the store. At most 20 archived sessions × 100 messages are
 * kept per profile; older sessions are dropped.
 */
data class StoredChatMessage(
    val text: String,
    val fromUser: Boolean,
    val timestampMs: Long,
    val note: String? = null,
    val isError: Boolean = false
)

data class StoredChatSession(
    val id: Long,
    val startedAtMs: Long,
    val messages: List<StoredChatMessage>
)

class ChatHistoryStore(context: Context) {
    private val store = context.aiChatDataStore

    private fun keyFor(profileId: Long) = stringPreferencesKey("ai_chat_profile_$profileId")

    suspend fun loadSessions(profileId: Long): List<StoredChatSession> {
        val raw = store.data.first()[keyFor(profileId)] ?: return emptyList()
        return decodeSessions(raw)
    }

    suspend fun saveSessions(profileId: Long, sessions: List<StoredChatSession>) {
        val trimmed = sessions.takeLast(20).map { it.copy(messages = it.messages.takeLast(100)) }
        store.edit { it[keyFor(profileId)] = encodeSessions(trimmed) }
    }

    suspend fun clearHistory(profileId: Long) {
        store.edit { it.remove(keyFor(profileId)) }
    }

    // --- Encoding ---------------------------------------------------------
    private fun enc(value: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(value.toByteArray(Charsets.UTF_8))

    private fun dec(value: String): String = try {
        String(Base64.getUrlDecoder().decode(value), Charsets.UTF_8)
    } catch (_: IllegalArgumentException) {
        ""
    }

    /** Sessions joined by \u001e, messages by \u001f, fields by \u001d. */
    private fun encodeSessions(sessions: List<StoredChatSession>): String =
        sessions.joinToString("\u001e") { session ->
            val msgs = session.messages.joinToString("\u001f") { m ->
                listOf(
                    enc(m.text), if (m.fromUser) "1" else "0",
                    m.timestampMs.toString(), enc(m.note ?: ""), if (m.isError) "1" else "0"
                ).joinToString("\u001d")
            }
            "${session.id}\u001d${session.startedAtMs}\u001d$msgs"
        }

    private fun decodeSessions(raw: String): List<StoredChatSession> {
        if (raw.isBlank()) return emptyList()
        return raw.split("\u001e").mapNotNull { sessionPart ->
            val parts = sessionPart.split("\u001d")
            if (parts.size < 3) return@mapNotNull null
            val id = parts[0].toLongOrNull() ?: return@mapNotNull null
            val started = parts[1].toLongOrNull() ?: 0L
            val messages = parts[2].split("\u001f").mapNotNull { msgPart ->
                val f = msgPart.split("\u001d")
                if (f.size < 5) return@mapNotNull null
                StoredChatMessage(
                    text = dec(f[0]),
                    fromUser = f[1] == "1",
                    timestampMs = f[2].toLongOrNull() ?: 0L,
                    note = dec(f[3]).takeIf { it.isNotEmpty() },
                    isError = f[4] == "1"
                )
            }
            StoredChatSession(id, started, messages)
        }
    }
}
