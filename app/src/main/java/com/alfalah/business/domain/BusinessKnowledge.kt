package com.alfalah.business.domain

import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.EquipmentEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.MaintenanceEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.entity.ReceiptEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.entity.TransactionEntity
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * BizKhata AI — complete business knowledge & question answering
 * (UPDATE 10 + UPDATE 11 §§7–8). PURE Kotlin (no Android, no Room) so
 * every answer rule is unit-testable (AiAssistantTest) and mirrored in
 * docs/ai_assistant_mirror.py.
 *
 * RETRIEVAL DISCIPLINE (UPDATE 10 §1): the assistant NEVER loads the
 * whole database into an AI context. The ViewModel observes the profile's
 * ledgers once (the same flows the Dashboard uses) and hands this file a
 * [KnowledgeSnapshot] for the ACTIVE profile only. Every function below
 * computes aggregates from that snapshot with [AccountingEngine] —
 * deterministic backend logic, never AI-generated arithmetic. A question
 * the snapshot cannot answer gets an honest "record nahi hai", never a
 * guessed figure. Facts, calculations, estimates and suggestions are
 * labelled as such (UPDATE 11 §8).
 *
 * Profile isolation: the snapshot is built for ONE profileId; nothing
 * in this file can see another profile's rows. Conversation memory
 * (last service / period / customer / agent) NEVER overrides the
 * snapshot — it only fills in what the user did not repeat (UPDATE 11 §10).
 */
enum class AiPeriod { TODAY, YESTERDAY, LAST_7_DAYS, THIS_MONTH, LAST_MONTH, LAST_3_MONTHS, THIS_YEAR, ALL_TIME }

data class PeriodRange(val label: String, val startDay: Long, val endDay: Long)

fun parsePeriod(text: String, today: Long): AiPeriod? {
    // UPDATE 13: normalise first — Gujarati "chhella 7 divas", Marathi
    // "gata mahina", Tamil "indha maasam" etc. canonicalise to the
    // Hinglish tokens matched below, so periods work in every language.
    val q = AiAssistantParser.normalise(text)
    return when {
        q.contains("last 3 month") || q.contains("pichhle 3 mahine") || q.contains("pichle 3 mahine") ||
            q.contains("last three month") -> AiPeriod.LAST_3_MONTHS
        q.contains("last 7 day") || q.contains("pichhle 7 din") || q.contains("pichle 7 din") ||
            q.contains("last seven day") || q.contains("hafta") -> AiPeriod.LAST_7_DAYS
        q.contains("last month") || q.contains("pichhle mahine") || q.contains("pichle mahine") ||
            q.contains("pichhla mahina") || q.contains("last mahina") -> AiPeriod.LAST_MONTH
        q.contains("this month") || q.contains("is month") || q.contains("is mahine") || q.contains("is mahina") -> AiPeriod.THIS_MONTH
        q.contains("this year") || q.contains("is saal") -> AiPeriod.THIS_YEAR
        q.contains("yesterday") || q.contains("kal") -> AiPeriod.YESTERDAY
        q.contains("today") || q.contains("aaj") -> AiPeriod.TODAY
        q.contains("all time") || q.contains("ab tak") || q.contains("total") -> AiPeriod.ALL_TIME
        else -> null
    }
}

fun periodRange(period: AiPeriod, today: Long): PeriodRange {
    val date = LocalDate.ofEpochDay(today)
    return when (period) {
        AiPeriod.TODAY -> PeriodRange("Aaj", today, today)
        AiPeriod.YESTERDAY -> PeriodRange("Kal (yesterday)", today - 1, today - 1)
        AiPeriod.LAST_7_DAYS -> PeriodRange("Pichhle 7 din", today - 6, today)
        AiPeriod.THIS_MONTH -> PeriodRange(
            date.format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)),
            date.withDayOfMonth(1).toEpochDay(), today
        )
        AiPeriod.LAST_MONTH -> {
            val prev = date.minusMonths(1)
            PeriodRange(
                prev.format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)),
                prev.withDayOfMonth(1).toEpochDay(),
                prev.withDayOfMonth(prev.lengthOfMonth()).toEpochDay()
            )
        }
        AiPeriod.LAST_3_MONTHS -> {
            val start = date.minusMonths(2).withDayOfMonth(1)
            PeriodRange("Pichhle 3 mahine", start.toEpochDay(), today)
        }
        AiPeriod.THIS_YEAR -> PeriodRange(
            "Is saal (${date.year})",
            date.withDayOfYear(1).toEpochDay(), today
        )
        AiPeriod.ALL_TIME -> PeriodRange("Ab tak (all time)", 0L, today)
    }
}

/** Everything the knowledge engine may quote, for ONE profile. */
data class KnowledgeSnapshot(
    val profileId: Long,
    val profileName: String,
    val profileCategory: String,
    val transactions: List<TransactionEntity> = emptyList(),
    val transfers: List<MoneyTransferEntity> = emptyList(),
    val jobs: List<ServiceJobEntity> = emptyList(),
    val customers: List<CustomerEntity> = emptyList(),
    val agents: List<AgentEntity> = emptyList(),
    val agentPayments: List<AgentPaymentEntity> = emptyList(),
    val expenses: List<ExpenseEntity> = emptyList(),
    val maintenance: List<MaintenanceEntity> = emptyList(),
    val equipment: List<EquipmentEntity> = emptyList(),
    val receipts: List<ReceiptEntity> = emptyList(),
    val funds: List<MoneyTransferFundEntity> = emptyList(),
    val documentCount: Long = 0,
    val customServices: Set<String> = emptySet()
) {
    val hasAnyData: Boolean
        get() = transactions.isNotEmpty() || jobs.isNotEmpty() || customers.isNotEmpty() ||
            transfers.isNotEmpty() || expenses.isNotEmpty()

    fun inRange(day: Long, range: PeriodRange): Boolean = day in range.startDay..range.endDay
}

/** One answered question. [table] renders as a comparison table in the
 *  chat UI; [deepLinkRoute] opens the relevant screen; [followUp] is the
 *  context the next message can refer to ("compare karo", "uska history"). */
data class KnowledgeAnswer(
    val text: String,
    val table: List<Triple<String, String, String>> = emptyList(),
    val tableHeaders: Triple<String, String, String>? = null,
    val deepLinkRoute: String? = null,
    val deepLinkLabel: String? = null,
    val followUp: AiAssistantParser.AiConversationContext? = null,
    /** True when the answer contains an estimate/suggestion, not only facts. */
    val hasEstimate: Boolean = false
)

/** What the user asked about last — used to resolve follow-ups
 *  ("Last month se compare karo" reuses the last service + period). */
data class LastKnowledge(
    val service: ServiceType? = null,
    val serviceLabel: String? = null,
    val period: AiPeriod? = null,
    val kind: String? = null, // "collection" | "profit" | "expense" | "customer" | "agent" | "summary"
    val customerName: String? = null,
    val agentName: String? = null
)

object BusinessKnowledge {

    // ------------------------------------------------------------------
    // Period / service helpers over the snapshot.
    // ------------------------------------------------------------------
    private fun incomeIn(snap: KnowledgeSnapshot, range: PeriodRange): List<TransactionEntity> =
        snap.transactions.filter { it.kind == "INCOME" && it.dateEpochDay in range.startDay..range.endDay }

    private fun expenseIn(snap: KnowledgeSnapshot, range: PeriodRange): List<TransactionEntity> =
        snap.transactions.filter { it.kind == "EXPENSE" && it.dateEpochDay in range.startDay..range.endDay }

    private fun mtIn(snap: KnowledgeSnapshot, range: PeriodRange): List<MoneyTransferEntity> =
        snap.transfers.filter { it.dateEpochDay in range.startDay..range.endDay }

    fun periodCollection(snap: KnowledgeSnapshot, range: PeriodRange): Long =
        incomeIn(snap, range).sumOf { it.amountPaise }

    fun periodExpenses(snap: KnowledgeSnapshot, range: PeriodRange): Long =
        expenseIn(snap, range).sumOf { it.amountPaise }

    fun periodMtProfit(snap: KnowledgeSnapshot, range: PeriodRange): Long {
        val mt = mtIn(snap, range)
        return AccountingEngine.moneyTransferProfit(
            mt.sumOf { it.commissionPaise }, mt.sumOf { it.chargesPaise }, 0
        )
    }

    fun periodMtCommission(snap: KnowledgeSnapshot, range: PeriodRange): Long =
        mtIn(snap, range).sumOf { it.commissionPaise }

    /** Net profit for a period: service income + MT commission-profit −
     *  expenses. The MT commission income row is already inside the
     *  income rows, so it is subtracted once before adding the
     *  commission-based profit (same rule as AccountingEngine.computeDailyBusiness). */
    fun periodProfit(snap: KnowledgeSnapshot, range: PeriodRange): Long {
        val income = incomeIn(snap, range)
        val commissionRows = income.filter { it.category == DailyBusiness.MONEY_TRANSFER_COMMISSION_LABEL }
            .sumOf { it.amountPaise }
        return AccountingEngine.netProfit(
            income.sumOf { it.amountPaise } - commissionRows,
            periodMtProfit(snap, range),
            periodExpenses(snap, range)
        )
    }

    fun serviceIncome(snap: KnowledgeSnapshot, range: PeriodRange, label: String): Long =
        incomeIn(snap, range).filter { it.category == label }.sumOf { it.amountPaise }

    fun cashBalance(snap: KnowledgeSnapshot): Long {
        val cashIn = snap.transactions.filter { it.mode == PaymentMode.CASH && it.kind == "INCOME" }.sumOf { it.amountPaise }
        val cashOut = snap.transactions.filter { it.mode == PaymentMode.CASH && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
        val cashToUpi = snap.transactions.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
        val upiToCash = snap.transactions.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
        return cashIn - cashOut - cashToUpi + upiToCash
    }

    fun upiBalance(snap: KnowledgeSnapshot): Long {
        val upiIn = snap.transactions.filter { it.mode == PaymentMode.UPI && it.kind == "INCOME" }.sumOf { it.amountPaise }
        val upiOut = snap.transactions.filter { it.mode == PaymentMode.UPI && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
        val cashToUpi = snap.transactions.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
        val upiToCash = snap.transactions.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
        return upiIn - upiOut + cashToUpi - upiToCash
    }

    /** Balance of one account at the END of a day (all rows up to that day). */
    fun balanceAtDay(snap: KnowledgeSnapshot, mode: PaymentMode, day: Long): Long {
        val rows = snap.transactions.filter { it.dateEpochDay <= day }
        val inn = rows.filter { it.mode == mode && it.kind == "INCOME" }.sumOf { it.amountPaise }
        val out = rows.filter { it.mode == mode && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
        val internalOut = rows.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == mode }.sumOf { it.amountPaise }
        val internalIn = rows.filter { it.kind == "INTERNAL_TRANSFER" && it.mode != mode }.sumOf { it.amountPaise }
        return inn - out - internalOut + internalIn
    }

    fun customerDueByCustomer(snap: KnowledgeSnapshot): List<Pair<String, Long>> =
        snap.jobs.groupBy { it.customerId }
            .mapValues { (_, js) -> js.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) } }
            .filter { it.value > 0 }
            .map { (id, due) -> (snap.customers.firstOrNull { it.id == id }?.name ?: "Customer") to due }
            .sortedByDescending { it.second }

    fun agentPayableByAgent(snap: KnowledgeSnapshot): List<Pair<String, Long>> =
        snap.agents.mapNotNull { agent ->
            val charges = snap.jobs.filter { it.agentId == agent.id }.sumOf { it.agentChargesPaise }
            val paid = snap.agentPayments.filter { it.agentId == agent.id }.sumOf { it.amountPaise }
            val payable = AccountingEngine.agentPayable(charges, paid)
            if (payable > 0) agent.name to payable else null
        }.sortedByDescending { it.second }

    // ------------------------------------------------------------------
    // Main entry: answer a factual question, or null when it is not a
    // knowledge question (caller falls through to the built-in responder).
    // ------------------------------------------------------------------
    fun answer(
        question: String,
        snap: KnowledgeSnapshot,
        today: Long,
        last: LastKnowledge? = null
    ): KnowledgeAnswer? {
        val q = AiAssistantParser.normalise(question)
        val period = parsePeriod(q, today) ?: last?.period ?: AiPeriod.TODAY
        val range = periodRange(period, today)
        val service = AiAssistantParser.detectService(q) ?: last?.service
        val serviceLabel = service?.label ?: last?.serviceLabel

        // --- Follow-ups: "compare karo", "last month se compare" ---------
        if (isComparison(q)) return compareAnswer(snap, q, today, last, service, serviceLabel)
        if (isAnalysis(q)) return analysisAnswer(snap, q, today, range, service, serviceLabel)

        // --- Daily business / summary ------------------------------------
        if (isDailySummary(q)) return dailySummary(snap, range, period)
        if (isCollection(q)) return collectionAnswer(snap, range, period, service, serviceLabel)
        if (isProfit(q)) return profitAnswer(snap, range, period, service, serviceLabel)
        if (isBalance(q)) return balanceAnswer(snap, q, range, today)
        if (isMaintenanceQuestion(q)) return maintenanceAnswer(snap, q, range)
        if (isExpenseQuestion(q)) return expenseAnswer(snap, q, range, service, serviceLabel)
        if (isMoneyTransferQuestion(q)) return moneyTransferAnswer(snap, q, range)
        if (isCustomerQuestion(q)) return customerAnswer(snap, q, range, today, last)
        if (isAgentQuestion(q)) return agentAnswer(snap, q, range, last)
        if (isServiceQuestion(q)) return serviceAnswer(snap, range, period, service, serviceLabel)
        if (isReceiptQuestion(q)) return receiptAnswer(snap)
        if (isDocumentQuestion(q)) return documentAnswer(snap)
        if (isCountQuestion(q)) return countAnswer(snap, range, today)
        return null
    }

    // --- Intent detectors -------------------------------------------------
    private fun isComparison(q: String) =
        q.contains("compare") || q.contains("tulna") || q.contains("farq") ||
            q.contains("behtar") || q.contains("badla") || q.contains("badlaav") ||
            (q.contains("last month") && q.contains("is month")) ||
            q.contains("pichhle") && q.contains("compare")

    private fun isAnalysis(q: String) =
        q.contains("analysis") || q.contains("insight") || q.contains("sabse zyada") ||
            q.contains("sabse kam") || q.contains("badh") || q.contains("ghat") ||
            q.contains("trend") || q.contains("performance") || q.contains("kaise chal") ||
            q.contains("galti") || q.contains("mistake") || q.contains("unusual") ||
            q.contains("delay") || q.contains("late")

    private fun isDailySummary(q: String) =
        q.contains("dhandha") || q.contains("dhanda") || q.contains("summary") ||
            (q.contains("aaj") && (q.contains("kitna") || q.contains("kaisa"))) ||
            q.contains("business summary") || q.contains("aaj ka hisab") ||
            // UPDATE 14 — "Aaj no total hisab batavo" (Roman Gujarati).
            q.contains("total hisab") ||
            (q.contains("hisab") && (q.contains("aaj") || q.contains("total")))

    private fun isCollection(q: String) =
        q.contains("collection") || q.contains("earning") || q.contains("kamai") ||
            q.contains("kamaya") || q.contains("income") || q.contains("aamad") ||
            q.contains("sales") || q.contains("bikri")

    private fun isProfit(q: String) =
        q.contains("profit") || q.contains("munafa") || q.contains("faayda") || q.contains("fayda")

    private fun isBalance(q: String) =
        q.contains("balance") || q.contains("cash") || Regex("\\bupi\\b").containsMatchIn(q) ||
            q.contains("opening") || q.contains("closing") || q.contains("kitne paise")

    private fun isExpenseQuestion(q: String) =
        q.contains("kharch") || q.contains("expense") || q.contains("kharach")

    private fun isMoneyTransferQuestion(q: String) =
        q.contains("money transfer") || q.contains("commission") || Regex("\\bmt\\b").containsMatchIn(q) ||
            q.contains("fund")

    private fun isCustomerQuestion(q: String) =
        q.contains("customer") || q.contains("grahak") || q.contains("due") ||
            q.contains("udhaar") || q.contains("pending payment") || q.contains("lena hai")

    private fun isAgentQuestion(q: String) =
        q.contains("agent")

    private fun isServiceQuestion(q: String) =
        q.contains("service") || AiAssistantParser.detectService(q) != null

    private fun isMaintenanceQuestion(q: String) =
        q.contains("maintenance") || q.contains("machine") || q.contains("printer") ||
            q.contains("epson") || q.contains("kyocera") || q.contains("repair")

    private fun isReceiptQuestion(q: String) = q.contains("receipt") || q.contains("rasid")

    private fun isDocumentQuestion(q: String) =
        q.contains("document") || q.contains("dastavej") || q.contains("kagaz")

    private fun isCountQuestion(q: String) =
        q.contains("kitne customer") || q.contains("kitne jobs") || q.contains("kitne naye") ||
            q.contains("how many")

    // --- Answers ----------------------------------------------------------
    // UPDATE 14 — honest zero figures on an empty store: a summary /
    // profit / collection / expense question on zero records answers
    // with the REAL figure (₹0), plus a plain note that there are no
    // records yet. "No records" alone would hide the figure the user
    // asked for; an invented figure would be worse. The note keeps the
    // existing "koi record nahi hai" honesty check passing.
    private fun emptyNote(): String =
        "Abhi koi record nahi hai — pehle entry add karein, phir main asli hisab bataunga."

    private fun dailySummary(snap: KnowledgeSnapshot, range: PeriodRange, period: AiPeriod): KnowledgeAnswer {
        if (!snap.hasAnyData) {
            return KnowledgeAnswer(
                "${range.label} ka total collection: ${formatPaise(0)} (Cash ${formatPaise(0)} + UPI ${formatPaise(0)})\n" +
                    "Kharcha: ${formatPaise(0)}\nNet profit: ${formatPaise(0)}\n${emptyNote()}",
                deepLinkRoute = "daily_business", deepLinkLabel = "Daily Business kholo"
            )
        }
        val income = incomeIn(snap, range)
        val cash = income.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
        val upi = income.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
        val expenses = periodExpenses(snap, range)
        val profit = periodProfit(snap, range)
        val commission = periodMtCommission(snap, range)
        val byService = income.groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
            .toList().sortedByDescending { it.second }.take(5)
        val top = byService.firstOrNull()
        val due = snap.jobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }
        val payable = agentPayableByAgent(snap).sumOf { it.second }
        val text = buildString {
            appendLine("${range.label} ka dhandha:")
            appendLine("• Total collection: ${formatPaise(income.sumOf { it.amountPaise })} (Cash ${formatPaise(cash)} + UPI ${formatPaise(upi)})")
            appendLine("• Kharcha: ${formatPaise(expenses)}")
            appendLine("• Net profit: ${formatPaise(profit)}")
            appendLine("• Money Transfer commission: ${formatPaise(commission)} (sirf commission — principal profit nahi)")
            if (top != null) appendLine("• Sabse zyada earning: ${top.first} (${formatPaise(top.second)})")
            if (byService.isNotEmpty()) {
                appendLine("• Service-wise:")
                byService.forEach { (label, amt) -> appendLine("   – $label: ${formatPaise(amt)}") }
            }
            appendLine("• Customer due (baaki): ${formatPaise(due)} — ye cash NAHI hai")
            appendLine("• Agent payable: ${formatPaise(payable)}")
        }
        return KnowledgeAnswer(
            text.trim(), deepLinkRoute = "daily_business", deepLinkLabel = "Daily Business kholo",
            followUp = AiAssistantParser.AiConversationContext(
                lastKnowledgePeriod = period, lastKnowledgeKind = "summary"
            )
        )
    }

    private fun collectionAnswer(
        snap: KnowledgeSnapshot, range: PeriodRange, period: AiPeriod, service: ServiceType?, label: String?
    ): KnowledgeAnswer {
        if (!snap.hasAnyData) {
            return KnowledgeAnswer(
                "${range.label} total collection: ${formatPaise(0)}.\n${emptyNote()}",
                deepLinkRoute = "daily_business", deepLinkLabel = "Daily Business kholo"
            )
        }
        if (service != null && label != null) {
            val amt = serviceIncome(snap, range, label)
            val mtNote = if (service == ServiceType.MONEY_TRANSFER)
                "\nNote: Money Transfer me sirf commission income hai — principal kabhi income nahi."
            else ""
            return KnowledgeAnswer(
                "${range.label} — $label se collection: ${formatPaise(amt)}.$mtNote",
                followUp = AiAssistantParser.AiConversationContext(
                    lastService = service, lastServiceLabel = label,
                    lastKnowledgeService = service, lastKnowledgePeriod = period,
                    lastKnowledgeKind = "collection"
                ),
                deepLinkRoute = "daily_business", deepLinkLabel = "Daily Business kholo"
            )
        }
        val total = periodCollection(snap, range)
        val byService = incomeIn(snap, range).groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
            .toList().sortedByDescending { it.second }
        val top = byService.firstOrNull()
        val text = buildString {
            appendLine("${range.label} total collection: ${formatPaise(total)}.")
            if (top != null) appendLine("Sabse zyada earning: ${top.first} (${formatPaise(top.second)}).")
            if (byService.isNotEmpty()) {
                appendLine("Service-wise:")
                byService.take(6).forEach { (l, a) -> appendLine("• $l: ${formatPaise(a)}") }
            }
        }
        return KnowledgeAnswer(text.trim(), deepLinkRoute = "daily_business", deepLinkLabel = "Daily Business kholo")
    }

    private fun profitAnswer(
        snap: KnowledgeSnapshot, range: PeriodRange, period: AiPeriod, service: ServiceType?, label: String?
    ): KnowledgeAnswer {
        if (!snap.hasAnyData) {
            return KnowledgeAnswer(
                "${range.label} ka profit: ${formatPaise(0)}\n" +
                    "Calculation: Collection ${formatPaise(0)} − Kharcha ${formatPaise(0)} = ${formatPaise(0)}\n${emptyNote()}",
                deepLinkRoute = "reports", deepLinkLabel = "Reports kholo"
            )
        }
        val profit = periodProfit(snap, range)
        val income = periodCollection(snap, range)
        val expenses = periodExpenses(snap, range)
        val commission = periodMtCommission(snap, range)
        val text = buildString {
            appendLine("${range.label} ka profit: ${formatPaise(profit)}")
            appendLine("Calculation: Collection ${formatPaise(income)} − Kharcha ${formatPaise(expenses)} = ${formatPaise(profit)}")
            appendLine("(Money Transfer ka ${formatPaise(commission)} commission isme shaamil hai — principal nahi.)")
            if (service != null && label != null) {
                val svcIncome = serviceIncome(snap, range, label)
                val svcExpense = snap.expenses.filter {
                    it.service == service && it.dateEpochDay in range.startDay..range.endDay
                }.sumOf { it.amountPaise }
                appendLine("$label: income ${formatPaise(svcIncome)} − direct kharcha ${formatPaise(svcExpense)} = profit ${formatPaise(svcIncome - svcExpense)} (agent charges alag se hain).")
            }
        }
        return KnowledgeAnswer(text.trim(), deepLinkRoute = "reports", deepLinkLabel = "Reports kholo")
    }

    private fun balanceAnswer(snap: KnowledgeSnapshot, q: String, range: PeriodRange, today: Long): KnowledgeAnswer {
        val cash = cashBalance(snap)
        val upi = upiBalance(snap)
        if (q.contains("opening") || q.contains("closing")) {
            val day = range.endDay
            val openCash = balanceAtDay(snap, PaymentMode.CASH, range.startDay - 1)
            val closeCash = balanceAtDay(snap, PaymentMode.CASH, day)
            val openUpi = balanceAtDay(snap, PaymentMode.UPI, range.startDay - 1)
            val closeUpi = balanceAtDay(snap, PaymentMode.UPI, day)
            return KnowledgeAnswer(
                "${range.label} — Opening / Closing balance:\n" +
                    "• Cash: opening ${formatPaise(openCash)} → closing ${formatPaise(closeCash)}\n" +
                    "• UPI: opening ${formatPaise(openUpi)} → closing ${formatPaise(closeUpi)}\n" +
                    "Calculation: opening + us din ki income − kharcha (± internal transfer).",
                deepLinkRoute = "cash_book", deepLinkLabel = "Cash Book kholo"
            )
        }
        val hasUpi = Regex("\\bupi\\b").containsMatchIn(q)
        if (q.contains("cash") && !hasUpi) {
            return KnowledgeAnswer("Cash balance: ${formatPaise(cash)}.", deepLinkRoute = "cash_book", deepLinkLabel = "Cash Book kholo")
        }
        if (hasUpi && !q.contains("cash")) {
            return KnowledgeAnswer("UPI balance: ${formatPaise(upi)}.", deepLinkRoute = "upi_book", deepLinkLabel = "UPI Book kholo")
        }
        val diff = cash - upi
        return KnowledgeAnswer(
            "Cash balance: ${formatPaise(cash)}\nUPI balance: ${formatPaise(upi)}\n" +
                "Cash aur UPI me difference: ${formatPaise(kotlin.math.abs(diff))} " +
                "(${if (diff >= 0) "Cash zyada" else "UPI zyada"}).\nDono alag accounts hain — Cash→UPI transfer se total nahi badhta, sirf account badalta hai.",
            deepLinkRoute = "cash_book", deepLinkLabel = "Cash Book kholo"
        )
    }

    private fun expenseAnswer(
        snap: KnowledgeSnapshot, q: String, range: PeriodRange, service: ServiceType?, label: String?
    ): KnowledgeAnswer {
        if (!snap.hasAnyData) {
            return KnowledgeAnswer(
                "${range.label} total kharcha: ${formatPaise(0)}.\n${emptyNote()}",
                deepLinkRoute = "expenses", deepLinkLabel = "Expenses kholo"
            )
        }
        val total = periodExpenses(snap, range)
        val byCat = expenseIn(snap, range).groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
            .toList().sortedByDescending { it.second }
        val top = byCat.firstOrNull()
        val text = buildString {
            appendLine("${range.label} total kharcha: ${formatPaise(total)}.")
            if (top != null) appendLine("Sabse zyada kharcha: ${top.first} (${formatPaise(top.second)}).")
            if (service != null && label != null) {
                val svc = snap.expenses.filter {
                    it.service == service && it.dateEpochDay in range.startDay..range.endDay
                }.sumOf { it.amountPaise }
                appendLine("$label se juda kharcha: ${formatPaise(svc)}.")
            }
            if (byCat.isNotEmpty()) {
                appendLine("Category-wise:")
                byCat.take(6).forEach { (c, a) -> appendLine("• $c: ${formatPaise(a)}") }
            }
        }
        return KnowledgeAnswer(text.trim(), deepLinkRoute = "expenses", deepLinkLabel = "Expenses kholo")
    }

    private fun moneyTransferAnswer(snap: KnowledgeSnapshot, q: String, range: PeriodRange): KnowledgeAnswer {
        val mt = mtIn(snap, range)
        val commission = mt.sumOf { it.commissionPaise }
        val principal = mt.sumOf { it.amountPaise }
        val fund = snap.funds.sumOf { it.amountPaise }
        if (q.contains("fund")) {
            return KnowledgeAnswer(
                "Money Transfer fund (bhai se, UPI se, ab tak kul): ${formatPaise(fund)}.",
                deepLinkRoute = "money_transfer", deepLinkLabel = "Money Transfer kholo"
            )
        }
        if (mt.isEmpty() && commission == 0L) {
            return KnowledgeAnswer(
                "${range.label} Money Transfer ka koi record nahi hai.",
                deepLinkRoute = "money_transfer", deepLinkLabel = "Money Transfer kholo"
            )
        }
        return KnowledgeAnswer(
            "${range.label} Money Transfer:\n" +
                "• Commission (profit): ${formatPaise(commission)}\n" +
                "• Principal bheja gaya: ${formatPaise(principal)} (ye profit NAHI hai — sirf commission profit hai)\n" +
                "• Transfers: ${mt.size}\n" +
                "• Fund (bhai se, ab tak): ${formatPaise(fund)}",
            deepLinkRoute = "money_transfer", deepLinkLabel = "Money Transfer kholo"
        )
    }

    private fun customerAnswer(
        snap: KnowledgeSnapshot, q: String, range: PeriodRange, today: Long, last: LastKnowledge?
    ): KnowledgeAnswer {
        // Named customer history: "Is customer ki history dikhao" / "<name> ka due".
        val named = snap.customers.firstOrNull { q.contains(it.name.lowercase()) }
            ?: last?.customerName?.let { n -> snap.customers.firstOrNull { it.name == n } }
        if (named != null) {
            val jobs = snap.jobs.filter { it.customerId == named.id }
            val totalFees = jobs.sumOf { it.totalFeesPaise }
            val received = jobs.sumOf { it.amountReceivedPaise }
            val due = AccountingEngine.customerDue(totalFees, received)
            val lastPayment = snap.transactions.filter { it.relatedJobId in jobs.map { j -> j.id } }
                .maxByOrNull { it.dateEpochDay }
            val text = buildString {
                appendLine("${named.name} ki history:")
                appendLine("• Jobs: ${jobs.size} (total fees ${formatPaise(totalFees)}, received ${formatPaise(received)}, due ${formatPaise(due)})")
                jobs.take(5).forEach { j ->
                    appendLine("• ${j.service.label}: fees ${formatPaise(j.totalFeesPaise)}, paid ${formatPaise(j.amountReceivedPaise)}, status ${j.status}")
                }
                if (lastPayment != null) {
                    appendLine("• Last payment: ${formatPaise(lastPayment.amountPaise)} (${lastPayment.mode}) — ${formatDay(lastPayment.dateEpochDay)}")
                } else {
                    appendLine("• Abhi tak koi payment record nahi hai.")
                }
            }
            return KnowledgeAnswer(
                text.trim(),
                deepLinkRoute = "customer/${named.id}", deepLinkLabel = "${named.name} ka Khata kholo"
            )
        }
        val debtors = customerDueByCustomer(snap)
        if (q.contains("due") || q.contains("udhaar") || q.contains("pending") || q.contains("lena") ||
            q.contains("sabse zyada")
        ) {
            if (debtors.isEmpty()) {
                return KnowledgeAnswer(
                    "Koi customer due nahi hai — sab clear hai.",
                    deepLinkRoute = "khata", deepLinkLabel = "Customer Khata kholo"
                )
            }
            val total = debtors.sumOf { it.second }
            val lines = debtors.take(5).joinToString("\n") { "• ${it.first}: ${formatPaise(it.second)}" }
            return KnowledgeAnswer(
                "Customer due (kul ${formatPaise(total)}):\n$lines\n\nDue cash NAHI hai — ye paisa abhi aana baaki hai.",
                deepLinkRoute = "khata", deepLinkLabel = "Customer Khata kholo"
            )
        }
        if (q.contains("naye") || q.contains("new")) {
            val startMs = LocalDate.ofEpochDay(range.startDay).atStartOfDay().toEpochSecond(ZoneOffset.UTC) * 1000
            val endMs = LocalDate.ofEpochDay(range.endDay).plusDays(1).atStartOfDay().toEpochSecond(ZoneOffset.UTC) * 1000
            val fresh = snap.customers.count { it.createdAtEpochMs in startMs until endMs }
            return KnowledgeAnswer(
                "${range.label} naye customers: $fresh (kul customers: ${snap.customers.size}).",
                deepLinkRoute = "khata", deepLinkLabel = "Customer Khata kholo"
            )
        }
        return KnowledgeAnswer(
            "Kul customers: ${snap.customers.size}. Sabse zyada due: " +
                (debtors.firstOrNull()?.let { "${it.first} (${formatPaise(it.second)})" } ?: "koi due nahi hai."),
            deepLinkRoute = "khata", deepLinkLabel = "Customer Khata kholo"
        )
    }

    private fun agentAnswer(
        snap: KnowledgeSnapshot, q: String, range: PeriodRange, last: LastKnowledge?
    ): KnowledgeAnswer {
        val named = snap.agents.firstOrNull { q.contains(it.name.lowercase()) }
            ?: last?.agentName?.let { n -> snap.agents.firstOrNull { it.name == n } }
        if (named != null) {
            val charges = snap.jobs.filter { it.agentId == named.id }.sumOf { it.agentChargesPaise }
            val paidAll = snap.agentPayments.filter { it.agentId == named.id }.sumOf { it.amountPaise }
            val paidPeriod = snap.agentPayments.filter {
                it.agentId == named.id && it.dateEpochDay in range.startDay..range.endDay
            }.sumOf { it.amountPaise }
            val payable = AccountingEngine.agentPayable(charges, paidAll)
            val pendingJobs = snap.jobs.count {
                it.agentId == named.id && (it.status == JobStatus.NEW || it.status == JobStatus.IN_PROGRESS ||
                    it.status == JobStatus.SUBMITTED || it.status == JobStatus.PENDING)
            }
            return KnowledgeAnswer(
                "${named.name} (agent):\n" +
                    "• Total charges: ${formatPaise(charges)}\n" +
                    "• Total paid (ab tak): ${formatPaise(paidAll)}\n" +
                    "• Abhi payable (baaki): ${formatPaise(payable)}\n" +
                    "• ${range.label} me paid: ${formatPaise(paidPeriod)}\n" +
                    "• Pending jobs: $pendingJobs\n" +
                    "Ye customer due se alag hisab hai — dono kabhi mix nahi hote.",
                deepLinkRoute = "agent/${named.id}", deepLinkLabel = "${named.name} ka page kholo"
            )
        }
        val owed = agentPayableByAgent(snap)
        val paidPeriod = snap.agentPayments.filter {
            it.dateEpochDay in range.startDay..range.endDay
        }.sumOf { it.amountPaise }
        if (owed.isEmpty() && paidPeriod == 0L) {
            return KnowledgeAnswer(
                "Agent ko dene ke liye abhi kuch nahi hai.",
                deepLinkRoute = "agents", deepLinkLabel = "Agents kholo"
            )
        }
        val lines = owed.take(5).joinToString("\n") { "• ${it.first}: ${formatPaise(it.second)}" }
        return KnowledgeAnswer(
            "Agent payable (kul ${formatPaise(owed.sumOf { it.second })}):\n$lines\n" +
                "${range.label} me agents ko paid: ${formatPaise(paidPeriod)}.",
            deepLinkRoute = "agents", deepLinkLabel = "Agents kholo"
        )
    }

    private fun serviceAnswer(
        snap: KnowledgeSnapshot, range: PeriodRange, period: AiPeriod, service: ServiceType?, label: String?
    ): KnowledgeAnswer {
        if (service != null && label != null) {
            return collectionAnswer(snap, range, period, service, label)
        }
        val byService = incomeIn(snap, range).groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
            .toList().sortedByDescending { it.second }
        if (byService.isEmpty()) {
            return KnowledgeAnswer("${range.label} kisi service se income ka koi record nahi hai.")
        }
        val lines = byService.take(6).joinToString("\n") { "• ${it.first}: ${formatPaise(it.second)}" }
        return KnowledgeAnswer(
            "${range.label} service-wise income:\n$lines",
            deepLinkRoute = "services", deepLinkLabel = "Services kholo"
        )
    }

    private fun maintenanceAnswer(snap: KnowledgeSnapshot, q: String, range: PeriodRange): KnowledgeAnswer {
        val namedEq = snap.equipment.firstOrNull { q.contains(it.name.lowercase()) }
        if (namedEq != null) {
            val rows = snap.maintenance.filter { it.equipmentId == namedEq.id }
            val total = rows.sumOf { it.costPaise }
            val periodTotal = rows.filter { it.dateEpochDay in range.startDay..range.endDay }.sumOf { it.costPaise }
            return KnowledgeAnswer(
                "${namedEq.name} — maintenance:\n" +
                    "• Kul kharcha (lifetime): ${formatPaise(total)} (${rows.size} events)\n" +
                    "• ${range.label} me: ${formatPaise(periodTotal)}",
                deepLinkRoute = "maintenance", deepLinkLabel = "Maintenance kholo"
            )
        }
        val byEq = snap.maintenance.groupBy { it.equipmentId }
            .mapValues { (_, v) -> v.sumOf { it.costPaise } }
            .toList().sortedByDescending { it.second }
        if (byEq.isEmpty()) {
            return KnowledgeAnswer(
                "Maintenance ka koi record nahi hai — ${range.label} me machine par koi kharcha nahi hua.",
                deepLinkRoute = "maintenance", deepLinkLabel = "Maintenance kholo"
            )
        }
        val top = byEq.first()
        val topName = snap.equipment.firstOrNull { it.id == top.first }?.name ?: "Equipment #${top.first}"
        val periodTotal = snap.maintenance.filter {
            it.dateEpochDay in range.startDay..range.endDay
        }.sumOf { it.costPaise }
        return KnowledgeAnswer(
            "${range.label} maintenance kharcha: ${formatPaise(periodTotal)}.\n" +
                "Sabse zyada kharcha: $topName (${formatPaise(top.second)} lifetime).",
            deepLinkRoute = "maintenance", deepLinkLabel = "Maintenance kholo"
        )
    }

    private fun receiptAnswer(snap: KnowledgeSnapshot): KnowledgeAnswer {
        if (snap.receipts.isEmpty()) {
            return KnowledgeAnswer(
                "Abhi koi receipt generate nahi hui hai.",
                deepLinkRoute = "receipts", deepLinkLabel = "Receipts kholo"
            )
        }
        val last = snap.receipts.maxByOrNull { it.createdAtEpochMs }
        return KnowledgeAnswer(
            "Kul receipts: ${snap.receipts.size}." +
                (last?.let { "\nLast receipt: ${it.receiptNumber} — ${it.customerName} (${it.service.label}), ${formatPaise(it.amountPaidPaise)} paid." } ?: ""),
            deepLinkRoute = "receipts", deepLinkLabel = "Receipts kholo"
        )
    }

    private fun documentAnswer(snap: KnowledgeSnapshot): KnowledgeAnswer =
        KnowledgeAnswer(
            "Is profile me kul ${snap.documentCount} documents save hain (customer/job ke saath, private storage me). " +
                "Kisi customer ke documents dekhne ke liye uska Khata kholein.",
            deepLinkRoute = "khata", deepLinkLabel = "Customer Khata kholo"
        )

    private fun countAnswer(snap: KnowledgeSnapshot, range: PeriodRange, today: Long): KnowledgeAnswer {
        val startMs = LocalDate.ofEpochDay(range.startDay).atStartOfDay().toEpochSecond(ZoneOffset.UTC) * 1000
        val endMs = LocalDate.ofEpochDay(range.endDay).plusDays(1).atStartOfDay().toEpochSecond(ZoneOffset.UTC) * 1000
        val fresh = snap.customers.count { it.createdAtEpochMs in startMs until endMs }
        val jobsToday = snap.jobs.count {
            it.submissionDateEpochDay in range.startDay..range.endDay
        }
        return KnowledgeAnswer(
            "${range.label}:\n• Naye customers: $fresh\n• Jobs: $jobsToday\n• Kul customers: ${snap.customers.size}\n• Kul jobs: ${snap.jobs.size}",
            deepLinkRoute = "khata", deepLinkLabel = "Customer Khata kholo"
        )
    }

    // --- Comparison -------------------------------------------------------
    private fun compareAnswer(
        snap: KnowledgeSnapshot, q: String, today: Long, last: LastKnowledge?,
        service: ServiceType?, label: String?
    ): KnowledgeAnswer {
        val current = periodRange(last?.period ?: AiPeriod.THIS_MONTH, today)
        val previous = when (last?.period ?: AiPeriod.THIS_MONTH) {
            AiPeriod.THIS_MONTH -> periodRange(AiPeriod.LAST_MONTH, today)
            AiPeriod.LAST_7_DAYS -> PeriodRange("Usse pichhle 7 din", today - 13, today - 7)
            AiPeriod.THIS_YEAR -> {
                val y = LocalDate.ofEpochDay(today).minusYears(1)
                PeriodRange("Pichhla saal (${y.year})", y.withDayOfYear(1).toEpochDay(), y.withDayOfYear(y.lengthOfYear()).toEpochDay())
            }
            else -> periodRange(AiPeriod.LAST_MONTH, today)
        }
        val metric: (PeriodRange) -> Long = when {
            q.contains("profit") -> { r -> periodProfit(snap, r) }
            q.contains("kharch") || q.contains("expense") -> { r -> periodExpenses(snap, r) }
            label != null -> { r -> serviceIncome(snap, r, label) }
            else -> { r -> periodCollection(snap, r) }
        }
        val cur = metric(current)
        val prev = metric(previous)
        val diff = cur - prev
        val pct = if (prev != 0L) (diff * 100) / prev else 0L
        val what = when {
            q.contains("profit") -> "Profit"
            q.contains("kharch") || q.contains("expense") -> "Kharcha"
            label != null -> "$label collection"
            else -> "Collection"
        }
        val rows = listOf(
            Triple(what, formatPaise(prev), formatPaise(cur)),
            Triple("Difference", "—", "${if (diff >= 0) "+" else ""}${formatPaise(diff)} ($pct%)")
        )
        val verdict = when {
            prev == 0L && cur == 0L -> "Dono periods me koi record nahi hai."
            diff > 0 -> "$what badha hai — achha sign hai."
            diff < 0 -> "$what kam hua hai."
            else -> "$what same raha."
        }
        return KnowledgeAnswer(
            "$what — ${previous.label} vs ${current.label}:\n$verdict\n" +
                "Ye calculation aapke real record se hai; pichhle period ka data na ho to comparison adhoora hoga.",
            table = rows,
            tableHeaders = Triple("Metric", previous.label, current.label),
            deepLinkRoute = "reports", deepLinkLabel = "Reports kholo"
        )
    }

    // --- Analysis (UPDATE 11 §8): facts vs estimates, labelled ----------
    private fun analysisAnswer(
        snap: KnowledgeSnapshot, q: String, today: Long, range: PeriodRange,
        service: ServiceType?, label: String?
    ): KnowledgeAnswer {
        if (!snap.hasAnyData) {
            return KnowledgeAnswer("Analysis ke liye abhi koi record nahi hai — pehle entries add karein.")
        }
        val byService = incomeIn(snap, range).groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
            .toList().sortedByDescending { it.second }
        val top = byService.firstOrNull()
        val bottom = byService.lastOrNull()
        val thisMonth = periodRange(AiPeriod.THIS_MONTH, today)
        val lastMonth = periodRange(AiPeriod.LAST_MONTH, today)
        val byCatThis = expenseIn(snap, thisMonth).groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
        val byCatLast = expenseIn(snap, lastMonth).groupBy { it.category }
            .mapValues { (_, v) -> v.sumOf { it.amountPaise } }
        val rising = byCatThis.mapNotNull { (cat, amt) ->
            val prev = byCatLast[cat] ?: 0L
            if (prev > 0 && amt > prev) cat to (amt - prev) else null
        }.sortedByDescending { it.second }
        val debtors = customerDueByCustomer(snap)
        val topMaintenance = snap.maintenance.groupBy { it.equipmentId }
            .mapValues { (_, v) -> v.sumOf { it.costPaise } }
            .toList().sortedByDescending { it.second }.firstOrNull()
        val text = buildString {
            appendLine("Business analysis (${range.label}) — FACTS (aapke real record se):")
            if (top != null) appendLine("• Sabse zyada earning: ${top.first} (${formatPaise(top.second)})")
            if (bottom != null && bottom != top) appendLine("• Sabse kam earning: ${bottom.first} (${formatPaise(bottom.second)})")
            if (rising.isNotEmpty()) {
                appendLine("• Badhta hua kharcha: " + rising.take(3).joinToString(", ") { "${it.first} (+${formatPaise(it.second)} vs last month)" })
            } else {
                appendLine("• Pichhle mahine ke mukable koi category ka kharcha khaas nahi badha.")
            }
            if (debtors.isNotEmpty()) {
                appendLine("• Sabse zyada due: ${debtors.first().first} (${formatPaise(debtors.first().second)}) — kul due ${formatPaise(debtors.sumOf { it.second })}")
            }
            if (topMaintenance != null) {
                val name = snap.equipment.firstOrNull { it.id == topMaintenance.first }?.name ?: "Equipment"
                appendLine("• Sabse zyada maintenance kharcha: $name (${formatPaise(topMaintenance.second)})")
            }
            appendLine()
            appendLine("SUGGESTION (ye estimate/salah hai, fact nahi):")
            if (bottom != null && top != null && bottom != top) {
                appendLine("• ${bottom.first} ki earning kam hai — us service ke customers ko yaad dilayein ya rate check karein.")
            }
            if (rising.isNotEmpty()) {
                appendLine("• ${rising.first().first} ka kharcha badh raha hai — iska bill/reason check kar lein.")
            }
            if (debtors.isNotEmpty()) {
                appendLine("• ${debtors.first().first} se due vasool karne ke liye Customer Khata se reminder bhej sakte hain.")
            }
        }
        return KnowledgeAnswer(
            text.trim(), deepLinkRoute = "reports", deepLinkLabel = "Reports kholo",
            hasEstimate = true
        )
    }

    /** UPDATE 15/16 — tomorrow's work plan, from REAL pending jobs
     *  (never invented). "Kal mujhe kya kya kaam karna chahiye?" and
     *  "Kal ke kaam ki checklist banao" both use this: pending jobs
     *  first, then the generic closing checks. Empty store → an honest
     *  empty plan, not a made-up task list. */
    fun tomorrowPlan(snap: KnowledgeSnapshot, today: Long): String {
        val pending = snap.jobs.filter {
            it.status == JobStatus.NEW || it.status == JobStatus.IN_PROGRESS ||
                it.status == JobStatus.SUBMITTED || it.status == JobStatus.PENDING
        }
        return buildString {
            if (pending.isEmpty()) {
                appendLine("Kal ke liye koi pending job nahi hai.")
            } else {
                appendLine("Kal ke pending kaam (${pending.size}):")
                pending.take(8).forEach { job ->
                    val customer = snap.customers.firstOrNull { it.id == job.customerId }?.name ?: "Customer"
                    val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                    val duePart = if (due > 0) ", due ${formatPaise(due)}" else ""
                    appendLine("• ${job.service.label} — $customer (status: ${job.status}$duePart)")
                }
                if (pending.size > 8) appendLine("• …aur ${pending.size - 8} pending kaam.")
            }
            appendLine("• Cash closing karo — Cash aur UPI alag-alag.")
            appendLine("• Money Transfer fund ka balance check karo.")
            appendLine("• Machine, kagaz aur ink check karo.")
        }.trim()
    }

    private fun formatDay(epochDay: Long): String =
        LocalDate.ofEpochDay(epochDay).format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))
}

// ---------------------------------------------------------------------------
// Application help + navigation (UPDATE 10 §3, UPDATE 11 §9).
// The assistant understands every module and how info flows between them,
// and opens the REAL NavGraph route — never a fake navigation response.
// ---------------------------------------------------------------------------
data class AppHelpTopic(
    val key: String,
    val title: String,
    val steps: List<String>,
    val route: String,
    val routeLabel: String,
    /** How this screen connects to the rest of the app. */
    val connectsTo: String
)

object AppHelpKnowledge {
    val topics: Map<String, AppHelpTopic> = mapOf(
        "cash_book" to AppHelpTopic(
            "cash_book", "Cash Book me entry kaise add karein",
            listOf(
                "Cash Book kholein (drawer se ya neeche diye button se).",
                "\"Add Income\" ya \"Add Expense\" dabayein.",
                "Amount, category (jaise Xerox) aur date daalein.",
                "Save karein — entry turant Cash Book, Daily Business aur Dashboard me dikhegi."
            ),
            "cash_book", "Cash Book kholo",
            "Cash Book ki entry Daily Business aur Reports me bhi dikhti hai — ek entry, ek hi baar likhi jaati hai."
        ),
        "upi_book" to AppHelpTopic(
            "upi_book", "UPI Book me entry kaise add karein",
            listOf(
                "UPI Book kholein.",
                "\"Add Income\" ya \"Add Expense\" dabayein.",
                "Amount aur category daalein, Save karein.",
                "UPI balance Cash se alag rehta hai — dono kabhi mix nahi hote."
            ),
            "upi_book", "UPI Book kholo",
            "UPI entries Daily Business ke UPI collection me judti hain."
        ),
        "add_customer" to AppHelpTopic(
            "add_customer", "Customer kaise add karte hain",
            listOf(
                "Customer Khata kholein.",
                "Service chunein (PAN, Aadhaar, Xerox… — har service ki list alag hai).",
                "\"Add Customer\" dabayein, naam + mobile daalein.",
                "Phir us customer ke liye job add karein — total fees aur received amount alag-alag likhein."
            ),
            "khata", "Customer Khata kholo",
            "Customer ka job uski service page par dikhta hai; payment Khata me aata hai aur Cash/UPI balance badhta hai."
        ),
        "agent_payment" to AppHelpTopic(
            "agent_payment", "Agent ko payment kaise dein",
            listOf(
                "Agents kholein, agent chunein.",
                "\"Pay Agent\" dabayein, amount aur Cash/UPI chunein.",
                "Save karein — agent payable kam hoga aur payment history me dikhega.",
                "Yaad rahe: PAN ka kaam kabhi agent ko nahi diya jaata — PAN aap khud karte hain."
            ),
            "agents", "Agents kholo",
            "Agent payment agent ledger me jaata hai — customer due se alag hisab."
        ),
        "receipt" to AppHelpTopic(
            "receipt", "Receipt kaise generate karein",
            listOf(
                "Receipts kholein.",
                "Customer/job chunein — receipt number, date, total/paid/remaining auto-bhar jayega.",
                "PDF download karein, print karein ya WhatsApp par bhejein.",
                "Duplicate receipt bhi yahin se bana sakte hain."
            ),
            "receipts", "Receipts kholo",
            "Receipt job ki real fees aur received amount se banti hai — due hamesha saaf dikhta hai."
        ),
        "daily_report" to AppHelpTopic(
            "daily_report", "Daily report kahan milegi",
            listOf(
                "Daily Business (Daily Dhandha) kholein — aaj ka total collection, Cash/UPI, kharcha aur net profit wahi hai.",
                "Service-wise collection bhi wahi dikhta hai.",
                "Reports kholein — wahan daily/weekly/monthly/yearly report milti hai."
            ),
            "daily_business", "Daily Business kholo",
            "Daily Business koi alag copy nahi hai — wahi transactions jo Cash Book aur service pages me hain, wahi yahan judkar dikhte hain."
        ),
        "change_profile" to AppHelpTopic(
            "change_profile", "Business profile kaise change karein",
            listOf(
                "Drawer (upar left menu) kholein.",
                "Business card par tap karein — saari profiles dikhengi.",
                "Dusri profile chunein — poora hisab (customers, cash, jobs) us profile ka dikhega.",
                "Profiles ka data kabhi mix nahi hota."
            ),
            "settings", "Settings kholo",
            "Har profile ka dashboard, Khata, agents aur reports poori tarah alag hain."
        ),
        "new_service" to AppHelpTopic(
            "new_service", "New service kaise add karein",
            listOf(
                "Customization Studio kholein (drawer → Settings se bhi).",
                "\"Add Service\" dabayein, service ka naam likhein.",
                "Save karein — nayi service Daily Business aur Services me dikhne lagegi."
            ),
            "customization", "Customization Studio kholo",
            "Custom service ki income uske apne naam se group hoti hai."
        ),
        "language" to AppHelpTopic(
            "language", "Language kaise change karein",
            listOf(
                "Settings kholein.",
                "\"Language\" chunein — English, Hindi ya Hinglish.",
                "Save karte hi poora app usi language me dikhega."
            ),
            "settings", "Settings kholo",
            "Language sirf display badalti hai — aapka data waisa ka waisa rehta hai."
        ),
        "difference_finder" to AppHelpTopic(
            "difference_finder", "Difference Finder kaise use karein",
            listOf(
                "Difference Finder kholein.",
                "Expected balance daalein (jaise aapke haath me kitna cash hona chahiye).",
                "App recorded balance se compare karke difference batayega.",
                "Possible matching transactions dikhegi — aap khud decide karein kaunsi galat hai; app kabhi khud entry nahi badalta."
            ),
            "difference_finder", "Difference Finder kholo",
            "Money Transfer ka Difference Finder alag hai — uska hisab MT ledger se hi hota hai."
        ),
        "money_transfer" to AppHelpTopic(
            "money_transfer", "Money Transfer kaise karein",
            listOf(
                "Money Transfer kholein.",
                "\"Add Transfer\" dabayein — customer, receiver, principal amount aur commission daalein.",
                "Save karein — sirf commission profit me judta hai, principal nahi.",
                "Fund (bhai se) \"Add Fund\" se daalein; Daily Closing se din band karein."
            ),
            "money_transfer", "Money Transfer kholo",
            "MT ka hisab dukaan ke aam hisab se poori tarah alag ledger me rehta hai."
        ),
        "expense" to AppHelpTopic(
            "expense", "Expense kaise add karein",
            listOf(
                "Expenses kholein, \"Add Expense\" dabayein.",
                "Category chunein (Machine Repair, Electricity, Ink…), amount aur Cash/UPI daalein.",
                "Machine se juda kharcha ho to equipment bhi chunein — us machine ka lifetime cost ban jayega."
            ),
            "expenses", "Expenses kholo",
            "Expense turant Daily Business aur Reports ke kharche me dikhta hai."
        ),
        "maintenance" to AppHelpTopic(
            "maintenance", "Machine Maintenance kaise dekhein",
            listOf(
                "Machine Maintenance kholein.",
                "Har machine (Xerox, Epson printer…) ka card dikhega — lifetime cost aur last/next maintenance ke saath.",
                "\"Add Maintenance\" se servicing ya part replacement add karein."
            ),
            "maintenance", "Maintenance kholo",
            "Maintenance ka kharcha Expenses me bhi judta hai."
        ),
        "backup" to AppHelpTopic(
            "backup", "Backup / Export kaise karein",
            listOf(
                "Settings → Data Management kholein.",
                "CSV export se apna data share/download kar sakte hain.",
                "Reports se PDF/Excel export bhi milta hai."
            ),
            "settings", "Settings kholo",
            "Backup aapke phone ke data ki copy hai — original data app me hi rehta hai."
        ),
        "general" to AppHelpTopic(
            "general", "BizKhata kaise use karein",
            listOf(
                "Dashboard se aaj ka hisab dekhein.",
                "Daily Business se chhoti entries, Cash/UPI Book se cash hisab, Money Transfer se transfer.",
                "Customer Khata se customer due, Agents se agent payable.",
                "Kisi bhi cheez ke liye mujhse poochh sakte hain — jaise \"Aaj kitna dhandha hua?\" ya \"Cash Book kholo\"."
            ),
            "dashboard", "Dashboard kholo",
            "Saare modules ek hi database se jude hain — ek entry har jagah sahi dikhti hai."
        )
    )

    fun topicFor(key: String): AppHelpTopic = topics[key] ?: topics.getValue("general")

    fun answer(topic: AppHelpTopic): KnowledgeAnswer {
        val text = buildString {
            appendLine(topic.title + ":")
            topic.steps.forEachIndexed { i, step -> appendLine("${i + 1}. $step") }
            appendLine()
            appendLine(topic.connectsTo)
        }
        return KnowledgeAnswer(
            text.trim(), deepLinkRoute = topic.route, deepLinkLabel = topic.routeLabel
        )
    }
}

// ---------------------------------------------------------------------------
// Navigation intents (UPDATE 11 §9) — "Cash Book kholo", "Reports kholo".
// Maps natural language to a REAL NavGraph route; unknown targets return
// null (the assistant then asks which screen, instead of faking it).
// ---------------------------------------------------------------------------
object AiNavigation {
    fun routeFor(text: String): Pair<String, String>? {
        val q = AiAssistantParser.normalise(text)
        val open = q.contains("kholo") || q.contains("open") || q.contains("dikhao") ||
            q.contains("khol") || q.contains("jao") || q.contains("chalo")
        if (!open) return null
        return when {
            q.contains("cash book") -> "cash_book" to "Cash Book"
            Regex("\\bupi\\b").containsMatchIn(q) -> "upi_book" to "UPI Book"
            q.contains("money transfer") -> "money_transfer" to "Money Transfer"
            q.contains("daily") || q.contains("dhandha") -> "daily_business" to "Daily Business"
            q.contains("customer khata") || q.contains("khata") -> "khata" to "Customer Khata"
            q.contains("customer") -> "khata" to "Customer Khata"
            q.contains("agent") -> "agents" to "Agents"
            q.contains("expense") || q.contains("kharch") -> "expenses" to "Expenses"
            q.contains("maintenance") || q.contains("machine") -> "maintenance" to "Machine Maintenance"
            q.contains("receipt") -> "receipts" to "Receipts"
            q.contains("report") -> "reports" to "Reports"
            q.contains("difference") -> "difference_finder" to "Difference Finder"
            q.contains("audit") -> "audit_log" to "Audit Log"
            q.contains("recycle") -> "recycle_bin" to "Recycle Bin"
            q.contains("custom") -> "customization" to "Customization Studio"
            q.contains("setting") -> "settings" to "Settings"
            q.contains("dashboard") || q.contains("home") -> "dashboard" to "Dashboard"
            q.contains("service") -> "services" to "Services"
            q.contains("pan") -> "service/PAN" to "PAN Card"
            q.contains("aadhaar") -> "service/AADHAAR" to "Aadhaar Services"
            q.contains("xerox") -> "service/XEROX" to "Xerox"
            q.contains("printing") -> "service/PRINTING" to "Printing"
            q.contains("smart card") -> "service/SMART_CARD" to "Smart Card"
            else -> null
        }
    }
}
