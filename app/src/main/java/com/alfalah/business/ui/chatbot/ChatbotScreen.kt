package com.alfalah.business.ui.chatbot

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.alfalah.business.data.ChatHistoryStore
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import com.alfalah.business.vmFactory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private fun formatTime(ms: Long): String =
    SimpleDateFormat("HH:mm", Locale.ENGLISH).format(Date(ms))

/**
 * BizKhata AI Assistant screen — "BizKhata AI Assistant" /
 * "Your Intelligent Business Assistant" (UPDATE 12: no provider name
 * anywhere in the UI). Route Routes.CHATBOT. Reached from the purple
 * floating chat button on the Dashboard, the drawer entry, and the AI
 * buttons on Daily Business / Money Transfer / Services screens.
 *
 * Native Compose only, no WebView. Message list (user bubbles right in
 * purple, assistant bubbles left) with timestamps, suggestion chips,
 * voice input (mic — text goes into the input field, never auto-sent),
 * text input + send, typing indicator, transaction preview cards with
 * Confirm & Save / Edit / Cancel, comparison tables, deep-link buttons
 * that open the real screen, New Chat, chat-history search, clear
 * history. Answers come from the real Room ledgers of the active
 * profile; when there is no record the assistant says so instead of
 * inventing a figure. Nothing is saved until the user confirms the
 * preview — and the success message only appears after the backend
 * confirms the write.
 */
@Composable
fun ChatbotScreen(
    profileId: Long,
    repository: BusinessRepository,
    settings: SettingsStore,
    chatHistory: ChatHistoryStore,
    language: AppLanguage,
    onOpenSettings: () -> Unit,
    onOpenRoute: (String) -> Unit
) {
    val vm: ChatbotViewModel = viewModel(
        factory = vmFactory { ChatbotViewModel(profileId, repository, settings, chatHistory) }
    )
    val messages by vm.messages.collectAsState()
    val isLoading by vm.isLoading.collectAsState()
    val aiEnabled by vm.aiEnabled.collectAsState()
    val pendingPreviewId by vm.pendingPreviewId.collectAsState()
    // UPDATE 13: voice recogniser language follows the chat language
    // (detected per message, or the Settings preference).
    val voiceLanguageTag by vm.voiceLanguageTag.collectAsState()
    val searchQuery by vm.searchQuery.collectAsState()
    var input by remember { mutableStateOf("") }
    var showSearch by remember { mutableStateOf(false) }
    var showClearConfirm by remember { mutableStateOf(false) }
    var voiceError by remember { mutableStateOf<String?>(null) }
    var listening by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val context = LocalContext.current

    val voiceHelper = remember {
        VoiceInputHelper(
            context = context,
            onResult = { heard -> input = if (input.isBlank()) heard else "$input $heard" },
            onError = { voiceError = it },
            onListeningChanged = { listening = it }
        )
    }
    val micPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            voiceError = null
            voiceHelper.startListening(voiceLanguageTag)
        } else {
            voiceError = "Microphone ki permission nahi mili — type karke bhej sakte hain."
        }
    }

    // Navigation events from the assistant ("Cash Book kholo").
    LaunchedEffect(Unit) {
        vm.navigationEvents.collect { route -> onOpenRoute(route) }
    }

    // Keep the newest message visible.
    LaunchedEffect(messages.size, isLoading) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    fun send(text: String) {
        vm.send(text)
        input = ""
        voiceError = null
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(8.dp))
        BizCard(Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(BizColors.Purple),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.Chat, contentDescription = "AI Assistant", tint = Color.White)
                }
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text("BizKhata AI Assistant", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Your Intelligent Business Assistant",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        if (aiEnabled) "AI summary ON — figures aapke real record se"
                        else "AI summary OFF — built-in jawab, aapke real record se",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = { showSearch = !showSearch }) {
                    Icon(Icons.Filled.Search, contentDescription = "Search chat history")
                }
                TextButton(onClick = { vm.newChat() }) { Text("New Chat", color = BizColors.Purple) }
            }
            Row {
                TextButton(onClick = onOpenSettings) {
                    Text(if (aiEnabled) "AI Key" else "AI Key add karein", color = BizColors.Purple)
                }
                TextButton(onClick = { showClearConfirm = true }) {
                    Text("Clear history", color = BizColors.Purple)
                }
            }
        }
        if (showSearch) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { vm.setSearchQuery(it) },
                placeholder = { Text("Search previous conversations…") },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                trailingIcon = {
                    if (searchQuery.isNotBlank()) {
                        IconButton(onClick = { vm.setSearchQuery("") }) {
                            Icon(Icons.Filled.Clear, contentDescription = "Clear search")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
            if (searchQuery.isNotBlank()) {
                val results = vm.searchResults(searchQuery)
                LazyColumn(
                    Modifier.fillMaxWidth().height(140.dp).padding(top = 6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    if (results.isEmpty()) {
                        item { Text("Koi purani baat nahi mili.", style = MaterialTheme.typography.bodySmall) }
                    } else {
                        items(results) { (date, msg) ->
                            BizCard(Modifier.fillMaxWidth()) {
                                Text(
                                    "${if (msg.fromUser) "Aap" else "Assistant"} • $date",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(msg.text, style = MaterialTheme.typography.bodySmall, maxLines = 3)
                            }
                        }
                    }
                }
            }
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).padding(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(messages, key = { it.id }) { message ->
                MessageBubble(
                    message = message,
                    isPendingPreview = message.id == pendingPreviewId,
                    onConfirm = { vm.confirmPending() },
                    onConfirmEdited = { lines -> vm.confirmPending(lines) },
                    onCancel = { vm.cancelPending() },
                    onOpenRoute = onOpenRoute
                )
            }
            if (isLoading) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
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
                    "Aaj Xerox ke 300 rupaye cash hue",
                    "Aaj ka profit kitna hai?",
                    "Is mahine Xerox se kitni earning hui?",
                    "Kaun paise dene wala hai?",
                    "Agent ko kitna dena hai?",
                    "Cash Book kholo",
                    "Cash balance kitna hai?"
                ).forEach { suggestion ->
                    SuggestionChip(
                        onClick = { send(suggestion) },
                        label = { Text(suggestion) }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        if (listening) {
            Text(
                "Sun raha hoon… boliye. (Voice se entry tabhi save hogi jab aap preview confirm karenge.)",
                style = MaterialTheme.typography.bodySmall,
                color = BizColors.Purple,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }
        voiceError?.let { err ->
            Text(err, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 4.dp))
        }
        Row(
            Modifier.fillMaxWidth().padding(bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = {
                    if (listening) voiceHelper.stopListening()
                    else micPermission.launch(android.Manifest.permission.RECORD_AUDIO)
                },
                modifier = Modifier.size(48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(if (listening) BizColors.ExpenseRed else BizColors.PurpleSoft)
            ) {
                Icon(
                    Icons.Filled.Mic,
                    contentDescription = if (listening) "Stop listening" else "Voice input",
                    tint = if (listening) Color.White else BizColors.Purple
                )
            }
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Apna sawal likhiye… (Hinglish / English / Hindi)") },
                singleLine = false,
                maxLines = 3,
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.weight(1f).padding(start = 8.dp)
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

    if (showClearConfirm) {
        AlertDialog(
            onDismissRequest = { showClearConfirm = false },
            title = { Text("Clear chat history?") },
            text = { Text("Is business profile ki saari chat history delete ho jayegi. Financial records par koi asar nahi padega.") },
            confirmButton = {
                Button(
                    onClick = { showClearConfirm = false; vm.clearHistory() },
                    colors = ButtonDefaults.buttonColors(containerColor = BizColors.ExpenseRed)
                ) { Text("Clear") }
            },
            dismissButton = { TextButton(onClick = { showClearConfirm = false }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun MessageBubble(
    message: ChatMessage,
    isPendingPreview: Boolean,
    onConfirm: () -> Unit,
    onConfirmEdited: (List<AiPreviewLine>) -> Unit,
    onCancel: () -> Unit,
    onOpenRoute: (String) -> Unit
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.fromUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            Modifier.widthIn(max = 320.dp)
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
                color = if (message.fromUser) Color.White
                else if (message.isError) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.onSurface
            )
            if (message.table.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                ComparisonTable(message)
            }
            message.note?.let { note ->
                Text(
                    note,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (message.fromUser) Color.White.copy(alpha = 0.8f)
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
            Text(
                formatTime(message.timestampMs) +
                    if (message.isAiSummary) " • AI summary" else "",
                style = MaterialTheme.typography.labelSmall,
                color = if (message.fromUser) Color.White.copy(alpha = 0.7f)
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
            message.deepLinkRoute?.let { route ->
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { onOpenRoute(route) },
                    colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple),
                    modifier = Modifier.fillMaxWidth()
                ) { Text(message.deepLinkLabel ?: "Kholo") }
            }
            message.preview?.let { preview ->
                Spacer(Modifier.height(8.dp))
                PreviewCard(
                    preview = preview,
                    enabled = isPendingPreview,
                    onConfirm = onConfirm,
                    onConfirmEdited = onConfirmEdited,
                    onCancel = onCancel
                )
            }
        }
    }
}

@Composable
private fun ComparisonTable(message: ChatMessage) {
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        message.tableHeaders?.let { (a, b, c) ->
            Row(Modifier.fillMaxWidth()) {
                Text(a, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text(b, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text(c, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            }
        }
        message.table.forEach { (a, b, c) ->
            Row(Modifier.fillMaxWidth()) {
                Text(a, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text(b, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text(c, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            }
        }
    }
}

/** Transaction preview card: lines, total, Confirm & Save / Edit / Cancel.
 *  Edit mode lets the user change an amount or Cash/UPI before confirming.
 *  When the preview is no longer pending (already confirmed/cancelled),
 *  the buttons disappear — an old preview can never save twice. */
@Composable
private fun PreviewCard(
    preview: AiPreview,
    enabled: Boolean,
    onConfirm: () -> Unit,
    onConfirmEdited: (List<AiPreviewLine>) -> Unit,
    onCancel: () -> Unit
) {
    var editing by remember { mutableStateOf(false) }
    var amounts by remember(preview) {
        mutableStateOf(preview.lines.map { (it.amountPaise / 100).toString() })
    }
    var modes by remember(preview) {
        mutableStateOf(preview.lines.map { it.mode })
    }
    Column(
        Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(preview.kind, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
        preview.lines.forEachIndexed { i, line ->
            if (editing && preview.editable) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(line.label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    OutlinedTextField(
                        value = amounts.getOrNull(i) ?: "",
                        onValueChange = { v -> amounts = amounts.toMutableList().also { it[i] = v.filter { c -> c.isDigit() } } },
                        label = { Text("₹") },
                        singleLine = true,
                        modifier = Modifier.widthIn(max = 110.dp)
                    )
                }
                val mode = modes.getOrNull(i)
                if (mode != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = mode == PaymentMode.CASH,
                            onClick = { modes = modes.toMutableList().also { it[i] = PaymentMode.CASH } },
                            label = { Text("Cash") }
                        )
                        FilterChip(
                            selected = mode == PaymentMode.UPI,
                            onClick = { modes = modes.toMutableList().also { it[i] = PaymentMode.UPI } },
                            label = { Text("UPI") }
                        )
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth()) {
                    Text(line.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(
                        if (line.amountPaise > 0) formatRupees(line.amountPaise) else "",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    line.mode?.let {
                        Text(" ${it.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        if (preview.totalPaise > 0) {
            Row(Modifier.fillMaxWidth()) {
                Text("Total", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Text(formatRupees(preview.totalPaise), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
            }
        }
        preview.note?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (preview.duplicateWarning) {
            Text(
                "Aaj ye entry pehle se hai — agar ye alag entry hai to confirm karein, warna Cancel dabayein.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }
        if (enabled) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (editing) {
                    Button(
                        onClick = {
                            val edited = preview.lines.mapIndexed { i, line ->
                                val paise = parseRupeesToPaise(amounts.getOrNull(i) ?: "") ?: line.amountPaise
                                AiPreviewLine(line.label, paise, modes.getOrNull(i) ?: line.mode)
                            }
                            onConfirmEdited(edited)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple),
                        modifier = Modifier.weight(1f)
                    ) { Text("Save edited") }
                    TextButton(onClick = { editing = false }) { Text("Back") }
                } else {
                    Button(
                        onClick = onConfirm,
                        colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple),
                        modifier = Modifier.weight(1f)
                    ) { Text("Confirm & Save") }
                    if (preview.editable) {
                        TextButton(onClick = { editing = true }) { Text("Edit") }
                    }
                }
                TextButton(onClick = onCancel) { Text("Cancel") }
            }
        } else {
            Text(
                "Ye preview ab pending nahi hai.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
