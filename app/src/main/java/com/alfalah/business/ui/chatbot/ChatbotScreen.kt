package com.alfalah.business.ui.chatbot

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.theme.BizColors
import com.alfalah.business.vmFactory

/**
 * Chatbot / AI Assistant screen — the chatbot's home (route Routes.CHATBOT).
 * Reached from the purple floating chat button on the Dashboard and from
 * the "Chatbot / AI Assistant" drawer entry.
 *
 * Native Compose only, no WebView. Message list (user bubbles right in
 * purple, assistant bubbles left), suggestion chips, text input + send
 * button, a loading row while answering, and an honest footnote on every
 * assistant message: AI summary (Gemini, key in Settings) or built-in
 * answer from real data — plus a plain note when Gemini failed and the
 * built-in answer was shown instead. Answers are computed from the real
 * Room ledgers of the active profile; when there is no record the
 * assistant says so instead of inventing a figure.
 */
@Composable
fun ChatbotScreen(
    profileId: Long,
    repository: BusinessRepository,
    settings: SettingsStore,
    language: AppLanguage,
    onOpenSettings: () -> Unit
) {
    val vm: ChatbotViewModel = viewModel(
        factory = vmFactory { ChatbotViewModel(profileId, repository, settings) }
    )
    val messages by vm.messages.collectAsState()
    val isLoading by vm.isLoading.collectAsState()
    val aiEnabled by vm.aiEnabled.collectAsState()
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    // Keep the newest message visible.
    LaunchedEffect(messages.size, isLoading) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    fun send(text: String) {
        vm.send(text)
        input = ""
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(8.dp))
        BizCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(BizColors.Purple),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.Chat, contentDescription = "Chatbot", tint = Color.White)
                }
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text("BizKhata Assistant", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (aiEnabled) "Gemini AI summary ON (free tier) — figures aapke real record se"
                        else "AI summary OFF — built-in jawab, aapke real record se",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                TextButton(onClick = onOpenSettings) {
                    Text(if (aiEnabled) "Key" else "Key add karein", color = BizColors.Purple)
                }
            }
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(messages) { message -> MessageBubble(message) }
            if (isLoading) {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Start
                    ) {
                        Box(
                            Modifier.clip(RoundedCornerShape(16.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 14.dp, vertical = 10.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    color = BizColors.Purple,
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp
                                )
                                Text(
                                    "Jawab likh raha hai…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(start = 8.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
        if (messages.size <= 1) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    "Aaj ka profit kitna hai?",
                    "Kaun paise dene wala hai?",
                    "Agent ko kitna dena hai?",
                    "Money Transfer commission kitna hai?",
                    "Cash balance kitna hai?"
                ).forEach { suggestion ->
                    androidx.compose.material3.SuggestionChip(
                        onClick = { send(suggestion) },
                        label = { Text(suggestion) }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Row(
            Modifier.fillMaxWidth().padding(bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Apna sawal likhiye… (Hinglish / English / Hindi)") },
                singleLine = false,
                maxLines = 3,
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.weight(1f)
            )
            IconButton(
                onClick = { send(input) },
                enabled = input.isNotBlank() && !isLoading,
                modifier = Modifier.padding(start = 8.dp)
                    .size(48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(BizColors.Purple)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send",
                    tint = Color.White
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.fromUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            Modifier.widthIn(max = 300.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp, topEnd = 16.dp,
                        bottomStart = if (message.fromUser) 16.dp else 4.dp,
                        bottomEnd = if (message.fromUser) 4.dp else 16.dp
                    )
                )
                .background(
                    if (message.fromUser) BizColors.Purple
                    else MaterialTheme.colorScheme.surfaceVariant
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Text(
                message.text,
                style = MaterialTheme.typography.bodyMedium,
                color = if (message.fromUser) Color.White else MaterialTheme.colorScheme.onSurface
            )
            message.note?.let { note ->
                Text(
                    note,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (message.fromUser) Color.White.copy(alpha = 0.8f)
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
        }
    }
}
