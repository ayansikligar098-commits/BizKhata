package com.alfalah.business.domain

import java.text.NumberFormat
import java.util.Locale

/**
 * Chatbot — the AI Assistant (BizKhata v2 spec §AI, owner asked 2026-11-26:
 * "Chat Bot Kha Pe Hoga" — where will the chatbot be?).
 *
 * Home: a purple floating chat button on the Dashboard, a "Chatbot / AI
 * Assistant" entry in the navigation drawer, route [Routes.CHATBOT].
 * The AI Business Insights section in Reports stays where it is (reports-analysis entry).
 *
 * GOLDEN RULE: the chatbot NEVER invents numbers. Every figure it quotes
 * comes from [BusinessSnapshot], which is computed from the real Room
 * ledgers for the ACTIVE profile only (integer paise, never Double).
 * No demo data, no sample customers, no made-up amounts. When there is
 * no data it says so plainly ("Abhi koi record nahi hai").
 *
 * Two answer paths:
 *  1. Built-in responder ([BuiltInChatbotResponder]) — always available,
 *     answers factual questions straight from the snapshot. Works with
 *     no key, no internet, no cloud provider.
 *  2. Cloud AI summary (provider-independent, configured server-side
 *     — see [CloudAiClient]) — used ONLY to word the same snapshot
 *     facts more naturally, and ONLY when a backend AI service is
 *     configured. If it is unavailable, the answer falls back to (1)
 *     and says so in plain words — the user always gets a real answer.
 */

private val inFormat: NumberFormat =
    NumberFormat.getNumberInstance(Locale("en", "IN")).apply { maximumFractionDigits = 0 }

/** Format paise as integer-safe rupees: ₹1,234, or ₹1,234.50 when paise remain. */
fun formatPaise(amountPaise: Long): String {
    val sign = if (amountPaise < 0) "-" else ""
    val abs = kotlin.math.abs(amountPaise)
    val rupees = abs / 100
    val paise = abs % 100
    return if (paise == 0L) {
        "$sign₹${inFormat.format(rupees)}"
    } else {
        "$sign₹${inFormat.format(rupees)}.${paise.toString().padStart(2, '0')}"
    }
}

/** One customer who still owes money (real ledger, never a sample name). */
data class Debtor(val name: String, val duePaise: Long)

/** One agent who is still owed money (real ledger, separate from customer due). */
data class AgentOwed(val name: String, val payablePaise: Long)

/** One service's received income today. */
data class ServiceIncome(val label: String, val amountPaise: Long)

/**
 * Everything the chatbot is allowed to quote, computed from the real
 * Room ledgers for one profile. All money is paise (Long).
 * "Today" means the current UTC day, same as the Dashboard.
 */
data class BusinessSnapshot(
    val todayIncomePaise: Long = 0,
    val todayExpensesPaise: Long = 0,
    val todayProfitPaise: Long = 0,
    val cashBalancePaise: Long = 0,
    val upiBalancePaise: Long = 0,
    val customerDuePaise: Long = 0,
    val agentPayablePaise: Long = 0,
    /** Money Transfer commission today — profit. Principal is NEVER profit. */
    val moneyTransferCommissionPaise: Long = 0,
    /** Money Transfer principal moved today — shown for tracking only. */
    val moneyTransferPrincipalPaise: Long = 0,
    /** Fund received for Money Transfer (from the brother, by UPI) — all time. */
    val moneyTransferFundPaise: Long = 0,
    val topDebtors: List<Debtor> = emptyList(),
    val topAgentsOwed: List<AgentOwed> = emptyList(),
    val serviceIncomeToday: List<ServiceIncome> = emptyList(),
    val pendingJobs: Long = 0,
    val totalJobs: Long = 0,
    val totalCustomers: Long = 0
) {
    /** True when the profile has any real record at all. */
    val hasAnyData: Boolean
        get() = totalJobs > 0 || totalCustomers > 0 ||
            todayIncomePaise != 0L || todayExpensesPaise != 0L ||
            moneyTransferPrincipalPaise != 0L || moneyTransferFundPaise != 0L
}

/** The snapshot as plain facts, handed to a cloud AI (if one is
 *  configured) so it can only summarise real figures — it is told in
 *  the prompt never to invent numbers. */
fun snapshotFacts(snapshot: BusinessSnapshot): String = buildString {
    appendLine("Business facts (real saved records, paise are already converted to rupees):")
    appendLine("Today income (received): ${formatPaise(snapshot.todayIncomePaise)}")
    appendLine("Today expenses: ${formatPaise(snapshot.todayExpensesPaise)}")
    appendLine("Today profit: ${formatPaise(snapshot.todayProfitPaise)}")
    appendLine("Cash balance: ${formatPaise(snapshot.cashBalancePaise)}")
    appendLine("UPI balance: ${formatPaise(snapshot.upiBalancePaise)}")
    appendLine("Total customer due (money still to come, NOT cash): ${formatPaise(snapshot.customerDuePaise)}")
    appendLine("Total agent payable (separate ledger): ${formatPaise(snapshot.agentPayablePaise)}")
    appendLine("Money Transfer commission today (profit): ${formatPaise(snapshot.moneyTransferCommissionPaise)}")
    appendLine("Money Transfer principal moved today (NOT profit): ${formatPaise(snapshot.moneyTransferPrincipalPaise)}")
    appendLine("Money Transfer fund received from brother (all time): ${formatPaise(snapshot.moneyTransferFundPaise)}")
    appendLine("Pending jobs: ${snapshot.pendingJobs} of ${snapshot.totalJobs} total jobs")
    if (snapshot.topDebtors.isEmpty()) {
        appendLine("No customer owes money right now.")
    } else {
        appendLine("Customers who owe money:")
        snapshot.topDebtors.forEach { appendLine("- ${it.name}: ${formatPaise(it.duePaise)} due") }
    }
    if (snapshot.topAgentsOwed.isEmpty()) {
        appendLine("No agent is owed money right now.")
    } else {
        appendLine("Agents owed money:")
        snapshot.topAgentsOwed.forEach { appendLine("- ${it.name}: ${formatPaise(it.payablePaise)} payable") }
    }
    if (snapshot.serviceIncomeToday.isEmpty()) {
        appendLine("No service income recorded today.")
    } else {
        appendLine("Service income today:")
        snapshot.serviceIncomeToday.forEach { appendLine("- ${it.label}: ${formatPaise(it.amountPaise)}") }
    }
}

/**
 * Built-in responder — answers factual business questions from the
 * snapshot only. Pure Kotlin, no network, no key. Understands Hinglish /
 * English / Hindi keywords. Every branch quotes snapshot figures or says
 * plainly that there is no record yet.
 */
object BuiltInChatbotResponder {

    fun answer(question: String, snapshot: BusinessSnapshot): String {
        val q = question.trim().lowercase(Locale.ENGLISH)
        if (q.isEmpty()) return "Kuch poochiye — jaise \"Aaj ka profit kitna hai?\" ya \"Kaun paise dene wala hai?\""
        if (isGreeting(q)) return greeting(snapshot)
        if (isHelp(q)) return helpText()
        if (isMoneyTransfer(q)) return moneyTransferAnswer(snapshot)
        if (isFund(q)) return fundAnswer(snapshot)
        if (isAgent(q)) return agentAnswer(snapshot)
        if (isDue(q)) return dueAnswer(snapshot)
        if (isCash(q)) return "Cash balance: ${formatPaise(snapshot.cashBalancePaise)}." + noDataNote(snapshot)
        if (isUpi(q)) return "UPI balance: ${formatPaise(snapshot.upiBalancePaise)}." + noDataNote(snapshot)
        if (isProfit(q)) return profitAnswer(snapshot)
        if (isIncome(q)) return incomeAnswer(snapshot)
        if (isExpense(q)) return expenseAnswer(snapshot)
        if (isService(q)) return serviceAnswer(snapshot)
        if (isPending(q)) return pendingAnswer(snapshot)
        return "Samajh nahi aaya. Main ye bata sakta hoon:\n" +
            "• Aaj ka profit / income / kharcha\n" +
            "• Cash ya UPI balance\n" +
            "• Kaun customer paise dene wala hai (due)\n" +
            "• Agent ko kitna dena hai\n" +
            "• Money Transfer commission aur fund\n" +
            "Misal: \"Aaj ka profit kitna hai?\""
    }

    private fun isGreeting(q: String) =
        q == "hi" || q == "hello" || q == "hey" || q.startsWith("hi ") ||
            q.startsWith("hello") || q.contains("namaste") || q.contains("namaskar") ||
            q.contains("salam") || q.contains("good morning") || q.contains("good evening")

    private fun greeting(snapshot: BusinessSnapshot): String {
        val base = "Namaste! Main BizKhata Assistant hoon. Aap apne dukaan ke hisab ke baare me pooch sakte hain — " +
            "aaj ka profit, kis customer ka due hai, agent ko kitna dena hai, ya Money Transfer commission."
        return if (snapshot.hasAnyData) {
            "$base\n\nAaj ka profit abhi ${formatPaise(snapshot.todayProfitPaise)} hai."
        } else {
            "$base\n\nAbhi koi record nahi hai — pehle Cash Book ya kisi service se entry add karein, phir main hisab bata paunga."
        }
    }

    private fun isHelp(q: String) =
        q.contains("help") || q.contains("madad") ||
            (q.contains("kya") && (q.contains("pooch") || q.contains("bata"))) ||
            q.contains("what can you")

    private fun helpText(): String = "Main ye bata sakta hoon (aapke real record se):\n" +
        "• \"Aaj ka profit kitna hai?\"\n" +
        "• \"Aaj kitni income hui?\" / \"Aaj kharcha kitna hua?\"\n" +
        "• \"Cash balance kitna hai?\" / \"UPI balance kitna hai?\"\n" +
        "• \"Kaun paise dene wala hai?\" (customer due)\n" +
        "• \"Agent ko kitna dena hai?\"\n" +
        "• \"Money Transfer commission kitna hai?\" / \"Bhai ne kitna fund diya?\"\n" +
        "• \"Kaunsi service se kitni income hui?\""

    private fun isMoneyTransfer(q: String) =
        q.contains("money transfer") || q.contains("moneytransfer") ||
            q.contains("commission") || q.contains("mt ")

    private fun moneyTransferAnswer(snapshot: BusinessSnapshot): String {
        if (!snapshot.hasAnyData || (snapshot.moneyTransferPrincipalPaise == 0L && snapshot.moneyTransferCommissionPaise == 0L)) {
            return "Aaj Money Transfer ka koi record nahi hai — aaj koi transfer nahi hua."
        }
        return "Aaj Money Transfer:\n" +
            "• Commission (profit): ${formatPaise(snapshot.moneyTransferCommissionPaise)}\n" +
            "• Principal bheja gaya: ${formatPaise(snapshot.moneyTransferPrincipalPaise)} (ye profit NAHI hai — sirf commission profit hai)\n" +
            "• Fund (bhai se, ab tak): ${formatPaise(snapshot.moneyTransferFundPaise)}"
    }

    private fun isFund(q: String) =
        q.contains("fund") || q.contains("bhai")

    private fun fundAnswer(snapshot: BusinessSnapshot): String {
        if (snapshot.moneyTransferFundPaise == 0L) {
            return "Abhi Money Transfer fund ka koi record nahi hai — bhai se fund milne par Money Transfer page se \"Add Fund\" karein."
        }
        return "Money Transfer fund (bhai se, UPI se, ab tak kul): ${formatPaise(snapshot.moneyTransferFundPaise)}."
    }

    private fun isAgent(q: String) = q.contains("agent")

    private fun agentAnswer(snapshot: BusinessSnapshot): String {
        if (snapshot.topAgentsOwed.isEmpty()) {
            return if (snapshot.totalJobs == 0L) {
                "Abhi koi record nahi hai — koi job ya agent abhi save nahi hai."
            } else {
                "Agent ko dene ke liye abhi kuch nahi hai — total agent payable ${formatPaise(snapshot.agentPayablePaise)} hai."
            }
        }
        val lines = snapshot.topAgentsOwed.joinToString("\n") { "• ${it.name}: ${formatPaise(it.payablePaise)}" }
        return "Agent ko dena hai (kul ${formatPaise(snapshot.agentPayablePaise)}):\n$lines\n\nYe customer due se alag hisab hai — dono ko kabhi mix nahi karte."
    }

    private fun isDue(q: String) =
        q.contains("due") || q.contains("udhaar") || q.contains("udhar") ||
            q.contains("lena hai") || q.contains("dene wala") || q.contains("dene wale") ||
            (q.contains("kaun") && q.contains("paisa")) || q.contains("kisne dena") ||
            q.contains("kis ka") || q.contains("baki hai") || q.contains("baaki")

    private fun dueAnswer(snapshot: BusinessSnapshot): String {
        if (snapshot.topDebtors.isEmpty()) {
            return if (snapshot.totalJobs == 0L) {
                "Abhi koi record nahi hai — koi customer/job abhi save nahi hai."
            } else {
                "Koi customer due nahi hai — sab clear hai. Kul due ${formatPaise(snapshot.customerDuePaise)} hai."
            }
        }
        val lines = snapshot.topDebtors.joinToString("\n") { "• ${it.name}: ${formatPaise(it.duePaise)}" }
        return "Customer due (kul ${formatPaise(snapshot.customerDuePaise)}):\n$lines\n\nDue cash NAHI hai — ye paisa abhi aana baaki hai."
    }

    private fun isCash(q: String) = q.contains("cash")

    private fun isUpi(q: String) = Regex("\\bupi\\b").containsMatchIn(q)

    private fun isProfit(q: String) =
        q.contains("profit") || q.contains("munafa") || q.contains("faayda") ||
            q.contains("fayda") || q.contains("nafa")

    private fun profitAnswer(snapshot: BusinessSnapshot): String {
        if (!snapshot.hasAnyData) return "Abhi koi record nahi hai — aaj ka profit batane ke liye pehle koi entry add karein."
        return "Aaj ka profit: ${formatPaise(snapshot.todayProfitPaise)}\n" +
            "• Aaj ki income (received): ${formatPaise(snapshot.todayIncomePaise)}\n" +
            "• Aaj ka kharcha: ${formatPaise(snapshot.todayExpensesPaise)}\n" +
            "• Money Transfer commission: ${formatPaise(snapshot.moneyTransferCommissionPaise)} (sirf commission — principal profit nahi hai)"
    }

    private fun isIncome(q: String) =
        q.contains("income") || q.contains("kamai") || q.contains("aamad") ||
            q.contains("dhandha") || q.contains("dhanda") ||
            q.contains("aaj kitni") || q.contains("kitni aayi")

    private fun incomeAnswer(snapshot: BusinessSnapshot): String {
        if (!snapshot.hasAnyData) return "Abhi koi record nahi hai — aaj ki income batane ke liye pehle koi entry add karein."
        return "Aaj ki income (received): ${formatPaise(snapshot.todayIncomePaise)}."
    }

    private fun isExpense(q: String) =
        q.contains("expense") || q.contains("kharcha") || q.contains("kharch")

    private fun expenseAnswer(snapshot: BusinessSnapshot): String {
        if (!snapshot.hasAnyData) return "Abhi koi record nahi hai — aaj ka kharcha batane ke liye pehle koi entry add karein."
        return "Aaj ka kharcha: ${formatPaise(snapshot.todayExpensesPaise)}."
    }

    private fun isService(q: String) =
        q.contains("service") || q.contains("xerox") || q.contains("printing") ||
            q.contains("pan") || q.contains("aadhaar")

    private fun serviceAnswer(snapshot: BusinessSnapshot): String {
        if (snapshot.serviceIncomeToday.isEmpty()) {
            return "Aaj kisi service se income ka koi record nahi hai."
        }
        val lines = snapshot.serviceIncomeToday.joinToString("\n") { "• ${it.label}: ${formatPaise(it.amountPaise)}" }
        return "Aaj service-wise income (kul ${formatPaise(snapshot.todayIncomePaise)}):\n$lines"
    }

    private fun isPending(q: String) =
        q.contains("pending") || q.contains("kaam") || q.contains("job") ||
            q.contains("baki kaam")

    private fun pendingAnswer(snapshot: BusinessSnapshot): String {
        if (snapshot.totalJobs == 0L) return "Abhi koi record nahi hai — koi job abhi save nahi hai."
        return "Pending jobs: ${snapshot.pendingJobs} (kul ${snapshot.totalJobs} jobs)."
    }

    /** Appended when a balance is quoted but the profile has no records at all. */
    private fun noDataNote(snapshot: BusinessSnapshot): String =
        if (!snapshot.hasAnyData) " (Abhi koi record nahi hai — ye shuruaati balance hai.)" else ""
}
