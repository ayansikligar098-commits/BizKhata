package com.alfalah.business.ui.chatbot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AiFeatures
import com.alfalah.business.domain.AgentOwed
import com.alfalah.business.domain.BuiltInChatbotResponder
import com.alfalah.business.domain.BusinessSnapshot
import com.alfalah.business.domain.Debtor
import com.alfalah.business.domain.GeminiChatbotClient
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.ServiceIncome
import com.alfalah.business.domain.snapshotFacts
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset

/** One chat message. [note] is a small honest footnote, e.g. "AI summary"
 *  or "Gemini nahi mila, built-in jawab". */
data class ChatMessage(
    val text: String,
    val fromUser: Boolean,
    val isAiSummary: Boolean = false,
    val note: String? = null
)

/**
 * Chatbot ViewModel — the chatbot's brain.
 *
 *  - Keeps a live [BusinessSnapshot] from the real Room ledgers of the
 *    ACTIVE profile only (transactions, Money Transfer, jobs, customers,
 *    agents, MT fund). Recomputed whenever the ledgers change, so an
 *    answer never quotes stale figures.
 *  - [send]: appends the user's question, then answers. With a Gemini
 *    key in Settings, Gemini summarises the snapshot facts; without a
 *    key — or if Gemini fails — the built-in responder answers from the
 *    same snapshot and the message says so. No answer is ever invented:
 *    both paths quote only snapshot figures (paise as Long).
 *  - Money Transfer profit is commission only; customer due and agent
 *    payable come from their own ledgers (never netted, never mixed).
 */
class ChatbotViewModel(
    private val profileId: Long,
    private val repository: BusinessRepository,
    private val settings: SettingsStore
) : ViewModel() {

    private val _messages = MutableStateFlow(
        listOf(
            ChatMessage(
                text = "Namaste! Main BizKhata Assistant hoon. Aap apne dukaan ke hisab ke baare me pooch sakte hain — " +
                    "jaise \"Aaj ka profit kitna hai?\", \"Kaun paise dene wala hai?\", \"Agent ko kitna dena hai?\" " +
                    "ya \"Money Transfer commission kitna hai?\"",
                fromUser = false
            )
        )
    )
    val messages: StateFlow<List<ChatMessage>> = _messages

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _aiEnabled = MutableStateFlow(false)
    val aiEnabled: StateFlow<Boolean> = _aiEnabled

    private val _snapshot = MutableStateFlow(BusinessSnapshot())
    val snapshot: StateFlow<BusinessSnapshot> = _snapshot

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    init {
        viewModelScope.launch {
            combine(
                repository.observeTransactions(profileId),
                repository.observeMoneyTransfers(profileId),
                repository.observeAllJobs(profileId),
                repository.searchCustomers(profileId, ""),
                repository.observeAgents(profileId),
                repository.observeFunds(profileId)
            ) { txs, transfers, jobs, customers, agents, funds ->
                ChatbotInputs(txs, transfers, jobs, customers, agents, funds)
            }.collect { inputs ->
                val periodTxs = inputs.txs.filter { it.dateEpochDay == today && it.kind != "INTERNAL_TRANSFER" }
                val income = periodTxs.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
                val expenses = periodTxs.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }
                val mtToday = inputs.transfers.filter { it.dateEpochDay == today }
                val mtProfit = AccountingEngine.moneyTransferProfit(
                    commissionPaise = mtToday.sumOf { it.commissionPaise },
                    transferChargesPaise = mtToday.sumOf { it.chargesPaise },
                    moneyTransferExpensesPaise = 0
                )
                // Cash / UPI balances (all time), internal transfers netted.
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
                    val charges = repository.chargesForAgent(profileId, agent.id)
                    val paid = repository.paidToAgent(agent.id)
                    val payable = (charges - paid).coerceAtLeast(0)
                    if (payable > 0) AgentOwed(agent.name, payable) else null
                }.sortedByDescending { it.payablePaise }.take(5)

                _snapshot.value = BusinessSnapshot(
                    todayIncomePaise = income + mtToday.sumOf { it.commissionPaise },
                    todayExpensesPaise = expenses,
                    todayProfitPaise = AccountingEngine.netProfit(income, mtProfit, expenses),
                    cashBalancePaise = cashIn - cashOut - cashToUpi + upiToCash,
                    upiBalancePaise = upiIn - upiOut + cashToUpi - upiToCash,
                    customerDuePaise = repository.customerDue(profileId),
                    agentPayablePaise = repository.agentPayable(profileId),
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
        }
        viewModelScope.launch {
            settings.geminiApiKey.collect { key -> _aiEnabled.value = key.isNotBlank() }
        }
    }

    fun send(question: String) {
        val trimmed = question.trim()
        if (trimmed.isEmpty() || _isLoading.value) return
        _messages.value = _messages.value + ChatMessage(trimmed, fromUser = true)
        _isLoading.value = true
        viewModelScope.launch {
            val snap = _snapshot.value
            val builtIn = BuiltInChatbotResponder.answer(trimmed, snap)
            val key = settings.geminiApiKey.first()
            val reply: ChatMessage = if (key.isBlank()) {
                ChatMessage(
                    text = builtIn,
                    fromUser = false,
                    note = "AI summary off hai — Settings me apni free Gemini key add karein to AI jawab dega."
                )
            } else {
                when (val result = GeminiChatbotClient(key).ask(trimmed, snapshotFacts(snap))) {
                    is AiFeatures.AiResult.Answer -> ChatMessage(
                        text = result.text,
                        fromUser = false,
                        isAiSummary = true,
                        note = "Gemini AI summary — figures aapke real record se hain."
                    )
                    is AiFeatures.AiResult.NotAvailable -> ChatMessage(
                        text = builtIn,
                        fromUser = false,
                        note = "Gemini se jawab nahi mila, isliye built-in jawab dikhaya gaya hai."
                    )
                }
            }
            _messages.value = _messages.value + reply
            _isLoading.value = false
        }
    }

    private data class ChatbotInputs(
        val txs: List<com.alfalah.business.data.entity.TransactionEntity>,
        val transfers: List<com.alfalah.business.data.entity.MoneyTransferEntity>,
        val jobs: List<com.alfalah.business.data.entity.ServiceJobEntity>,
        val customers: List<com.alfalah.business.data.entity.CustomerEntity>,
        val agents: List<com.alfalah.business.data.entity.AgentEntity>,
        val funds: List<com.alfalah.business.data.entity.MoneyTransferFundEntity>
    )
}
