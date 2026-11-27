package com.alfalah.business.ui.chatbot

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.infiniteTransition
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.alfalah.business.data.ChatHistoryStore
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.AiVoiceConfig
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.VoiceState
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

/** UPDATE 20 (BUG B) — a header circle button on the purple header
 *  bar: translucent-white background (0.16 alpha, 0.30 when the
 *  button's state is ON) + translucent-white border (0.35) + white
 *  icon, mirroring the website's .chat-panel-head.icon-btn fix. White
 *  on translucent white on purple — visible in light and dark themes.
 *  Never a plain white circle (that was the invisibility). */
@Composable
private fun HeaderCircleButton(
    onClick: () -> Unit,
    contentDescription: String,
    active: Boolean = false,
    content: @Composable () -> Unit
) {
    Box(
        Modifier.size(40.dp).clip(CircleShape)
            .background(Color.White.copy(alpha = if (active) 0.30f else 0.16f))
            .border(1.dp, Color.White.copy(alpha = 0.35f), CircleShape)
            .clickable(onClick = onClick, role = Role.Button),
        contentAlignment = Alignment.Center
    ) {
        CompositionLocalProvider(LocalContentColor provides Color.White) { content() }
    }
}

/**
 * BizKhata AI Assistant screen — "BizKhata AI Assistant" /
 * "Your Intelligent Business Assistant" (UPDATE 12: no provider name
 * anywhere in the UI). Route Routes.CHATBOT. Reached from the purple
 * floating chat button on the Dashboard, the drawer entry, and the AI
 * buttons on Daily Business / Money Transfer / Services screens.
 *
 * Native Compose only, no WebView. Message list (user bubbles right in
 * purple, assistant bubbles left) with timestamps, suggestion chips,
 * two-way voice (UPDATE 18: mic -> spoken transcript -> the same
 * conversation pipeline as typed text -> reply spoken aloud, with
 * listening / thinking / speaking indicators, interruption, continuous
 * mode and a visible Stop), text input + send, typing indicator,
 * transaction preview cards with Confirm & Save / Edit / Cancel,
 * comparison tables, deep-link buttons that open the real screen, New
 * Chat, chat-history search, clear history. Answers come from the real
 * Room ledgers of the active profile; when there is no record the
 * assistant says so instead of inventing a figure. Nothing is saved
 * until the user confirms the preview — and the success message only
 * appears after the backend confirms the write. The user speaks in
 * his own way — no fixed commands to memorise; an uncertain
 * transcript gets one short clarification instead of a guess.
 */
@Composable
fun ChatbotScreen(
    profileId: Long,
    repository: BusinessRepository,
    settings: SettingsStore,
    chatHistory: ChatHistoryStore,
    language: AppLanguage,
    onOpenSettings: () -> Unit,
    onOpenRoute: (String) -> Unit,
    onClose: () -> Unit = {}
) {
    val vm: ChatbotViewModel = viewModel(
        factory = vmFactory { ChatbotViewModel(profileId, repository, settings, chatHistory) }
    )
    val messages by vm.messages.collectAsState()
    val isLoading by vm.isLoading.collectAsState()
    val aiEnabled by vm.aiEnabled.collectAsState()
    // UPDATE 17 — streaming state for the thinking indicator, the
    // blinking cursor and the Stop / Regenerate / Copy / Retry controls.
    val isThinking by vm.isThinking.collectAsState()
    val isStreaming by vm.isStreaming.collectAsState()
    val canRetry by vm.canRetry.collectAsState()
    val lastUserMessage by vm.lastUserMessage.collectAsState()
    val clipboardManager = LocalClipboardManager.current
    val lastBotMessage = messages.lastOrNull { !it.fromUser }
    val pendingPreviewId by vm.pendingPreviewId.collectAsState()
    // UPDATE 13: voice recogniser language follows the chat language
    // (detected per message, or the Settings preference).
    val voiceLanguageTag by vm.voiceLanguageTag.collectAsState()
    // UPDATE 18: voice session state (listening / thinking / speaking),
    // continuous mode and the mute toggle.
    val voiceState by vm.voiceState.collectAsState()
    val voiceSessionActive by vm.voiceSessionActive.collectAsState()
    val voiceResponsesEnabled by vm.voiceResponsesEnabled.collectAsState()
    // UPDATE 25: the AI voice's daily usage (visible counter — the
    // free voice is rationed to 10 spoken replies/day).
    val voiceUsedToday by vm.voiceUsedToday.collectAsState()
    val continuousMode by vm.continuousMode.collectAsState()
    val searchQuery by vm.searchQuery.collectAsState()
    // UPDATE 20 §2/§7 — contextual suggestion chips from the
    // ViewModel (website chatbot.tsx QUICK_QUESTIONS on a fresh chat,
    // conversation.ts suggestionsFor after that): only what the last
    // reply earned. A chip sends the real text through the same
    // pipeline.
    val suggestions by vm.suggestions.collectAsState()
    var input by remember { mutableStateOf("") }
    var showSearch by remember { mutableStateOf(false) }
    var showClearConfirm by remember { mutableStateOf(false) }
    var voiceError by remember { mutableStateOf<String?>(null) }
    var listening by remember { mutableStateOf(false) }
    var speaking by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val context = LocalContext.current

    // UPDATE 18: final transcripts go straight into the conversation
    // pipeline (vm.onVoiceTranscript — same as typed text, same
    // preview -> confirm -> backend save). Partial results only fill
    // the input field as a live preview; they are never sent.
    val voiceHelper = remember {
        VoiceInputHelper(
            context = context,
            onResult = { heard -> vm.onVoiceTranscript(heard, -1f) },
            onError = { voiceError = it },
            onListeningChanged = { listening = it },
            onPartial = { partial -> input = partial },
            onResultWithConfidence = { heard, confidence ->
                input = ""
                vm.onVoiceTranscript(heard, confidence)
            }
        )
    }
    // UPDATE 25: spoken replies use the real AI voice (audio from
    // the assistant's voice service, played with MediaPlayer). The
    // text is already in chat; the voice only reads it aloud, in the
    // reply language. No phone/device voice is ever used.
    val voiceSpeaker = remember {
        VoiceSpeaker(
            context = context,
            onSpeechStarted = {
                speaking = true
                vm.setVoiceState(VoiceState.SPEAKING)
            },
            onSpeechEnded = {
                speaking = false
                vm.setVoiceState(VoiceState.IDLE)
            },
            onSpeechError = { voiceError = it }
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
            vm.setVoiceSessionActive(false)
        }
    }

    /** Start a voice turn: mark the session active and ask for the
     *  mic permission (the recogniser starts from the callback). */
    fun startListening() {
        voiceError = null
        vm.setVoiceSessionActive(true)
        vm.setVoiceState(VoiceState.LISTENING)
        micPermission.launch(android.Manifest.permission.RECORD_AUDIO)
    }

    /** End the whole voice session: stop listening + stop speaking. */
    fun stopVoice() {
        voiceHelper.stopListening()
        voiceSpeaker.stop()
        speaking = false
        vm.stopVoiceSession()
    }

    // UPDATE 25: speak assistant replies with the AI voice + stop
    // speech on demand. The reply text is already in the chat list;
    // speaking never creates or changes a message. The audio bytes
    // come from the ViewModel (already quota-checked and fetched);
    // this screen only plays them.
    LaunchedEffect(Unit) {
        vm.speakEvents.collect { request ->
            if (!vm.voiceResponsesEnabled.value) return@collect
            voiceSpeaker.playAudio(request.audioBytes)
        }
    }
    LaunchedEffect(Unit) {
        vm.stopSpeakingEvents.collect {
            voiceSpeaker.stop()
            speaking = false
        }
    }
    // UPDATE 18: continuous mode — after a reply finishes (or a
    // generation ends with nothing spoken, e.g. voice replies are
    // muted), listen again WITHOUT re-tapping the mic, but only
    // while the session is still active and the user has not pressed
    // Stop. The mic is never secretly active: the listening
    // indicator + the Stop button stay visible throughout.
    LaunchedEffect(isLoading, speaking) {
        if (!isLoading && !speaking && continuousMode && voiceSessionActive && !listening) {
            startListening()
        }
    }
    // UPDATE 18: never leave the mic or the speaker running when the
    // screen goes away (back press / profile switch / app pause).
    DisposableEffect(Unit) {
        onDispose {
            voiceHelper.stopListening()
            voiceSpeaker.stop()
            voiceSpeaker.shutdown()
            vm.stopVoiceSession()
        }
    }

    // Navigation events from the assistant ("Cash Book kholo").
    LaunchedEffect(Unit) {
        vm.navigationEvents.collect { route -> onOpenRoute(route) }
    }

    // Keep the newest message visible — but ONLY when the user is
    // already near the bottom, so reading an older message never
    // jumps. As the reply types out, the list follows smoothly.
    LaunchedEffect(messages) {
        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
        if (messages.isNotEmpty() && lastVisible >= messages.size - 2) {
            listState.scrollToItem(messages.size - 1)
        }
    }

    fun send(text: String) {
        vm.send(text)
        input = ""
        voiceError = null
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(8.dp))
        // UPDATE 20 (BUG B) — the chat header is a PURPLE bar, mirroring
        // the website's .chat-panel-head fix: white title/subtitle and
        // circular buttons with a translucent-white background
        // (White 0.16 alpha) + translucent-white border (0.35) + white
        // icons, so every button is visible in light AND dark themes —
        // no white-on-white circle anywhere. Buttons: voice toggle
        // (VolumeUp/VolumeOff; ON = stronger 0.30 background, a clear
        // visual state), search (functional), New Chat (Add icon),
        // Close. The "Voice replies: ON/OFF" chip below stays as the
        // visible voice-state label.
        Surface(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)),
            color = BizColors.Purple
        ) {
            Column(Modifier.padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).padding(end = 8.dp)) {
                        Text(
                            "BizKhata AI Assistant",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White
                        )
                        Text(
                            "Your Intelligent Business Assistant",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                        Text(
                            if (aiEnabled) "AI summary ON — figures aapke real record se"
                            else "AI summary OFF — built-in jawab, aapke real record se",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                    }
                    HeaderCircleButton(
                        onClick = { vm.setVoiceResponsesEnabled(!voiceResponsesEnabled) },
                        contentDescription = if (voiceResponsesEnabled) "Voice replies on — tap to mute" else "Voice replies off — tap to enable",
                        active = voiceResponsesEnabled
                    ) {
                        Icon(
                            if (voiceResponsesEnabled) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                            contentDescription = null,
                            tint = Color.White
                        )
                    }
                    HeaderCircleButton(
                        onClick = { showSearch = !showSearch },
                        contentDescription = "Search chat history"
                    ) {
                        Icon(Icons.Filled.Search, contentDescription = null, tint = Color.White)
                    }
                    HeaderCircleButton(
                        onClick = { vm.newChat() },
                        contentDescription = "New chat"
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = null, tint = Color.White)
                    }
                    HeaderCircleButton(
                        onClick = onClose,
                        contentDescription = "Close chat"
                    ) {
                        Icon(Icons.Filled.Close, contentDescription = null, tint = Color.White)
                    }
                }
                Row {
                    TextButton(onClick = onOpenSettings) {
                        Text(if (aiEnabled) "AI Key" else "AI Key add karein", color = Color.White)
                    }
                    TextButton(onClick = { showClearConfirm = true }) {
                        Text("Clear history", color = Color.White)
                    }
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
            if (isThinking) {
                // UPDATE 17 — thinking indicator: three animated dots
                // + the exact text "BizKhata AI is thinking...". Shown
                // only until the first displayable text arrives; the
                // streaming message replaces it, never both at once.
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
                        Box(
                            Modifier.clip(RoundedCornerShape(16.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(horizontal = 14.dp, vertical = 10.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                ThinkingDots()
                                Text(
                                    "BizKhata AI is thinking...",
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(start = 8.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
        // UPDATE 17 — generation controls, all functional (no
        // decorative buttons). Stop Generating cancels the stream and
        // keeps the text shown so far; Regenerate re-asks the same
        // last message with the same context; Copy copies the complete
        // final response; Retry re-sends after a failure.
        Row(
            Modifier.fillMaxWidth().padding(bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (isStreaming || isThinking) {
                TextButton(onClick = { vm.stopGeneration() }) { Text("Stop Generating", color = MaterialTheme.colorScheme.error) }
            } else {
                if (lastUserMessage != null) {
                    TextButton(onClick = { vm.regenerate() }) { Text("Regenerate", color = BizColors.Purple) }
                }
                if (lastBotMessage != null && lastBotMessage.text.isNotBlank() && !lastBotMessage.streaming) {
                    TextButton(
                        onClick = { clipboardManager.setText(AnnotatedString(lastBotMessage.text)) }
                    ) { Text("Copy", color = BizColors.Purple) }
                }
                if (canRetry) {
                    TextButton(onClick = { vm.retryLast() }) { Text("Retry", color = BizColors.Purple) }
                }
            }
        }
        // UPDATE 18 — voice controls (always visible, never hidden
        // state): continuous conversation on/off, and spoken replies
        // on/off (mute). The mic is only active while the listening
        // indicator below is shown.
        Row(
            Modifier.fillMaxWidth().padding(bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(
                selected = continuousMode,
                onClick = { vm.setContinuousMode(!continuousMode) },
                label = { Text(if (continuousMode) "Continuous: ON" else "Continuous: OFF") }
            )
            FilterChip(
                selected = voiceResponsesEnabled,
                onClick = { vm.setVoiceResponsesEnabled(!voiceResponsesEnabled) },
                label = { Text(if (voiceResponsesEnabled) "Voice replies: ON" else "Voice replies: OFF") }
            )
            // UPDATE 25: the AI voice is rationed (10 spoken replies
            // per day) — the counter is always visible next to the
            // voice toggle so the owner knows how many are left.
            SuggestionChip(
                onClick = { },
                label = { Text(AiVoiceConfig.quotaLabel(voiceUsedToday)) }
            )
        }
        // UPDATE 20 §2/§7 — contextual suggestion chips: the starter
        // set on a fresh chat, then only what the last reply earned
        // (a chip sends the real text through the same pipeline).
        if (suggestions.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                suggestions.forEach { chip ->
                    SuggestionChip(
                        onClick = { send(chip) },
                        label = { Text(chip) }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        // UPDATE 18 — voice status, always visible while a voice
        // session is active: listening / thinking / speaking, with a
        // Stop button that ends listening AND speaking at once. The
        // mic is never active without this indicator on screen.
        if (listening) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Sun raha hoon… boliye, apne hisab se boliye. (Entry tabhi save hogi jab aap preview confirm karenge.)",
                    style = MaterialTheme.typography.bodySmall,
                    color = BizColors.Purple,
                    modifier = Modifier.weight(1f).padding(bottom = 4.dp)
                )
                TextButton(onClick = { stopVoice() }) { Text("Stop", color = MaterialTheme.colorScheme.error) }
            }
        } else if (speaking || voiceState == VoiceState.SPEAKING) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Bol raha hoon… (mic dabakar beech mein rokein, ya \"Bas, short mein batao\" boliye.)",
                    style = MaterialTheme.typography.bodySmall,
                    color = BizColors.Purple,
                    modifier = Modifier.weight(1f).padding(bottom = 4.dp)
                )
                TextButton(onClick = { stopVoice() }) { Text("Stop", color = MaterialTheme.colorScheme.error) }
            }
        } else if (isThinking && voiceSessionActive) {
            Text(
                "Soch raha hoon…",
                style = MaterialTheme.typography.bodySmall,
                color = BizColors.Purple,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        } else if (voiceSessionActive && continuousMode) {
            Text(
                "Continuous mode ON — agla sawal boliye, mic khud chalu hoga. Stop dabakar band karein.",
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
            // UPDATE 18 — mic behaviour: idle -> start listening;
            // listening -> stop the session; speaking -> interrupt
            // the spoken reply (and the typing generation) and start
            // listening for the new instruction.
            IconButton(
                onClick = {
                    when {
                        speaking || voiceState == VoiceState.SPEAKING -> {
                            vm.interruptSpeaking()
                            startListening()
                        }
                        listening -> stopVoice()
                        else -> startListening()
                    }
                },
                modifier = Modifier.size(48.dp)
                    .clip(RoundedCornerShape(24.dp))
                    // UPDATE 20 (BUG B) — the idle mic uses the theme's
                    // primaryContainer / onPrimaryContainer, so it is
                    // visible in light AND dark themes (the old
                    // PurpleSoft + Purple pair was washed out in dark).
                    // Listening / speaking stays ExpenseRed + White.
                    .background(
                        if (listening || speaking) BizColors.ExpenseRed
                        else MaterialTheme.colorScheme.primaryContainer
                    )
            ) {
                Icon(
                    Icons.Filled.Mic,
                    contentDescription = when {
                        speaking || voiceState == VoiceState.SPEAKING -> "Interrupt and listen"
                        listening -> "Stop listening"
                        else -> "Voice input"
                    },
                    tint = if (listening || speaking) Color.White else MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
            // Mute toggle next to the mic (same setting as the chip
            // above and as Settings -> Voice Assistant). Theme primary
            // tint, so it stays visible in both themes.
            IconButton(
                onClick = { vm.setVoiceResponsesEnabled(!voiceResponsesEnabled) },
                modifier = Modifier.padding(start = 4.dp)
            ) {
                Icon(
                    if (voiceResponsesEnabled) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
                    contentDescription = if (voiceResponsesEnabled) "Mute voice replies" else "Unmute voice replies",
                    tint = MaterialTheme.colorScheme.primary
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
                // Input stays usable while streaming: sending stops the
                // current generation cleanly first (UPDATE 17).
                enabled = input.isNotBlank() && (!isLoading || isStreaming || isThinking),
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
            // UPDATE 17 — bot messages render Markdown; user messages
            // stay plain. While a reply is still streaming, a blinking
            // cursor sits at the end of the shown text and is removed
            // smoothly when the reply completes.
            if (message.fromUser) {
                Text(
                    message.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White
                )
            } else {
                Row {
                    MarkdownText(
                        text = message.text,
                        color = if (message.isError) MaterialTheme.colorScheme.error
                        else MaterialTheme.colorScheme.onSurface
                    )
                    if (message.streaming) {
                        BlinkingCursor(color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
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
            // UPDATE 17 — the timestamp appears only AFTER the
            // response completes (never on a still-streaming message).
            if (!message.streaming) {
                Text(
                    formatTime(message.timestampMs) +
                        if (message.isAiSummary) " • AI summary" else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (message.fromUser) Color.White.copy(alpha = 0.7f)
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
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

/**
 * UPDATE 17 — thinking indicator: three dots that rise and fade in
 * turn (infiniteTransition), next to "BizKhata AI is thinking...".
 * Shown only until the first displayable text arrives.
 */
@Composable
private fun ThinkingDots() {
    val transition = rememberInfiniteTransition(label = "thinking-dots")
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        for (i in 0..2) {
            val alpha by transition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 500, delayMillis = i * 170),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "dot-$i"
            )
            val offsetY by transition.animateFloat(
                initialValue = 0f,
                targetValue = -4f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 500, delayMillis = i * 170),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "dot-offset-$i"
            )
            Box(
                Modifier.offset(y = offsetY.dp).size(7.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(BizColors.Purple.copy(alpha = alpha))
            )
        }
    }
}

/** UPDATE 17 — blinking cursor at the end of a streaming reply.
 *  Removed (not rendered) the moment streaming ends. */
@Composable
private fun BlinkingCursor(color: Color) {
    val transition = rememberInfiniteTransition(label = "typing-cursor")
    val alpha by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 530),
            repeatMode = RepeatMode.Reverse
        ),
        label = "cursor-alpha"
    )
    Text(
        "▍",
        style = MaterialTheme.typography.bodyMedium,
        color = color.copy(alpha = alpha)
    )
}

/**
 * UPDATE 17 — small, dependency-free Markdown renderer for bot
 * replies (the app has no Markdown library — adding a heavy one for
 * this was not justified). Handles the constructs the assistant
 * actually produces: headings (# / ## / ###), bold (**x**), italic
 * (*x*), inline code (`x`), fenced code blocks (```), bullet lists
 * (- / * / •), numbered lists (1. ...), and simple pipe tables
 * (| a | b |). Anything unrecognised renders as plain text — never
 * dropped, never crashed on. Multilingual text passes through
 * untouched; the parser only looks at ASCII Markdown markers, so
 * Devanagari / Gujarati / Tamil vowel signs are never split.
 */
@Composable
private fun MarkdownText(text: String, color: Color) {
    if (text.isEmpty()) return
    val lines = text.lines()
    var i = 0
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        while (i < lines.size) {
            val line = lines[i]
            when {
                line.trimStart().startsWith("```") -> {
                    val code = ArrayList<String>()
                    i++
                    while (i < lines.size && !lines[i].trimStart().startsWith("```")) {
                        code.add(lines[i])
                        i++
                    }
                    i++
                    if (code.isNotEmpty()) {
                        Box(
                            Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surface)
                                .padding(8.dp)
                        ) {
                            Text(
                                code.joinToString("\n"),
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                color = color
                            )
                        }
                    }
                }
                line.trimStart().startsWith("### ") -> {
                    Text(
                        markdownInline(line.trimStart().removePrefix("### ").trim()),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = color
                    )
                    i++
                }
                line.trimStart().startsWith("## ") -> {
                    Text(
                        markdownInline(line.trimStart().removePrefix("## ").trim()),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = color
                    )
                    i++
                }
                line.trimStart().startsWith("# ") -> {
                    Text(
                        markdownInline(line.trimStart().removePrefix("# ").trim()),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = color
                    )
                    i++
                }
                line.trimStart().startsWith("|") && line.trimEnd().endsWith("|") -> {
                    val cells = line.trim().trim('|').split("|").map { it.trim() }
                    if (cells.all { it.all { c -> c == '-' || c == ':' || c == ' ' } }) {
                        i++
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            cells.forEach { cell ->
                                Text(
                                    markdownInline(cell),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = color,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        i++
                    }
                }
                line.trimStart().startsWith("- ") ||
                    line.trimStart().startsWith("* ") ||
                    line.trimStart().startsWith("• ") -> {
                    val body = line.trimStart().drop(2).trim()
                    Row {
                        Text("• ", style = MaterialTheme.typography.bodyMedium, color = color)
                        Text(markdownInline(body), style = MaterialTheme.typography.bodyMedium, color = color)
                    }
                    i++
                }
                Regex("^\\d+\\.\\s").containsMatchIn(line.trimStart()) -> {
                    val trimmed = line.trimStart()
                    val marker = trimmed.substringBefore(" ")
                    Row {
                        Text("$marker ", style = MaterialTheme.typography.bodyMedium, color = color)
                        Text(
                            markdownInline(trimmed.substringAfter(" ").trim()),
                            style = MaterialTheme.typography.bodyMedium,
                            color = color
                        )
                    }
                    i++
                }
                line.isBlank() -> {
                    Spacer(Modifier.height(4.dp))
                    i++
                }
                else -> {
                    Text(markdownInline(line), style = MaterialTheme.typography.bodyMedium, color = color)
                    i++
                }
            }
        }
    }
}

/** Inline Markdown (**bold**, *italic*, `code`) to AnnotatedString. */
private fun markdownInline(text: String): AnnotatedString {
    val pattern = Regex("(\\*\\*[^*]+\\*\\*)|(\\*[^*]+\\*)|(`[^`]+`)")
    return buildAnnotatedString {
        var pos = 0
        for (match in pattern.findAll(text)) {
            if (match.range.first > pos) append(text.substring(pos, match.range.first))
            val raw = match.value
            when {
                raw.startsWith("**") -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                    append(raw.removePrefix("**").removeSuffix("**"))
                }
                raw.startsWith("`") -> withStyle(
                    SpanStyle(fontFamily = FontFamily.Monospace)
                ) { append(raw.removePrefix("`").removeSuffix("`")) }
                raw.startsWith("*") -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                    append(raw.removePrefix("*").removeSuffix("*"))
                }
                else -> append(raw)
            }
            pos = match.range.last + 1
        }
        if (pos < text.length) append(text.substring(pos))
    }
}
