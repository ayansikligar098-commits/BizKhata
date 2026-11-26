package com.alfalah.business.ui.chatbot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alfalah.business.data.ChatHistoryStore
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.StoredChatMessage
import com.alfalah.business.data.StoredChatSession
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AiAssistantParser
import com.alfalah.business.domain.AiLanguage
import com.alfalah.business.domain.AiNavigation
import com.alfalah.business.domain.AppHelpKnowledge
import com.alfalah.business.domain.BuiltInChatbotResponder
import com.alfalah.business.domain.BusinessKnowledge
import com.alfalah.business.domain.BusinessSnapshot
import com.alfalah.business.domain.CloudAiClient
import com.alfalah.business.domain.ConversationEngine
import com.alfalah.business.domain.ConversationMemory
import com.alfalah.business.domain.Debtor
import com.alfalah.business.domain.AgentOwed
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.KnowledgeSnapshot
import com.alfalah.business.domain.LastKnowledge
import com.alfalah.business.domain.MeaningParser
import com.alfalah.business.domain.Multilingual
import com.alfalah.business.domain.MultilingualReplies
import com.alfalah.business.domain.VoiceDecision
import com.alfalah.business.domain.VoicePipeline
import com.alfalah.business.domain.VoiceState
import com.alfalah.business.domain.VoiceText
import com.alfalah.business.domain.ServiceIncome
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.domain.formatPaise
import com.alfalah.business.domain.snapshotFacts
import com.alfalah.business.domain.GenerationState
import com.alfalah.business.domain.Typewriter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset

/** One chat message. [note] is a small honest footnote, e.g. "AI summary"
 *  or "built-in jawab". [preview] carries a financial action awaiting
 *  confirmation; [table] a comparison; [deepLinkRoute] opens the real
 *  screen the answer refers to (UPDATE 10 §3, UPDATE 11 §9). */
data class ChatMessage(
    val id: Long = System.nanoTime(),
    val text: String,
    val fromUser: Boolean,
    val timestampMs: Long = System.currentTimeMillis(),
    val isAiSummary: Boolean = false,
    val isError: Boolean = false,
    val note: String? = null,
    val preview: AiPreview? = null,
    val table: List<Triple<String, String, String>> = emptyList(),
    val tableHeaders: Triple<String, String, String>? = null,
    val deepLinkRoute: String? = null,
    val deepLinkLabel: String? = null,
    /** UPDATE 16 — a real checklist produced by a "checklist banao"
     *  command (rendered from [text] too; kept structured for the UI). */
    val checklist: List<String> = emptyList(),
    /** UPDATE 17 — streaming display: [streaming] while the reply is
     *  still being typed out (timestamp is shown only after it
     *  finishes), [streamingStopped] when the user stopped it (the
     *  text shown so far is kept), [generationFailed] when the
     *  generation failed and Retry should be offered. Streaming flags
     *  are display-only — they are NOT persisted to chat history. */
    val streaming: Boolean = false,
    val streamingStopped: Boolean = false,
    val generationFailed: Boolean = false
)

/** A financial action awaiting confirmation, rendered as a preview card
 *  with Confirm & Save / Edit / Cancel (UPDATE 9 §3, §7). */
data class AiPreviewLine(
    val label: String,
    val amountPaise: Long,
    val mode: PaymentMode?
)

data class AiPreview(
    val kind: String,
    val lines: List<AiPreviewLine>,
    val totalPaise: Long,
    val note: String? = null,
    val duplicateWarning: Boolean = false,
    /** False for actions whose lines cannot be meaningfully edited
     *  (delete / correct / add-customer / due). */
    val editable: Boolean = true
)

/**
 * BizKhata AI Assistant ViewModel — the assistant's brain.
 *
 * Branding the user ever sees is ONLY "BizKhata AI Assistant" /
 * "Your Intelligent Business Assistant" (owner order 2026-11-26 22:16
 * IST / UPDATE 12). No provider name, no tier wording, no technical
 * error (no HTTP codes, no key talk) ever reaches the UI.
 *
 * 12-STEP CONTROLLED EXECUTION (UPDATE 11 §4) — every financial action:
 *  (1) understand the message (parser), (2) determine the operation,
 *  (3) generate a structured action request, (4) validate it (parser +
 *  repository guards), (5) authorisation = the signed-in owner
 *  (local-first, single-owner app), (6) profile verified — every write
 *  carries this ViewModel's profileId and the repository checks it,
 *  (7) existing records checked (due/payable caps, agent/customer
 *  resolution, possible-duplicate warning), (8) human-readable preview,
 *  (9) user confirms (Confirm button — nothing saves before that),
 *  (10) execute through the repository, (11) verify the DB result
 *  (returned ids / Duplicate / Failed), (12) report the actual result.
 *  The AI never writes to the database directly, and a success message
 *  is only shown after the backend confirms (UPDATE 11 §12).
 *
 * KNOWLEDGE (UPDATE 10): a live [KnowledgeSnapshot] for the ACTIVE
 * profile only — transactions, Money Transfer, jobs, customers, agents,
 * agent payments, expenses, maintenance, equipment, receipts, MT fund,
 * document count. Answers are computed from it with
 * [AccountingEngine]; profile switch rebuilds it immediately.
 *
 * CONVERSATION MEMORY (UPDATE 11 §§6, 10): last service/mode, last
 * knowledge question (service/period/kind/customer/agent) and the
 * pending clarification live in memory only. Memory NEVER overrides
 * the snapshot — it only fills in what the user did not repeat.
 *
 * HISTORY: persisted per profile in [ChatHistoryStore] (DataStore, not
 * Room — chat is never a financial record). New Chat archives the
 * current session (still searchable); Clear deletes this profile's
 * sessions only.
 */
class ChatbotViewModel(
    private val profileId: Long,
    private val repository: BusinessRepository,
    private val settings: SettingsStore,
    private val chatHistory: ChatHistoryStore
) : ViewModel() {

    private val greetingText =
        "Namaste! Main BizKhata AI Assistant hoon — Your Intelligent Business Assistant. " +
            "Aap apne dukaan ke hisab ke baare me pooch sakte hain, ya normal bhasha me bata sakte hain " +
            "aaj kya hua — jaise \"Aaj Xerox ke 300 rupaye cash hue\". Main pehle samajhkar dikhaunga, " +
            "phir aap confirm karenge, tabhi save hoga."

    private val _messages = MutableStateFlow(listOf(ChatMessage(text = greetingText, fromUser = false)))
    val messages: StateFlow<List<ChatMessage>> = _messages

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    // --- UPDATE 17 — streaming generation state -----------------------
    // One active generation at a time: a new send stops the current
    // generation cleanly first (its text is kept, marked stopped).
    // Thinking shows until the first displayable text arrives; the
    // typewriter then reveals the reply progressively. The local
    // engine generates on-device and is only DISPLAYED through the
    // typewriter — local engine: typewriter display over locally
    // generated text, no network stream.
    private val _generationState = MutableStateFlow(GenerationState.IDLE)
    val generationState: StateFlow<GenerationState> = _generationState

    private val _isThinking = MutableStateFlow(false)
    val isThinking: StateFlow<Boolean> = _isThinking

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming

    /** The last user message, for Regenerate / Retry (same context,
     *  same history — the reply is generated fresh, the user message
     *  is NOT sent twice). */
    private val _lastUserMessage = MutableStateFlow<String?>(null)
    val lastUserMessage: StateFlow<String?> = _lastUserMessage

    /** True after a generation failed, until a Retry / Regenerate /
     *  new send succeeds. The screen shows Retry only then. */
    private val _canRetry = MutableStateFlow(false)
    val canRetry: StateFlow<Boolean> = _canRetry

    private val _lastFailedMessageId = MutableStateFlow<Long?>(null)
    val lastFailedMessageId: StateFlow<Long?> = _lastFailedMessageId

    private var generationJob: Job? = null
    private var typewriter: Typewriter? = null
    private var streamingMessageId: Long? = null

    private val _aiEnabled = MutableStateFlow(false)
    val aiEnabled: StateFlow<Boolean> = _aiEnabled

    /** Voice recogniser language tag (UPDATE 13): follows the language
     *  the user is chatting in — detected per message, or the manual
     *  AI-language preference from Settings when one is set. The chat
     *  screen passes this to VoiceInputHelper.startListening(). */
    private val _voiceLanguageTag = MutableStateFlow("hi-IN")
    val voiceLanguageTag: StateFlow<String> = _voiceLanguageTag

    /** Manual AI-language preference ("AUTO" or an AiLanguage code). */
    private val _aiLanguagePref = MutableStateFlow("AUTO")
    val aiLanguagePref: StateFlow<String> = _aiLanguagePref

    // --- Voice (UPDATE 18) ------------------------------------------------
    // Two-way voice: transcripts from VoiceInputHelper arrive via
    // onVoiceTranscript() and are routed through the SAME pipeline as
    // typed text (send() -> handleMessage()). The intelligence behind
    // the reply is the same conversational client as text chat
    // (CloudAiClient.converse() when the owner added his AI
    // key in Settings, local engine otherwise — the key is read
    // exactly as the text chat reads it; voice changes nothing about
    // how it is stored or read). Spoken replies go out through
    // [speakEvents] (the screen's VoiceSpeaker speaks them); the
    // text of every reply is already in [messages], so a spoken
    // reply is never the only copy of an answer.
    private val _voiceState = MutableStateFlow(VoiceState.IDLE)
    val voiceState: StateFlow<VoiceState> = _voiceState

    private val _voiceSessionActive = MutableStateFlow(false)
    val voiceSessionActive: StateFlow<Boolean> = _voiceSessionActive

    private val _voiceResponsesEnabled = MutableStateFlow(true)
    val voiceResponsesEnabled: StateFlow<Boolean> = _voiceResponsesEnabled

    private val _speechRate = MutableStateFlow(1.0f)
    val speechRate: StateFlow<Float> = _speechRate

    private val _speechPitch = MutableStateFlow(1.0f)
    val speechPitch: StateFlow<Float> = _speechPitch

    private val _continuousMode = MutableStateFlow(false)
    val continuousMode: StateFlow<Boolean> = _continuousMode

    /** One spoken reply, in the reply language. The screen collects
     *  these and speaks them with VoiceSpeaker (native TTS). */
    data class VoiceSpeakRequest(val text: String, val languageTag: String)

    private val _speakEvents = MutableSharedFlow<VoiceSpeakRequest>(extraBufferCapacity = 8)
    val speakEvents: SharedFlow<VoiceSpeakRequest> = _speakEvents

    /** Emitted when speech must stop now (interruption / session end). */
    private val _stopSpeakingEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val stopSpeakingEvents: SharedFlow<Unit> = _stopSpeakingEvents

    private var lastVoiceTranscript: String? = null
    private var lastVoiceTranscriptAtMs: Long = 0L
    /** A voice transcript that arrived while a reply was still being
     *  processed: kept (not dropped) and sent when the reply ends. */
    private var queuedVoiceTranscript: String? = null

    /** Language the assistant currently replies in (UPDATE 13): the
     *  manual Settings preference wins; otherwise the detected language
     *  of this message; otherwise the last language of the conversation.
     *  A manual preference never forces a choice before chatting — it is
     *  only read when the user has set one. */
    private fun effectiveLanguage(text: String): AiLanguage {
        val preferred = AiLanguage.fromCode(_aiLanguagePref.value.takeIf { it != "AUTO" })
        if (preferred != AiLanguage.UNKNOWN) return preferred
        val detected = Multilingual.detectLanguage(text)
        return if (detected.language != AiLanguage.UNKNOWN) detected.language
            else context.lastLanguage
    }

    private val _snapshot = MutableStateFlow(BusinessSnapshot())
    val snapshot: StateFlow<BusinessSnapshot> = _snapshot

    private val _knowledge = MutableStateFlow(KnowledgeSnapshot(profileId, "", ""))
    val knowledge: StateFlow<KnowledgeSnapshot> = _knowledge

    /** Navigation requests — the screen collects these and navigates to
     *  the REAL NavGraph route (never a fake navigation response). */
    private val _navigationEvents = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val navigationEvents: SharedFlow<String> = _navigationEvents

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery

    /** Id of the preview message that is still awaiting confirmation.
     *  Only that card shows Confirm/Edit/Cancel — an old preview can
     *  never save twice. */
    private val _pendingPreviewId = MutableStateFlow<Long?>(null)
    val pendingPreviewId: StateFlow<Long?> = _pendingPreviewId

    /** All sessions (current + archived) for search. */
    private val _allSessions = MutableStateFlow<List<StoredChatSession>>(emptyList())
    val allSessions: StateFlow<List<StoredChatSession>> = _allSessions

    private var currentSessionId: Long = System.currentTimeMillis()
    private var historyLoaded = false

    // --- Conversation state -------------------------------------------------
    private data class PendingAction(
        val action: AiAssistantParser.AiAction,
        val key: String,
        val previewMessageId: Long
    )

    private data class ClarificationState(
        val originalText: String,
        val partial: AiAssistantParser.AiAction?,
        val missing: List<String>,
        val candidates: List<CandidateTx> = emptyList(),
        val isCorrection: Boolean = false,
        val isDelete: Boolean = false
    )

    data class CandidateTx(val id: Long, val label: String, val amountPaise: Long)

    private var pendingAction: PendingAction? = null
    private var clarification: ClarificationState? = null
    private var context = AiAssistantParser.AiConversationContext()
    private var lastKnowledge: LastKnowledge? = null

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    init {
        // KEY MIGRATION (UPDATE 17): run the one-time legacy-key
        // migration before the first aiKey read, so a key the owner
        // entered early (under the old storage key) is visible to
        // the cloud client and cloud streaming on this launch.
        viewModelScope.launch { settings.migrateLegacyAiKey() }
        viewModelScope.launch { settings.aiKey.collect { key -> _aiEnabled.value = key.isNotBlank() } }
        viewModelScope.launch {
            settings.aiLanguagePref.collect { pref ->
                _aiLanguagePref.value = pref
                if (pref != "AUTO") _voiceLanguageTag.value = AiLanguage.fromCode(pref).bcp47
            }
        }
        // UPDATE 18: voice preferences (Settings -> voice section).
        viewModelScope.launch { settings.voiceResponsesEnabled.collect { _voiceResponsesEnabled.value = it } }
        viewModelScope.launch { settings.voiceSpeechRate.collect { _speechRate.value = it } }
        viewModelScope.launch { settings.voiceSpeechPitch.collect { _speechPitch.value = it } }
        viewModelScope.launch { settings.voiceContinuousMode.collect { _continuousMode.value = it } }
        viewModelScope.launch {
            val sessions = chatHistory.loadSessions(profileId)
            _allSessions.value = sessions
            val last = sessions.lastOrNull()
            if (last != null && last.messages.isNotEmpty()) {
                currentSessionId = last.id
                _messages.value = last.messages.map { it.toChatMessage() }
            }
            historyLoaded = true
        }
        viewModelScope.launch {
            combine(
                repository.observeTransactions(profileId),
                repository.observeMoneyTransfers(profileId),
                repository.observeAllJobs(profileId),
                repository.searchCustomers(profileId, ""),
                repository.observeAgents(profileId),
                repository.observeAllAgentPayments(profileId),
                repository.observeExpenses(profileId),
                repository.observeAllMaintenance(profileId),
                repository.observeEquipment(profileId),
                repository.observeReceipts(profileId),
                repository.observeFunds(profileId),
                settings.customServices
            ) { txs, transfers, jobs, customers, agents, agentPayments,
                expenses, maintenance, equipment, receipts, funds, customServices ->
                KnowledgeInputs(
                    txs, transfers, jobs, customers, agents, agentPayments,
                    expenses, maintenance, equipment, receipts, funds, customServices
                )
            }.collect { inputs ->
                val docCount = repository.documentCountForProfile(profileId)
                _knowledge.value = KnowledgeSnapshot(
                    profileId = profileId,
                    profileName = "",
                    profileCategory = "",
                    transactions = inputs.txs,
                    transfers = inputs.transfers,
                    jobs = inputs.jobs,
                    customers = inputs.customers,
                    agents = inputs.agents,
                    agentPayments = inputs.agentPayments,
                    expenses = inputs.expenses,
                    maintenance = inputs.maintenance,
                    equipment = inputs.equipment,
                    receipts = inputs.receipts,
                    funds = inputs.funds,
                    documentCount = docCount,
                    customServices = inputs.customServices
                )
                _snapshot.value = buildBusinessSnapshot(inputs)
            }
        }
    }

    private fun buildBusinessSnapshot(inputs: KnowledgeInputs): BusinessSnapshot {
        val periodTxs = inputs.txs.filter { it.dateEpochDay == today && it.kind != "INTERNAL_TRANSFER" }
        val income = periodTxs.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
        val expenses = periodTxs.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }
        val mtToday = inputs.transfers.filter { it.dateEpochDay == today }
        val mtProfit = AccountingEngine.moneyTransferProfit(
            commissionPaise = mtToday.sumOf { it.commissionPaise },
            transferChargesPaise = mtToday.sumOf { it.chargesPaise },
            moneyTransferExpensesPaise = 0
        )
        val cashIn = inputs.txs.filter { it.mode.name == "CASH" && it.kind == "INCOME" }.sumOf { it.amountPaise }
        val cashOut = inputs.txs.filter { it.mode.name == "CASH" && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
        val upiIn = inputs.txs.filter { it.mode.name == "UPI" && it.kind == "INCOME" }.sumOf { it.amountPaise }
        val upiOut = inputs.txs.filter { it.mode.name == "UPI" && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
        val cashToUpi = inputs.txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode.name == "CASH" }.sumOf { it.amountPaise }
        val upiToCash = inputs.txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode.name == "UPI" }.sumOf { it.amountPaise }
        val dueByCustomer = inputs.jobs
            .groupBy { it.customerId }
            .mapValues { (_, js) -> js.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) } }
            .filter { it.value > 0 }
        val topDebtors = dueByCustomer.entries
            .sortedByDescending { it.value }.take(5)
            .map { (customerId, due) ->
                val name = inputs.customers.firstOrNull { it.id == customerId }?.name ?: "Customer"
                Debtor(name, due)
            }
        val topAgentsOwed = inputs.agents.mapNotNull { agent ->
            val charges = inputs.jobs.filter { it.agentId == agent.id }.sumOf { it.agentChargesPaise }
            val paid = inputs.agentPayments.filter { it.agentId == agent.id }.sumOf { it.amountPaise }
            val payable = AccountingEngine.agentPayable(charges, paid)
            if (payable > 0) AgentOwed(agent.name, payable) else null
        }.sortedByDescending { it.payablePaise }.take(5)
        return BusinessSnapshot(
            todayIncomePaise = income + mtToday.sumOf { it.commissionPaise },
            todayExpensesPaise = expenses,
            todayProfitPaise = AccountingEngine.netProfit(income, mtProfit, expenses),
            cashBalancePaise = cashIn - cashOut - cashToUpi + upiToCash,
            upiBalancePaise = upiIn - upiOut + cashToUpi - upiToCash,
            customerDuePaise = inputs.jobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) },
            agentPayablePaise = topAgentsOwed.sumOf { it.payablePaise },
            moneyTransferCommissionPaise = mtToday.sumOf { it.commissionPaise },
            moneyTransferPrincipalPaise = mtToday.sumOf { it.amountPaise },
            moneyTransferFundPaise = inputs.funds.sumOf { it.amountPaise },
            topDebtors = topDebtors,
            topAgentsOwed = topAgentsOwed,
            serviceIncomeToday = periodTxs.filter { it.kind == "INCOME" }
                .groupBy { it.category }
                .mapValues { (_, list) -> list.sumOf { it.amountPaise } }
                .toList().sortedByDescending { it.second }.take(6)
                .map { (label, amount) -> ServiceIncome(label, amount) },
            pendingJobs = inputs.jobs.count {
                it.status == JobStatus.NEW || it.status == JobStatus.IN_PROGRESS ||
                    it.status == JobStatus.SUBMITTED || it.status == JobStatus.PENDING
            }.toLong(),
            totalJobs = inputs.jobs.size.toLong(),
            totalCustomers = inputs.customers.size.toLong()
        )
    }

    // ------------------------------------------------------------------
    // Message plumbing (persisted per profile).
    // ------------------------------------------------------------------
    private fun append(message: ChatMessage, persistNow: Boolean = true) {
        _messages.value = _messages.value + message
        if (persistNow) persist()
        maybeSpeak(message)
    }

    private fun replaceMessage(id: Long, replacement: ChatMessage, persistNow: Boolean = true) {
        _messages.value = _messages.value.map { if (it.id == id) replacement else it }
        if (persistNow) persist()
        maybeSpeak(replacement)
    }

    /**
     * UPDATE 18 — speak a finished assistant reply aloud while a
     * voice session is active and voice responses are on. Called
     * from append() (previews, clarifications, confirmations) and
     * from replaceMessage() (a streamed reply's FINAL text — the
     * per-word display updates are still streaming, so they are
     * skipped, and a stopped generation is never spoken). The
     * (id, text) guard means a message is spoken exactly once even
     * though replaceMessage runs for every display update.
     */
    private var lastSpokenKey: String? = null

    private fun maybeSpeak(message: ChatMessage) {
        if (message.fromUser) return
        if (!_voiceSessionActive.value || !_voiceResponsesEnabled.value) return
        if (message.streaming || message.streamingStopped) return
        val text = message.text.trim()
        if (text.isBlank()) return
        val key = "${message.id}:$text"
        if (key == lastSpokenKey) return
        lastSpokenKey = key
        _speakEvents.tryEmit(
            VoiceSpeakRequest(VoiceText.speakable(text), _voiceLanguageTag.value)
        )
    }

    /** Persist the current message list now (used once, when a
     *  streamed reply finishes — streaming updates do NOT persist
     *  every word, or history would be rewritten per word). */
    private fun persistNow() {
        persist()
    }

    private fun persist() {
        if (!historyLoaded) return
        viewModelScope.launch {
            val stored = _messages.value.map { it.toStored() }
            val sessions = _allSessions.value.toMutableList()
            val idx = sessions.indexOfFirst { it.id == currentSessionId }
            val session = StoredChatSession(currentSessionId, currentSessionId, stored)
            if (idx >= 0) sessions[idx] = session else sessions.add(session)
            _allSessions.value = sessions
            chatHistory.saveSessions(profileId, sessions)
        }
    }

    fun newChat() {
        stopGeneration()
        pendingAction = null
        _pendingPreviewId.value = null
        clarification = null
        context = AiAssistantParser.AiConversationContext(dayEpoch = today)
        lastKnowledge = null
        currentSessionId = System.currentTimeMillis()
        _messages.value = listOf(ChatMessage(text = greetingText, fromUser = false))
        persist()
    }

    fun clearHistory() {
        viewModelScope.launch {
            chatHistory.clearHistory(profileId)
            _allSessions.value = emptyList()
            newChat()
        }
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    /** Messages across all sessions matching the search query. */
    fun searchResults(query: String): List<Pair<String, StoredChatMessage>> {
        if (query.isBlank()) return emptyList()
        val q = query.lowercase()
        return _allSessions.value.flatMap { session ->
            session.messages.filter { it.text.lowercase().contains(q) }
                .map { java.text.SimpleDateFormat("dd MMM yyyy", java.util.Locale.ENGLISH).format(java.util.Date(session.startedAtMs)) to it }
        }.take(30)
    }

    // ------------------------------------------------------------------
    // UPDATE 17 — streaming generation controls.
    // ------------------------------------------------------------------
    /** Stop the active generation: cancels the generation coroutine
     *  (and the cloud call underneath it) and stops the typewriter.
     *  The text shown so far is KEPT and the message is marked
     *  stopped — nothing is deleted and no partial entry is saved. */
    fun stopGeneration() {
        typewriter?.stop()
        generationJob?.cancel()
        _isThinking.value = false
        _isStreaming.value = false
        _generationState.value = GenerationState.STOPPED
    }

    /** Regenerate: a fresh reply to the same last user message, with
     *  the same conversation context and history. Disabled while a
     *  generation is running (the screen enforces this). */
    fun regenerate() {
        val last = _lastUserMessage.value ?: return
        if (_isStreaming.value || _isThinking.value) return
        startGeneration(last, appendUser = false)
    }

    /** Retry: re-send the last user message after a generation
     *  failure, with the context intact. Only offered when
     *  [_canRetry] is true. */
    fun retryLast() {
        if (!_canRetry.value) return
        val last = _lastUserMessage.value ?: return
        if (_isStreaming.value || _isThinking.value) return
        _canRetry.value = false
        _lastFailedMessageId.value = null
        startGeneration(last, appendUser = false)
    }

    override fun onCleared() {
        // Cleanup: cancel any active stream + typewriter when the
        // ViewModel goes away (screen left / profile switched).
        typewriter?.stop()
        generationJob?.cancel()
        super.onCleared()
    }

    /** One generation at a time. A new send first cancels the active
     *  generation cleanly (its shown text is kept, marked stopped),
     *  then runs the new one. */
    private fun startGeneration(userText: String, appendUser: Boolean) {
        if (appendUser) {
            _lastUserMessage.value = userText
            _canRetry.value = false
            _lastFailedMessageId.value = null
        }
        viewModelScope.launch {
            generationJob?.cancelAndJoin()
            finalizeStoppedGeneration()
            _isLoading.value = true
            _generationState.value = GenerationState.THINKING
            val job = launch {
                try {
                    handleMessage(userText)
                } catch (e: CancellationException) {
                    finalizeStoppedGeneration()
                    throw e
                } catch (_: Exception) {
                    markGenerationFailed()
                    append(
                        ChatMessage(
                            text = "Kuch galat ho gaya — main aapka message process nahi kar paya. Koi entry save nahi hui hai. Phir se try karein.",
                            fromUser = false, isError = true, generationFailed = true
                        )
                    )
                } finally {
                    _isLoading.value = false
                    _isThinking.value = false
                    _isStreaming.value = false
                    if (_generationState.value == GenerationState.THINKING ||
                        _generationState.value == GenerationState.STREAMING
                    ) {
                        _generationState.value = GenerationState.IDLE
                    }
                }
            }
            generationJob = job
            job.join()
        }
    }

    /** If a streaming message is mid-flight when generation stops,
     *  keep its shown text, mark it stopped and stamp its timestamp
     *  (timestamps appear only on completed / stopped messages). */
    private fun finalizeStoppedGeneration() {
        val id = streamingMessageId ?: return
        val current = _messages.value.firstOrNull { it.id == id } ?: run {
            streamingMessageId = null
            return
        }
        if (!current.streaming) {
            streamingMessageId = null
            return
        }
        streamingMessageId = null
        replaceMessage(
            id,
            current.copy(
                streaming = false,
                streamingStopped = true,
                timestampMs = System.currentTimeMillis()
            ),
            persistNow = true
        )
    }

    /** Mark the last bot message as failed so the screen can offer Retry. */
    private fun markGenerationFailed() {
        _canRetry.value = true
        _generationState.value = GenerationState.FAILED
        val lastBot = _messages.value.lastOrNull { !it.fromUser }
        if (lastBot != null) {
            _lastFailedMessageId.value = lastBot.id
            replaceMessage(lastBot.id, lastBot.copy(generationFailed = true), persistNow = true)
        }
    }

    // ------------------------------------------------------------------
    // Main entry: send a message.
    // ------------------------------------------------------------------
    fun send(rawText: String) {
        val text = rawText.trim()
        if (text.isEmpty()) return
        // Input stays usable while streaming: sending a new message
        // stops the current generation cleanly first (startGeneration
        // cancels it). Only a non-streaming load (e.g. Confirm & Save)
        // blocks a new send.
        if (_isLoading.value && !_isStreaming.value && !_isThinking.value) return
        append(ChatMessage(text = text, fromUser = true))
        startGeneration(text, appendUser = true)
    }

    // ------------------------------------------------------------------
    // Voice entry point (UPDATE 18).
    // ------------------------------------------------------------------
    /** A recognised transcript (with its STT confidence, -1f when the
     *  recogniser gave none) — routed through the SAME pipeline as
     *  typed text (send() -> handleMessage() -> the shared
     *  conversational client: cloud when the owner added his
     *  AI key, local engine otherwise; the key is read exactly
     *  as text chat reads it — voice changes nothing about how it is
     *  stored or read). The gate (VoicePipeline.decide) runs first:
     *  empty / duplicate firings are dropped, low-confidence
     *  transcripts get one short "please repeat" prompt instead of
     *  being guessed at, and an interrupt phrase stops the current
     *  spoken reply before the new instruction is processed. A
     *  transcript that arrives while a non-streaming save is running
     *  is queued (not dropped) and sent when the save finishes. */
    fun onVoiceTranscript(transcript: String, confidence: Float = -1f) {
        val nowMs = System.currentTimeMillis()
        val decision = VoicePipeline.decide(
            transcript = transcript,
            confidence = confidence,
            isSpeaking = _voiceState.value == VoiceState.SPEAKING,
            lastTranscript = lastVoiceTranscript,
            lastTranscriptAtMs = lastVoiceTranscriptAtMs,
            nowMs = nowMs
        )
        when (decision) {
            is VoiceDecision.IgnoreEmpty, VoiceDecision.IgnoreDuplicate -> return
            is VoiceDecision.AskRepeat -> {
                _voiceSessionActive.value = true
                _voiceState.value = VoiceState.LISTENING
                append(
                    ChatMessage(
                        text = VoiceText.repeatPrompt(effectiveLanguage(transcript)),
                        fromUser = false
                    )
                )
            }
            is VoiceDecision.InterruptAndSend -> {
                viewModelScope.launch { _stopSpeakingEvents.emit(Unit) }
                stopGeneration()
                _voiceState.value = VoiceState.LISTENING
                if (decision.text.isBlank()) {
                    _voiceSessionActive.value = true
                    append(
                        ChatMessage(
                            text = VoiceText.interruptAck(effectiveLanguage(transcript)),
                            fromUser = false
                        )
                    )
                } else {
                    lastVoiceTranscript = decision.text
                    lastVoiceTranscriptAtMs = nowMs
                    if (_isLoading.value && !_isStreaming.value && !_isThinking.value) {
                        queuedVoiceTranscript = decision.text
                    } else {
                        send(decision.text)
                    }
                }
            }
            is VoiceDecision.Send -> {
                _voiceSessionActive.value = true
                lastVoiceTranscript = decision.text
                lastVoiceTranscriptAtMs = nowMs
                if (_isLoading.value && !_isStreaming.value && !_isThinking.value) {
                    queuedVoiceTranscript = decision.text
                } else {
                    send(decision.text)
                }
            }
        }
    }

    /** A voice transcript that arrived while a non-streaming save was
     *  running is sent now, not lost. */
    private fun drainQueuedVoiceTranscript() {
        queuedVoiceTranscript?.let { queued ->
            queuedVoiceTranscript = null
            send(queued)
        }
    }

    /** The user tapped the mic / Stop while the assistant was
     *  speaking: stop the speech (and any typing reply) now. The
     *  screen then starts listening for the new instruction. */
    fun interruptSpeaking() {
        viewModelScope.launch { _stopSpeakingEvents.emit(Unit) }
        stopGeneration()
        _voiceState.value = VoiceState.LISTENING
    }

    fun setVoiceState(state: VoiceState) {
        _voiceState.value = state
    }

    /** A voice session starts (mic tapped, permission granted) or
     *  ends (Stop / screen left). Ending a session always stops any
     *  speech and never leaves the mic listening. */
    fun setVoiceSessionActive(active: Boolean) {
        _voiceSessionActive.value = active
        if (!active) {
            viewModelScope.launch { _stopSpeakingEvents.emit(Unit) }
            _voiceState.value = VoiceState.IDLE
        }
    }

    fun stopVoiceSession() = setVoiceSessionActive(false)

    fun setVoiceResponsesEnabled(enabled: Boolean) {
        viewModelScope.launch { settings.setVoiceResponsesEnabled(enabled) }
        if (!enabled) viewModelScope.launch { _stopSpeakingEvents.emit(Unit) }
    }

    fun setSpeechRate(rate: Float) {
        viewModelScope.launch { settings.setVoiceSpeechRate(rate) }
    }

    fun setSpeechPitch(pitch: Float) {
        viewModelScope.launch { settings.setVoiceSpeechPitch(pitch) }
    }

    fun setContinuousMode(enabled: Boolean) {
        viewModelScope.launch { settings.setVoiceContinuousMode(enabled) }
    }

    /**
     * UPDATE 17 — stream one assistant reply into the chat.
     *
     * Creates an empty bot message ([ChatMessage.streaming] = true),
     * shows the thinking indicator until the first displayable text
     * arrives, then reveals the reply through the [Typewriter] at a
     * controlled pace. The timestamp is stamped only when the reply
     * completes, and history is persisted once at the end — never
     * once per word.
     *
     * [cloudFlow] is a real backend SSE stream when the owner
     * configured cloud AI; [localText] is the on-device reply.
     * Cloud chunks are FED to the typewriter as they arrive (the
     * typewriter buffers them, so a fast backend never dumps the
     * whole reply at once). If the cloud stream fails after starting,
     * the text shown so far is kept and the failure is reported
     * plainly with Retry offered; if it fails before any text, the
     * local reply is shown instead. When there is no cloud at all,
     * the local text is typed out — local engine: typewriter display
     * over locally generated text, no network stream.
     *
     * Returns true when a complete reply was delivered.
     */
    private suspend fun streamReply(
        localText: String?,
        cloudFlow: kotlinx.coroutines.flow.Flow<String>? = null,
        note: String? = null,
        isAiSummary: Boolean = false,
        checklist: List<String> = emptyList(),
        table: List<Triple<String, String, String>> = emptyList(),
        tableHeaders: Triple<String, String, String>? = null,
        deepLinkRoute: String? = null,
        deepLinkLabel: String? = null
    ): Boolean {
        val messageId = System.nanoTime()
        val writer = Typewriter()
        typewriter = writer
        streamingMessageId = messageId
        _isThinking.value = true
        _isStreaming.value = false
        _generationState.value = GenerationState.THINKING
        append(
            ChatMessage(
                id = messageId,
                text = "",
                fromUser = false,
                isAiSummary = isAiSummary,
                note = note,
                checklist = checklist,
                table = table,
                tableHeaders = tableHeaders,
                deepLinkRoute = deepLinkRoute,
                deepLinkLabel = deepLinkLabel,
                streaming = true
            ),
            persistNow = false
        )
        // Keep the message text in step with the typewriter, without
        // persisting every word.
        val displayJob = viewModelScope.launch {
            writer.displayText.collect { shown ->
                if (shown.isNotEmpty() && _isThinking.value) {
                    _isThinking.value = false
                    _isStreaming.value = true
                    _generationState.value = GenerationState.STREAMING
                }
                val current = _messages.value.firstOrNull { it.id == messageId } ?: return@collect
                if (current.text != shown) {
                    replaceMessage(messageId, current.copy(text = shown), persistNow = false)
                }
            }
        }
        return try {
            val typeJob = writer.start(viewModelScope)
            var cloudFailed = false
            if (cloudFlow != null) {
                try {
                    cloudFlow.collect { chunk -> writer.feed(chunk) }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    cloudFailed = true
                }
                if (cloudFailed && writer.fedText.isEmpty() && localText != null) {
                    writer.feed(localText)
                }
            } else if (localText != null) {
                writer.feed(localText)
            }
            writer.markFinished()
            // A short local reply must not be delayed: if the
            // typewriter has nothing queued and nothing shown, there
            // is nothing to type — finish at once.
            if (writer.fedText.isEmpty()) {
                writer.flush()
            } else {
                writer.awaitCompletion()
            }
            typeJob.join()
            displayJob.cancel()
            val finalText = writer.currentText
            if (finalText.isEmpty()) {
                // Nothing arrived at all (cloud failed, no local text).
                _messages.value = _messages.value.filter { it.id != messageId }
                markGenerationFailed()
                append(
                    ChatMessage(
                        text = "AI se jawab nahi mila — internet ya AI key check karke Retry dabayein. Koi entry save nahi hui hai.",
                        fromUser = false, isError = true, generationFailed = true
                    )
                )
                false
            } else {
                streamingMessageId = null
                _isThinking.value = false
                _isStreaming.value = false
                _generationState.value = GenerationState.COMPLETED
                replaceMessage(
                    messageId,
                    _messages.value.first { it.id == messageId }.copy(
                        text = finalText,
                        streaming = false,
                        timestampMs = System.currentTimeMillis()
                    ),
                    persistNow = true
                )
                true
            }
        } catch (e: CancellationException) {
            displayJob.cancel()
            // Keep the shown text: stop() already dropped the queue.
            val shown = writer.currentText
            streamingMessageId = null
            _isThinking.value = false
            _isStreaming.value = false
            _generationState.value = GenerationState.STOPPED
            val current = _messages.value.firstOrNull { it.id == messageId }
            if (current != null) {
                replaceMessage(
                    messageId,
                    current.copy(text = shown, streaming = false, streamingStopped = true, timestampMs = System.currentTimeMillis()),
                    persistNow = true
                )
            }
            throw e
        } catch (_: Exception) {
            displayJob.cancel()
            val shown = writer.currentText
            streamingMessageId = null
            _isThinking.value = false
            _isStreaming.value = false
            if (shown.isEmpty()) {
                _messages.value = _messages.value.filter { it.id != messageId }
                markGenerationFailed()
            } else {
                replaceMessage(
                    messageId,
                    _messages.value.first { it.id == messageId }.copy(
                        text = shown, streaming = false, streamingStopped = true,
                        timestampMs = System.currentTimeMillis()
                    ),
                    persistNow = true
                )
            }
            false
        }
    }

    private suspend fun handleMessage(text: String) {
        val snap = _knowledge.value
        val agents = snap.agents.map { it.name }
        val customers = snap.customers.map { it.name }.distinct()
        // UPDATE 13: track the language of this message (detected, or the
        // manual preference) — replies and voice input follow it, and a
        // mid-conversation switch is picked up on the next message.
        val lang = effectiveLanguage(text)
        context = context.copy(lastLanguage = lang)
        if (_aiLanguagePref.value == "AUTO") _voiceLanguageTag.value = lang.bcp47

        // UPDATE 14/15/16 — remember what this message means BEFORE
        // parsing: CSC centre, last topic, last plan ("kal PAN Card
        // banane hai" → the next "uski checklist banao" resolves).
        // Memory never overrides the ledgers.
        val meaning = ConversationEngine.understand(text, context, lang)
        context = ConversationMemory.updateContext(context, text, meaning)

        // --- 1. A pending financial action: Haan / Nahi / follow-up amount.
        pendingAction?.let { pending ->
            val norm = AiAssistantParser.normalise(text)
            if (AiAssistantParser.isAffirmative(norm)) {
                confirmPendingFromChat()
                return
            }
            if (AiAssistantParser.isNegative(norm)) {
                pendingAction = null
                _pendingPreviewId.value = null
                append(ChatMessage(text = MultilingualReplies.get(lang, "cancelled"), fromUser = false))
                return
            }
            // "Aur 200 UPI bhi add kar do" — append to the pending entries.
            val followUp = AiAssistantParser.parseFollowUpAmount(text, context)
            if (followUp != null && pending.action is AiAssistantParser.AiAction.DailyEntries) {
                val merged = (pending.action as AiAssistantParser.AiAction.DailyEntries)
                    .copy(entries = (pending.action as AiAssistantParser.AiAction.DailyEntries).entries + followUp.entries)
                val newKey = keyFor(merged)
                pendingAction = pending.copy(action = merged, key = newKey)
                replaceMessage(
                    pending.previewMessageId,
                    ChatMessage(
                        id = pending.previewMessageId,
                        text = AiAssistantParser.previewDaily(merged.entries, lang),
                        fromUser = false,
                        preview = previewFor(merged),
                        note = "Confirm karein to save karunga — abhi kuch save nahi hua hai."
                    )
                )
                return
            }
            // A different message — drop the old pending action explicitly.
            pendingAction = null
            _pendingPreviewId.value = null
            append(ChatMessage(text = "Pehli entry ko maine cancel kar diya hai (save nahi hui thi). Ab naye message par kaam karta hoon.", fromUser = false))
        }

        // --- 2. Awaiting a clarification answer.
        clarification?.let { clar ->
            if (tryCompleteClarification(text, clar)) return
            // Not an answer to the question — treat as a fresh message.
            clarification = null
        }

        // --- 3. Navigation: "Cash Book kholo" etc. (UPDATE 11 §9).
        AiNavigation.routeFor(text)?.let { (route, label) ->
            append(
                ChatMessage(
                    text = "$label khol raha hoon.",
                    fromUser = false,
                    deepLinkRoute = route, deepLinkLabel = "$label kholo"
                )
            )
            _navigationEvents.emit(route)
            return
        }

        // --- 4. Parse the message.
        val result = AiAssistantParser.parse(text, context, agents, customers)
        when (result) {
            is AiAssistantParser.AiParseResult.Conversational -> handleConversational(result, text, lang)
            is AiAssistantParser.AiParseResult.Action -> showPreview(result.action, result.preview)
            is AiAssistantParser.AiParseResult.Clarify -> {
                if (result.missing == listOf("exact entry")) {
                    resolveCorrection(text)
                } else {
                    clarification = ClarificationState(text, result.partial, result.missing)
                    append(ChatMessage(text = result.question, fromUser = false))
                }
            }
            is AiAssistantParser.AiParseResult.Help -> {
                val topic = AppHelpKnowledge.topicFor(result.topic)
                val answer = AppHelpKnowledge.answer(topic)
                append(
                    ChatMessage(
                        text = answer.text, fromUser = false,
                        deepLinkRoute = answer.deepLinkRoute, deepLinkLabel = answer.deepLinkLabel
                    )
                )
            }
            is AiAssistantParser.AiParseResult.Factual -> answerQuestion(text)
            is AiAssistantParser.AiParseResult.Unknown -> {
                // Last chance for the built-in parser: cloud structured parse.
                val cloudParsed = tryCloudParse(text)
                if (cloudParsed != null) {
                    when (cloudParsed) {
                        is AiAssistantParser.AiParseResult.Action -> showPreview(cloudParsed.action, cloudParsed.preview)
                        is AiAssistantParser.AiParseResult.Clarify -> {
                            clarification = ClarificationState(text, cloudParsed.partial, cloudParsed.missing)
                            append(ChatMessage(text = cloudParsed.question, fromUser = false))
                        }
                        else -> answerQuestion(text)
                    }
                } else {
                    answerQuestion(text)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Conversational replies (UPDATE 14/15/16) — the cloud AI is the
    // MAIN engine for casual / general messages when a service is
    // configured; the local composer is the engine otherwise. A plan /
    // statement is never answered with a money question, and a message
    // the local engine cannot genuinely answer gets an honest plain-
    // language limitation — never a forced business question.
    // ------------------------------------------------------------------
    private suspend fun handleConversational(
        result: AiAssistantParser.AiParseResult.Conversational,
        userText: String,
        lang: AiLanguage
    ) {
        val key = settings.aiKey.first()
        val localText = withRealPlanData(result.text, result.intent)
        if (result.needsCloud && key.isBlank()) {
            // No usable cloud reply and the local engine could not
            // genuinely answer: say so honestly, in the user language.
            val limitation = if (MeaningParser.isLiveInfo(AiAssistantParser.normalise(userText), userText.lowercase())) {
                ConversationEngine.liveInfoLimitation(lang)
            } else {
                ConversationEngine.honestLimitation(lang)
            }
            streamReply(localText = limitation)
            return
        }
        // UPDATE 17 — cloud reply streams over real SSE when a key is
        // configured; otherwise the local reply is typed out by the
        // typewriter (local engine, no network stream). If the cloud
        // stream fails before any text, the local reply is shown.
        val cloudFlow = if (key.isNotBlank()) cloudConverseFlow(userText) else null
        val delivered = streamReply(
            localText = localText,
            cloudFlow = cloudFlow,
            isAiSummary = cloudFlow != null,
            note = if (cloudFlow != null) "AI jawab" else null,
            checklist = result.checklist,
            deepLinkRoute = result.deepLinkRoute,
            deepLinkLabel = result.deepLinkLabel
        )
        if (!delivered && cloudFlow == null && result.needsCloud) {
            val limitation = ConversationEngine.honestLimitation(lang)
            streamReply(localText = limitation)
        }
    }

    /** The cloud conversational reply as a REAL streaming Flow
     *  (UPDATE 17): chunks arrive over SSE and are fed to the
     *  typewriter as they arrive. Null when no key is configured. */
    private suspend fun cloudConverseFlow(userText: String): kotlinx.coroutines.flow.Flow<String>? {
        val key = settings.aiKey.first()
        if (key.isBlank()) return null
        val history = _messages.value.takeLast(10).joinToString("\n") { message ->
            (if (message.fromUser) "User: " else "Assistant: ") + message.text
        }
        val contextText = "The user runs a CSC centre (Xerox, Printing, PAN Card, Aadhaar, Voter ID, Ayushman Card, Money Transfer, Passport Photo, Scanning). " +
            "Reply in the same language and style as the user's latest message.\n\n" +
            snapshotFacts(_snapshot.value) + "\nConversation so far:\n$history"
        return CloudAiClient(key).converseStreaming(userText, contextText)
    }

    /** Cloud conversational reply: the prompt carries the user's
     *  language + style, the recent conversation, the business context
     *  and the real ledger facts. Returns null on any failure. */
    private suspend fun tryCloudConverse(userText: String): String? {
        val key = settings.aiKey.first()
        if (key.isBlank()) return null
        val history = _messages.value.takeLast(10).joinToString("\n") { message ->
            (if (message.fromUser) "User: " else "Assistant: ") + message.text
        }
        val contextText = "The user runs a CSC centre (Xerox, Printing, PAN Card, Aadhaar, Voter ID, Ayushman Card, Money Transfer, Passport Photo, Scanning). " +
            "Reply in the same language and style as the user's latest message.\n\n" +
            snapshotFacts(_snapshot.value) + "\nConversation so far:\n$history"
        return CloudAiClient(key).converse(userText, contextText)
    }

    /** Append REAL pending-jobs data to tomorrow-plan / checklist
     *  replies (UPDATE 15/16) — the plan is built from the ledgers,
     *  never invented. */
    private fun withRealPlanData(text: String, intent: String): String = when (intent) {
        "tomorrow_plan" -> text + "\n\n" + BusinessKnowledge.tomorrowPlan(_knowledge.value, today)
        "checklist" -> {
            val pending = pendingJobsChecklist()
            if (pending.isNotEmpty()) text + "\n\nKal ke pending kaam se:\n" + pending.joinToString("\n") { "• $it" }
            else text
        }
        else -> text
    }

    private fun pendingJobsChecklist(): List<String> {
        val snap = _knowledge.value
        return snap.jobs.filter {
            it.status == JobStatus.NEW || it.status == JobStatus.IN_PROGRESS ||
                it.status == JobStatus.SUBMITTED || it.status == JobStatus.PENDING
        }.take(8).map { job ->
            val customer = snap.customers.firstOrNull { it.id == job.customerId }?.name ?: "Customer"
            "${job.service.label} — $customer (${job.status})"
        }
    }

    // ------------------------------------------------------------------
    // Questions (UPDATE 10): knowledge engine → cloud summary → built-in.
    // ------------------------------------------------------------------
    private suspend fun answerQuestion(text: String) {
        val snap = _knowledge.value
        val knowledgeAnswer = BusinessKnowledge.answer(text, snap, today, lastKnowledge)
        if (knowledgeAnswer != null) {
            knowledgeAnswer.followUp?.let { ctx ->
                context = ctx.copy(dayEpoch = context.dayEpoch)
                lastKnowledge = LastKnowledge(
                    service = ctx.lastKnowledgeService ?: ctx.lastService,
                    serviceLabel = ctx.lastServiceLabel,
                    period = ctx.lastKnowledgePeriod,
                    kind = ctx.lastKnowledgeKind,
                    customerName = ctx.lastCustomerName,
                    agentName = ctx.lastAgentName
                )
            }
            // UPDATE 17 — knowledge answers are computed locally, so
            // they are typed out by the typewriter (local engine, no
            // network stream). Facts still come from the ledgers.
            streamReply(
                localText = ConversationMemory.enrichBusinessAnswer(
                    knowledgeAnswer.text, context, lastKnowledge?.kind, effectiveLanguage(text)
                ),
                table = knowledgeAnswer.table, tableHeaders = knowledgeAnswer.tableHeaders,
                deepLinkRoute = knowledgeAnswer.deepLinkRoute,
                deepLinkLabel = knowledgeAnswer.deepLinkLabel,
                note = if (knowledgeAnswer.hasEstimate) "Upar FACTS aapke real record se hain; SUGGESTION sirf salah hai, fact nahi." else null
            )
            return
        }
        val builtIn = BuiltInChatbotResponder.answer(text, _snapshot.value)
        val key = settings.aiKey.first()
        if (key.isBlank()) {
            streamReply(
                localText = builtIn,
                note = "Built-in jawab — aapke real record se. AI summary ke liye Settings me AI key add karein."
            )
        } else {
            // UPDATE 17 — the cloud summary streams over real SSE
            // when configured; on stream failure the built-in reply
            // is typed out instead (never a fake instant answer).
            val history = _messages.value.takeLast(10).joinToString("\n") { message ->
                (if (message.fromUser) "User: " else "Assistant: ") + message.text
            }
            val cloudFlow = CloudAiClient(key).converseStreaming(
                text,
                snapshotFacts(_snapshot.value) + "\nConversation so far:\n$history"
            )
            val delivered = streamReply(
                localText = builtIn,
                cloudFlow = cloudFlow,
                isAiSummary = true,
                note = "AI summary — figures aapke real record se hain."
            )
            if (!delivered) {
                streamReply(
                    localText = builtIn,
                    note = "AI abhi available nahi hai, isliye built-in jawab dikhaya gaya hai."
                )
            }
        }
    }

    /** Cloud structured parse (only when the built-in parser gives up and
     *  a key is set). The JSON is validated field by field; an invented
     *  amount/mode/name is never trusted — empty/0 means "ask the user". */
    private suspend fun tryCloudParse(text: String): AiAssistantParser.AiParseResult? {
        val key = settings.aiKey.first()
        if (key.isBlank()) return null
        val json = CloudAiClient(key).parseAction(text, snapshotFacts(_snapshot.value)) ?: return null
        val kind = Regex("\"kind\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1) ?: return null
        val serviceLabel = Regex("\"service\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1).orEmpty()
        val amount = Regex("\"amount_rupees\"\\s*:\\s*(\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val modeText = Regex("\"mode\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1).orEmpty()
        val name = Regex("\"name\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1).orEmpty()
        val service = ServiceType.values().firstOrNull { it.label.equals(serviceLabel, ignoreCase = true) }
        val mode = when (modeText.lowercase()) {
            "cash" -> PaymentMode.CASH
            "upi" -> PaymentMode.UPI
            else -> null
        }
        if (kind == "question" || kind == "help" || kind == "unknown") return null
        if (amount <= 0) {
            return AiAssistantParser.AiParseResult.Clarify(
                "Kitne rupaye? Amount batayein — main amount guess nahi karunga.",
                missing = listOf("amount")
            )
        }
        if (service == null && kind == "daily_income") {
            return AiAssistantParser.AiParseResult.Clarify(
                "Kaunsi service ki ${formatPaise(AiAssistantParser.rupeesToPaise(amount))} ki entry hai?",
                missing = listOf("service")
            )
        }
        if (mode == null) {
            return AiAssistantParser.AiParseResult.Clarify(
                "${formatPaise(AiAssistantParser.rupeesToPaise(amount))} — Cash mein ya UPI mein?",
                missing = listOf("payment mode")
            )
        }
        return when (kind) {
            "daily_income" -> {
                val entry = AiAssistantParser.AiDailyEntry(
                    service!!, service.label, AiAssistantParser.rupeesToPaise(amount), mode, "AI entry: ${service.label}"
                )
                val action = AiAssistantParser.AiAction.DailyEntries(listOf(entry), today)
                AiAssistantParser.AiParseResult.Action(action, AiAssistantParser.previewDaily(listOf(entry)))
            }
            "expense" -> {
                val (category, svc) = AiAssistantParser.detectExpenseCategory(text.lowercase())
                val draft = AiAssistantParser.AiExpenseDraft(category, AiAssistantParser.rupeesToPaise(amount), mode, svc, "AI expense: $category")
                AiAssistantParser.AiParseResult.Action(
                    AiAssistantParser.AiAction.Expense(draft, today),
                    "Kharcha: $category — ${formatPaise(AiAssistantParser.rupeesToPaise(amount))} (${mode.name})."
                )
            }
            "agent_payment" -> {
                if (name.isBlank()) {
                    AiAssistantParser.AiParseResult.Clarify("Kis agent ko ${formatPaise(AiAssistantParser.rupeesToPaise(amount))} diye?", missing = listOf("agent"))
                } else {
                    AiAssistantParser.AiParseResult.Action(
                        AiAssistantParser.AiAction.AgentPayment(name, null, AiAssistantParser.rupeesToPaise(amount), mode, today),
                        "Agent payment: $name ko ${formatPaise(AiAssistantParser.rupeesToPaise(amount))} (${mode.name})."
                    )
                }
            }
            "internal_transfer" -> {
                val from = if (text.lowercase().contains("cash")) PaymentMode.CASH else PaymentMode.UPI
                AiAssistantParser.AiParseResult.Action(
                    AiAssistantParser.AiAction.InternalTransfer(AiAssistantParser.rupeesToPaise(amount), from, today),
                    "Internal transfer: ${formatPaise(AiAssistantParser.rupeesToPaise(amount))} ${from.name} → ${if (from == PaymentMode.CASH) "UPI" else "Cash"}."
                )
            }
            else -> null
        }
    }

    // ------------------------------------------------------------------
    // Preview / confirm / cancel (steps 8–12).
    // ------------------------------------------------------------------
    private suspend fun showPreview(action: AiAssistantParser.AiAction, previewText: String) {
        val resolved = resolveAction(action)
        if (resolved == null) return // resolveAction already asked a clarification
        val duplicateWarning = when (resolved) {
            is AiAssistantParser.AiAction.DailyEntries ->
                resolved.entries.any { entry ->
                    repository.possibleDuplicateDailyEntry(profileId, entry, resolved.dayEpoch)
                }
            else -> false
        }
        val key = keyFor(resolved)
        val preview = previewFor(resolved, duplicateWarning)
        val message = ChatMessage(
            text = previewText, fromUser = false,
            preview = preview,
            note = "Confirm karein to save karunga — abhi kuch save nahi hua hai." +
                if (duplicateWarning) " Aaj ye entry pehle se hai — phir bhi save karu?" else ""
        )
        pendingAction = PendingAction(resolved, key, message.id)
        _pendingPreviewId.value = message.id
        append(message)
    }

    /** Resolve names to ids (agent/customer) against THIS profile only.
     *  Returns null when resolution fails — after asking a clarification. */
    private suspend fun resolveAction(action: AiAssistantParser.AiAction): AiAssistantParser.AiAction? {
        return when (action) {
            is AiAssistantParser.AiAction.AgentPayment -> {
                val agent = repository.findAgentByName(profileId, action.agentName)
                if (agent == null) {
                    clarification = ClarificationState(
                        "", null, listOf("agent")
                    )
                    append(
                        ChatMessage(
                            text = "Agent \"${action.agentName}\" nahi mila. Agents me ye hain: " +
                                _knowledge.value.agents.joinToString(", ") { it.name } +
                                ". Kis agent ko payment deni hai?",
                            fromUser = false
                        )
                    )
                    null
                } else {
                    action.copy(agentId = agent.id)
                }
            }
            is AiAssistantParser.AiAction.CustomerPayment -> {
                val customer = repository.findCustomerByName(profileId, action.customerName)
                if (customer == null) {
                    append(ChatMessage(text = "Customer \"${action.customerName}\" nahi mila.", fromUser = false))
                    null
                } else {
                    action
                }
            }
            else -> action
        }
    }

    private fun keyFor(action: AiAssistantParser.AiAction): String {
        val canonical = when (action) {
            is AiAssistantParser.AiAction.DailyEntries ->
                AiAssistantParser.canonicalDaily(action.entries) + "|${action.dayEpoch}"
            is AiAssistantParser.AiAction.Expense ->
                "expense:${action.draft.category}:${action.draft.amountPaise}:${action.draft.mode}|${action.dayEpoch}"
            is AiAssistantParser.AiAction.AgentPayment ->
                "agent:${action.agentName}:${action.amountPaise}:${action.mode}|${action.dayEpoch}"
            is AiAssistantParser.AiAction.MoneyTransfer ->
                "mt:${action.principalPaise}:${action.commissionPaise}:${action.mode}|${action.dayEpoch}"
            is AiAssistantParser.AiAction.InternalTransfer ->
                "internal:${action.amountPaise}:${action.from}|${action.dayEpoch}"
            is AiAssistantParser.AiAction.CustomerPayment ->
                "custpay:${action.customerName}:${action.amountPaise}:${action.mode}|${action.dayEpoch}"
            is AiAssistantParser.AiAction.RecordCustomerDue ->
                "due:${action.customerName}:${action.amountPaise}:${action.service}"
            is AiAssistantParser.AiAction.DeleteTransaction ->
                "delete:${action.transactionId}"
            is AiAssistantParser.AiAction.CorrectTransaction ->
                "correct:${action.transactionId}:${action.newAmountPaise}"
            is AiAssistantParser.AiAction.AddCustomer ->
                "addcust:${action.name}:${action.service}"
        }
        val day = when (action) {
            is AiAssistantParser.AiAction.DailyEntries -> action.dayEpoch
            is AiAssistantParser.AiAction.Expense -> action.dayEpoch
            is AiAssistantParser.AiAction.AgentPayment -> action.dayEpoch
            is AiAssistantParser.AiAction.MoneyTransfer -> action.dayEpoch
            is AiAssistantParser.AiAction.InternalTransfer -> action.dayEpoch
            is AiAssistantParser.AiAction.CustomerPayment -> action.dayEpoch
            else -> today
        }
        return AiAssistantParser.idempotencyKey(profileId, day, canonical)
    }

    private fun previewFor(
        action: AiAssistantParser.AiAction,
        duplicateWarning: Boolean = false
    ): AiPreview = when (action) {
        is AiAssistantParser.AiAction.DailyEntries -> AiPreview(
            kind = "Daily Entries",
            lines = action.entries.map { AiPreviewLine(it.serviceLabel, it.amountPaise, it.mode) },
            totalPaise = action.entries.sumOf { it.amountPaise },
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.Expense -> AiPreview(
            kind = "Expense",
            lines = listOf(AiPreviewLine(action.draft.category, action.draft.amountPaise, action.draft.mode)),
            totalPaise = action.draft.amountPaise,
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.AgentPayment -> AiPreview(
            kind = "Agent Payment",
            lines = listOf(AiPreviewLine("Agent: ${action.agentName}", action.amountPaise, action.mode)),
            totalPaise = action.amountPaise,
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.MoneyTransfer -> AiPreview(
            kind = "Money Transfer",
            lines = listOf(
                AiPreviewLine("Principal (profit NAHI)", action.principalPaise, action.mode),
                AiPreviewLine("Commission (profit)", action.commissionPaise, action.mode)
            ),
            totalPaise = action.commissionPaise,
            note = "Sirf commission profit hai — principal nahi.",
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.InternalTransfer -> AiPreview(
            kind = "Internal Transfer",
            lines = listOf(AiPreviewLine("${action.from.name} → ${if (action.from == PaymentMode.CASH) "UPI" else "Cash"}", action.amountPaise, action.from)),
            totalPaise = action.amountPaise,
            note = "Ye income ya kharcha nahi hai.",
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.CustomerPayment -> AiPreview(
            kind = "Customer Payment",
            lines = listOf(AiPreviewLine("Customer: ${action.customerName}", action.amountPaise, action.mode)),
            totalPaise = action.amountPaise,
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.RecordCustomerDue -> AiPreview(
            kind = "Customer Due (income NAHI)",
            lines = listOf(AiPreviewLine("${action.customerName} — ${action.service?.label}", action.amountPaise, null)),
            totalPaise = action.amountPaise,
            editable = false,
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.DeleteTransaction -> AiPreview(
            kind = "Delete Entry",
            lines = listOf(AiPreviewLine(action.label, 0, null)),
            totalPaise = 0,
            editable = false,
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.CorrectTransaction -> AiPreview(
            kind = "Correct Entry",
            lines = listOf(AiPreviewLine(action.label, action.newAmountPaise, null)),
            totalPaise = action.newAmountPaise,
            editable = false,
            duplicateWarning = duplicateWarning
        )
        is AiAssistantParser.AiAction.AddCustomer -> AiPreview(
            kind = "Add Customer",
            lines = listOf(AiPreviewLine("${action.name} (${action.service.label})", 0, null)),
            totalPaise = 0,
            editable = false,
            duplicateWarning = duplicateWarning
        )
    }

    /** Confirm & Save — executes through the repository and reports ONLY
     *  what the backend confirms (step 11–12). Never retried
     *  automatically: a retry would re-check the same idempotency key
     *  and return Duplicate instead of writing twice. */
    fun confirmPending(editedLines: List<AiPreviewLine>? = null) {
        val pending = pendingAction ?: return
        if (_isLoading.value) return
        pendingAction = null
        _pendingPreviewId.value = null
        _isLoading.value = true
        viewModelScope.launch {
            try {
                executePending(pending, editedLines)
            } finally {
                _isLoading.value = false
                drainQueuedVoiceTranscript()
            }
        }
    }

    /**
     * Confirm from inside handleMessage ("Haan" typed or spoken).
     * BUG FIX (UPDATE 18): the public confirmPending() refuses while
     * _isLoading is true — but handleMessage itself runs inside a
     * generation with _isLoading true, so a spoken/typed "Haan" was
     * silently dropped and the preview never saved. This path
     * executes the same backend-verified save without touching the
     * generation's loading flag (the generation's own finally clears
     * it). The idempotency key still guarantees one write: a second
     * "Haan" finds no pending action and returns Duplicate / nothing.
     */
    private fun confirmPendingFromChat() {
        val pending = pendingAction ?: return
        pendingAction = null
        _pendingPreviewId.value = null
        viewModelScope.launch { executePending(pending, null) }
    }

    /** The backend-verified save itself (steps 10–12), shared by the
     *  Confirm button and by a spoken/typed "Haan". */
    private suspend fun executePending(pending: PendingAction, editedLines: List<AiPreviewLine>?) {
        try {
            val action = editedLines?.let { rebuildWithEdits(pending.action, it) } ?: pending.action
            val key = if (editedLines != null) keyFor(action) else pending.key
            val result = repository.executeAiAction(profileId, action, key)
            when (result) {
                is BusinessRepository.AiExecuteResult.Saved -> {
                    updateContextFrom(action)
                    append(ChatMessage(text = "✓ ${result.message}", fromUser = false))
                }
                is BusinessRepository.AiExecuteResult.Duplicate -> {
                    append(ChatMessage(text = result.message, fromUser = false))
                }
                is BusinessRepository.AiExecuteResult.Failed -> {
                    append(ChatMessage(text = result.message, fromUser = false, isError = true))
                }
            }
        } catch (_: Exception) {
            append(
                ChatMessage(
                    text = "Save nahi ho paya — phir se try karein. Kuch bhi galat save nahi hua hai.",
                    fromUser = false, isError = true
                )
            )
        }
    }

    fun cancelPending() {
        if (pendingAction == null) return
        pendingAction = null
        _pendingPreviewId.value = null
        append(ChatMessage(text = "Theek hai — entry save nahi ki gayi. Kuch bhi change nahi hua hai.", fromUser = false))
    }

    /** Apply the user's edits from the preview card to the action. */
    private fun rebuildWithEdits(
        action: AiAssistantParser.AiAction,
        lines: List<AiPreviewLine>
    ): AiAssistantParser.AiAction {
        return when (action) {
            is AiAssistantParser.AiAction.DailyEntries -> {
                val entries = action.entries.mapIndexed { i, e ->
                    val line = lines.getOrNull(i) ?: return@mapIndexed e
                    e.copy(amountPaise = line.amountPaise, mode = line.mode ?: e.mode)
                }
                action.copy(entries = entries)
            }
            is AiAssistantParser.AiAction.Expense -> {
                val line = lines.firstOrNull() ?: return action
                action.copy(draft = action.draft.copy(amountPaise = line.amountPaise, mode = line.mode ?: action.draft.mode))
            }
            is AiAssistantParser.AiAction.AgentPayment -> {
                val line = lines.firstOrNull() ?: return action
                action.copy(amountPaise = line.amountPaise, mode = line.mode ?: action.mode)
            }
            is AiAssistantParser.AiAction.MoneyTransfer -> {
                val principal = lines.getOrNull(0)?.amountPaise ?: action.principalPaise
                val commission = lines.getOrNull(1)?.amountPaise ?: action.commissionPaise
                val mode = lines.firstOrNull()?.mode ?: action.mode
                action.copy(principalPaise = principal, commissionPaise = commission, mode = mode)
            }
            is AiAssistantParser.AiAction.InternalTransfer -> {
                val line = lines.firstOrNull() ?: return action
                action.copy(amountPaise = line.amountPaise)
            }
            is AiAssistantParser.AiAction.CustomerPayment -> {
                val line = lines.firstOrNull() ?: return action
                action.copy(amountPaise = line.amountPaise, mode = line.mode ?: action.mode)
            }
            else -> action
        }
    }

    private fun updateContextFrom(action: AiAssistantParser.AiAction) {
        context = when (action) {
            is AiAssistantParser.AiAction.DailyEntries -> {
                val last = action.entries.last()
                context.copy(lastService = last.service, lastServiceLabel = last.serviceLabel, lastMode = last.mode, dayEpoch = action.dayEpoch)
            }
            is AiAssistantParser.AiAction.Expense -> context.copy(lastMode = action.draft.mode ?: context.lastMode, dayEpoch = action.dayEpoch)
            is AiAssistantParser.AiAction.AgentPayment -> context.copy(lastAgentName = action.agentName, lastMode = action.mode ?: context.lastMode, dayEpoch = action.dayEpoch)
            is AiAssistantParser.AiAction.MoneyTransfer -> context.copy(lastService = ServiceType.MONEY_TRANSFER, lastServiceLabel = "Money Transfer", lastMode = action.mode ?: context.lastMode, dayEpoch = action.dayEpoch)
            is AiAssistantParser.AiAction.CustomerPayment -> context.copy(lastCustomerName = action.customerName, lastMode = action.mode ?: context.lastMode, dayEpoch = action.dayEpoch)
            else -> context
        }
    }

    // ------------------------------------------------------------------
    // Clarifications — complete a partial action from the user answer.
    // ------------------------------------------------------------------
    private suspend fun tryCompleteClarification(text: String, clar: ClarificationState): Boolean {
        val norm = AiAssistantParser.normalise(text)
        // "Sahi amount kitna hona chahiye?" — correct the stored candidate.
        if (clar.missing.contains("new amount") && clar.candidates.isNotEmpty()) {
            val newAmount = AiAssistantParser.mainAmount(norm)
            if (newAmount == null) {
                append(ChatMessage(text = "Sahi amount kitna hona chahiye? Misal: "350 karo".", fromUser = false))
                return true
            }
            val chosen = clar.candidates[0]
            clarification = null
            val action = AiAssistantParser.AiAction.CorrectTransaction(chosen.id, AiAssistantParser.rupeesToPaise(newAmount), chosen.label)
            showPreview(action, previewTextFor(action))
            return true
        }
        // Correction candidate picking: "pehli / dusri / 1 / 2".
        if (clar.candidates.isNotEmpty()) {
            val pick = when {
                norm.contains("pehli") || norm.trim() == "1" -> 0
                norm.contains("dusri") || norm.contains("doosri") || norm.trim() == "2" -> 1
                norm.contains("teesri") || norm.trim() == "3" -> 2
                else -> -1
            }
            if (pick in clar.candidates.indices) {
                val chosen = clar.candidates[pick]
                clarification = null
                val action = if (clar.isDelete) {
                    AiAssistantParser.AiAction.DeleteTransaction(chosen.id, chosen.label)
                } else {
                    val newAmount = AiAssistantParser.mainAmount(norm)
                    if (newAmount == null) {
                        clarification = clar
                        append(ChatMessage(text = "Sahi amount kitna hona chahiye? Misal: \"350 karo\".", fromUser = false))
                        return true
                    }
                    AiAssistantParser.AiAction.CorrectTransaction(chosen.id, AiAssistantParser.rupeesToPaise(newAmount), chosen.label)
                }
                showPreview(action, "Ye entry ${if (clar.isDelete) "delete" else "sahi"} karu?\n• ${chosen.label}")
                return true
            }
        }
        val partial = clar.partial ?: run {
            // "Kal" date question or a bare clarification — re-parse with context.
            if (clar.missing.contains("date")) {
                val day = when {
                    norm.contains("yesterday") || norm.contains("pichhla") || norm.contains("pichla") || norm.contains("kal ka") -> today - 1
                    norm.contains("today") || norm.contains("aaj") -> today
                    else -> null
                }
                if (day != null) {
                    clarification = null
                    context = context.copy(dayEpoch = day)
                    handleMessage(clar.originalText)
                    return true
                }
            }
            return false
        }
        val completed = completePartial(partial, norm, clar.missing)
        if (completed == null) return false
        clarification = null
        when (completed) {
            is AiAssistantParser.AiAction -> showPreview(completed, previewTextFor(completed))
            is String -> append(ChatMessage(text = completed, fromUser = false))
        }
        return true
    }

    /** Fill the missing field of a partial action from the answer.
     *  Returns the completed action, a follow-up question string, or
     *  null when the answer does not address the question at all. */
    private fun completePartial(
        partial: AiAssistantParser.AiAction,
        norm: String,
        missing: List<String>
    ): Any? {
        return when (partial) {
            is AiAssistantParser.AiAction.DailyEntries -> {
                if (missing.contains("payment mode")) {
                    val mode = AiAssistantParser.detectMode(norm) ?: return null
                    val entries = partial.entries.map { it.copy(mode = mode) }
                    AiAssistantParser.AiAction.DailyEntries(entries, partial.dayEpoch)
                } else if (missing.contains("service")) {
                    val service = AiAssistantParser.detectService(norm) ?: return null
                    val entries = partial.entries.map { it.copy(service = service, serviceLabel = service.label) }
                    AiAssistantParser.AiAction.DailyEntries(entries, partial.dayEpoch)
                } else null
            }
            is AiAssistantParser.AiAction.Expense -> {
                if (missing.contains("payment mode")) {
                    val mode = AiAssistantParser.detectMode(norm) ?: return null
                    partial.copy(draft = partial.draft.copy(mode = mode))
                } else null
            }
            is AiAssistantParser.AiAction.AgentPayment -> {
                if (missing.contains("payment mode")) {
                    val mode = AiAssistantParser.detectMode(norm) ?: return null
                    partial.copy(mode = mode)
                } else if (missing.contains("agent")) {
                    val name = norm.trim()
                    if (name.length < 2) return null
                    partial.copy(agentName = name)
                } else null
            }
            is AiAssistantParser.AiAction.MoneyTransfer -> {
                if (missing.contains("payment mode")) {
                    val mode = AiAssistantParser.detectMode(norm) ?: return null
                    partial.copy(mode = mode)
                } else if (missing.contains("commission")) {
                    val amount = AiAssistantParser.mainAmount(norm) ?: return null
                    partial.copy(commissionPaise = AiAssistantParser.rupeesToPaise(amount))
                } else null
            }
            is AiAssistantParser.AiAction.CustomerPayment -> {
                if (missing.contains("payment mode")) {
                    val mode = AiAssistantParser.detectMode(norm) ?: return null
                    partial.copy(mode = mode)
                } else null
            }
            is AiAssistantParser.AiAction.RecordCustomerDue -> {
                if (missing.contains("customer")) {
                    val name = norm.trim()
                    if (name.length < 2) return null
                    partial.copy(customerName = name)
                } else if (missing.contains("service")) {
                    val service = AiAssistantParser.detectService(norm) ?: return null
                    partial.copy(service = service)
                } else null
            }
            else -> null
        }
    }

    private fun previewTextFor(action: AiAssistantParser.AiAction): String = when (action) {
        is AiAssistantParser.AiAction.DailyEntries -> AiAssistantParser.previewDaily(action.entries)
        is AiAssistantParser.AiAction.Expense -> "Kharcha: ${action.draft.category} — ${formatPaise(action.draft.amountPaise)} (${action.draft.mode?.name})."
        is AiAssistantParser.AiAction.AgentPayment -> "Agent payment: ${action.agentName} ko ${formatPaise(action.amountPaise)} (${action.mode?.name})."
        is AiAssistantParser.AiAction.MoneyTransfer -> "Money Transfer: principal ${formatPaise(action.principalPaise)}, commission ${formatPaise(action.commissionPaise)}."
        is AiAssistantParser.AiAction.InternalTransfer -> "Internal transfer: ${formatPaise(action.amountPaise)} ${action.from.name} → ${if (action.from == PaymentMode.CASH) "UPI" else "Cash"}."
        is AiAssistantParser.AiAction.CustomerPayment -> "Customer payment: ${action.customerName} se ${formatPaise(action.amountPaise)} (${action.mode?.name})."
        is AiAssistantParser.AiAction.RecordCustomerDue -> "Customer due (income NAHI): ${action.customerName} — ${formatPaise(action.amountPaise)} baaki."
        is AiAssistantParser.AiAction.DeleteTransaction -> "Ye entry delete karu?\n• ${action.label}"
        is AiAssistantParser.AiAction.CorrectTransaction -> "Ye entry sahi karu?\n• ${action.label} → ${formatPaise(action.newAmountPaise)}"
        is AiAssistantParser.AiAction.AddCustomer -> "Naya customer: ${action.name} (${action.service.label})."
    }

    // ------------------------------------------------------------------
    // Correction / deletion — identify the EXACT record first.
    // ------------------------------------------------------------------
    private suspend fun resolveCorrection(text: String) {
        val norm = AiAssistantParser.normalise(text)
        val isDelete = norm.contains("delete") || norm.contains("hatao") || norm.contains("remove")
        val amounts = AiAssistantParser.findAmounts(norm)
        val service = AiAssistantParser.detectService(norm)
        // "300 wali entry ko 350 karo" → old 300, new 350.
        val (oldAmount, newAmount) = when {
            amounts.size >= 2 -> AiAssistantParser.rupeesToPaise(amounts[0]) to AiAssistantParser.rupeesToPaise(amounts[1])
            amounts.size == 1 -> AiAssistantParser.rupeesToPaise(amounts[0]) to null
            else -> null to null
        }
        val matches = repository.findTransactionsForCorrection(
            profileId, today, oldAmount, service?.label
        )
        when {
            matches.isEmpty() -> {
                append(
                    ChatMessage(
                        text = "Aaj ki ${oldAmount?.let { formatPaise(it) + " ki " } ?: ""}${service?.label ?: ""} entry mujhe nahi mili. " +
                            "Kya aap Cash Book / Daily Business se check karke exact amount batayenge?",
                        fromUser = false
                    )
                )
            }
            matches.size == 1 -> {
                val tx = matches[0]
                val label = "${tx.category} ${formatPaise(tx.amountPaise)} (${tx.mode.name}) — ${tx.description}"
                val action = if (isDelete) {
                    AiAssistantParser.AiAction.DeleteTransaction(tx.id, label)
                } else if (newAmount != null) {
                    AiAssistantParser.AiAction.CorrectTransaction(tx.id, newAmount, label)
                } else {
                    clarification = ClarificationState(
                        text, null, listOf("new amount"),
                        candidates = listOf(CandidateTx(tx.id, label, tx.amountPaise))
                    )
                    append(ChatMessage(text = "Mili: $label\nSahi amount kitna hona chahiye?", fromUser = false))
                    return
                }
                showPreview(action, previewTextFor(action))
            }
            else -> {
                val candidates = matches.map {
                    CandidateTx(it.id, "${it.category} ${formatPaise(it.amountPaise)} (${it.mode.name})", it.amountPaise)
                }
                clarification = ClarificationState(text, null, listOf("exact entry"), candidates = candidates, isDelete = isDelete)
                val list = candidates.mapIndexed { i, c -> "${i + 1}. ${c.label}" }.joinToString("\n")
                append(
                    ChatMessage(
                        text = "Aisi ${candidates.size} entries mili — kaunsi wali?\n$list\n\"Pehli\" / \"Dusri\" ya number likh dein.",
                        fromUser = false
                    )
                )
            }
        }
    }

    // --- Mapping helpers ----------------------------------------------------
    private fun StoredChatMessage.toChatMessage(): ChatMessage =
        ChatMessage(text = text, fromUser = fromUser, timestampMs = timestampMs, note = note, isError = isError)

    private fun ChatMessage.toStored(): StoredChatMessage =
        StoredChatMessage(text = text, fromUser = fromUser, timestampMs = timestampMs, note = note, isError = isError)

    private data class KnowledgeInputs(
        val txs: List<com.alfalah.business.data.entity.TransactionEntity>,
        val transfers: List<com.alfalah.business.data.entity.MoneyTransferEntity>,
        val jobs: List<com.alfalah.business.data.entity.ServiceJobEntity>,
        val customers: List<com.alfalah.business.data.entity.CustomerEntity>,
        val agents: List<com.alfalah.business.data.entity.AgentEntity>,
        val agentPayments: List<com.alfalah.business.data.entity.AgentPaymentEntity>,
        val expenses: List<com.alfalah.business.data.entity.ExpenseEntity>,
        val maintenance: List<com.alfalah.business.data.entity.MaintenanceEntity>,
        val equipment: List<com.alfalah.business.data.entity.EquipmentEntity>,
        val receipts: List<com.alfalah.business.data.entity.ReceiptEntity>,
        val funds: List<com.alfalah.business.data.entity.MoneyTransferFundEntity>,
        val customServices: Set<String>
    )
}
