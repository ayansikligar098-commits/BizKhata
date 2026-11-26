package com.alfalah.business.domain

import kotlin.math.abs

/**
 * The accounting engine. Pure functions only — no Android, no database —
 * so every rule can be unit-tested (see AccountingEngineTest).
 *
 * NON-NEGOTIABLE RULES (Record A, Sections 22/25/27):
 *  1. Cash and UPI are separate accounts. Never merge them.
 *  2. Customer outstanding (due) is NEVER counted as received cash.
 *  3. Agent payable is a separate ledger from customer receivable.
 *  4. Money Transfer profit = commission only. NEVER the transferred principal.
 *  5. Cash-to-UPI / UPI-to-Cash transfers are INTERNAL transfers, not income/expense.
 *  6. Billing, received, due, balance and profit are different figures.
 *
 * All money is stored as paise (Long) to avoid float rounding errors.
 */
object AccountingEngine {

    /** A single money movement. [mode] is the account it touches. */
    data class MoneyEntry(val amountPaise: Long, val mode: PaymentMode)

    /** Cash balance = opening cash + cash received − cash paid (incl. expenses paid in cash). */
    fun cashBalance(openingCashPaise: Long, received: List<MoneyEntry>, paid: List<MoneyEntry>): Long {
        val inCash = received.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
        val outCash = paid.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
        return openingCashPaise + inCash - outCash
    }

    /** UPI balance — same rule, UPI account only. */
    fun upiBalance(openingUpiPaise: Long, received: List<MoneyEntry>, paid: List<MoneyEntry>): Long {
        val inUpi = received.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
        val outUpi = paid.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
        return openingUpiPaise + inUpi - outUpi
    }

    /** Customer due. Example from the brief: bill ₹500, received ₹200 → due ₹300.
     *  Only the ₹200 received ever touches a cash/UPI balance. */
    fun customerDue(totalFeesPaise: Long, amountReceivedPaise: Long): Long =
        (totalFeesPaise - amountReceivedPaise).coerceAtLeast(0)

    /** Agent payable. Example: charges ₹800, paid ₹500 → payable ₹300.
     *  Kept in its own ledger — never netted against customer receivable. */
    fun agentPayable(totalChargesPaise: Long, amountPaidPaise: Long): Long =
        (totalChargesPaise - amountPaidPaise).coerceAtLeast(0)

    /**
     * Money Transfer profit. Example: transfer ₹10,000, commission ₹50 →
     * profit is the ₹50 commission (minus transfer charges and MT expenses),
     * NEVER the ₹10,000 principal.
     */
    fun moneyTransferProfit(
        commissionPaise: Long,
        transferChargesPaise: Long,
        moneyTransferExpensesPaise: Long
    ): Long = commissionPaise - transferChargesPaise - moneyTransferExpensesPaise

    /** Money Transfer closing balance (original chat, turn 18):
     *  Starting + Received − Sent − Expenses. Fund received from the
     *  brother is part of Received, in the account it arrived in
     *  (usually UPI). One balance per account — Cash and UPI separately. */
    fun moneyTransferClosingBalance(
        startingPaise: Long,
        receivedPaise: Long,
        sentPaise: Long,
        expensesPaise: Long
    ): Long = startingPaise + receivedPaise - sentPaise - expensesPaise

    /** An internal Cash ⇄ UPI transfer. It moves money between the two
     *  accounts and is NOT income and NOT an expense. Returns the pair
     *  (cashDelta, upiDelta) to apply to the two balances. */
    fun internalTransfer(amountPaise: Long, from: PaymentMode): Pair<Long, Long> = when (from) {
        PaymentMode.CASH -> Pair(-amountPaise, amountPaise) // cash → UPI
        PaymentMode.UPI -> Pair(amountPaise, -amountPaise)  // UPI → cash
        PaymentMode.OTHER -> Pair(0L, 0L)
    }

    /** Service profit = amount actually received − direct expenses − agent charges.
     *  Outstanding (due) is NOT included: it is not money received. */
    fun serviceProfit(
        amountReceivedPaise: Long,
        directExpensesPaise: Long,
        agentChargesPaise: Long
    ): Long = amountReceivedPaise - directExpensesPaise - agentChargesPaise

    /** Net profit for a day/period = total received income − total expenses.
     *  Money Transfer contributes only its commission-based profit (rule 4). */
    fun netProfit(
        serviceIncomeReceivedPaise: Long,
        moneyTransferProfitPaise: Long,
        expensesPaise: Long
    ): Long = serviceIncomeReceivedPaise + moneyTransferProfitPaise - expensesPaise

    // -----------------------------------------------------------------------
    // Daily Business (Daily Dhandha) — derived totals, single source of truth.
    // -----------------------------------------------------------------------

    /** Totals for one Daily Business period, derived ONLY from recorded
     *  income/expense rows. Starts at zero on a fresh install — no demo. */
    data class DailyBusinessTotals(
        /** All money actually received (Cash + UPI + Other modes). MT
         *  principal is never in here — only the commission income row. */
        val totalCollectionPaise: Long = 0,
        val cashCollectionPaise: Long = 0,
        val upiCollectionPaise: Long = 0,
        val otherCollectionPaise: Long = 0,
        val expensesPaise: Long = 0,
        /** Net earnings = collection − expenses, with MT profit counted
         *  once (commission only, never principal). */
        val netEarningsPaise: Long = 0,
        /** Number of income + expense rows in the period. */
        val transactionCount: Int = 0
    )

    /**
     * Daily Business totals from the books.
     *
     * [income] — the period's INCOME rows (job payments, MT commission
     * rows, cash-book income, quick daily entries). [expenses] — the
     * period's EXPENSE rows. [moneyTransferProfitPaise] — commission-based
     * MT profit for the period (from the MT ledger). [moneyTransferCommissionPaise]
     * — the MT commission already inside [income] as income rows: it is
     * subtracted once before the commission-based profit is added, so the
     * ₹50 commission on a ₹10,000 transfer is counted exactly once and the
     * ₹10,000 principal never is.
     */
    fun computeDailyBusiness(
        income: List<MoneyEntry>,
        expenses: List<MoneyEntry>,
        moneyTransferProfitPaise: Long,
        moneyTransferCommissionPaise: Long
    ): DailyBusinessTotals {
        val total = income.sumOf { it.amountPaise }
        val cash = income.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
        val upi = income.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
        val other = total - cash - upi
        val expenseTotal = expenses.sumOf { it.amountPaise }
        val serviceIncome = total - moneyTransferCommissionPaise
        return DailyBusinessTotals(
            totalCollectionPaise = total,
            cashCollectionPaise = cash,
            upiCollectionPaise = upi,
            otherCollectionPaise = other,
            expensesPaise = expenseTotal,
            netEarningsPaise = netProfit(serviceIncome, moneyTransferProfitPaise, expenseTotal),
            transactionCount = income.size + expenses.size
        )
    }

    /**
     * Quick Daily Entry line total: quantity × rate, integer paise (Long).
     * Quantity is capped so a typo can never overflow the multiplication.
     */
    fun quickEntryTotal(quantity: Long, ratePaise: Long): Long {
        require(quantity in 1..100_000) { "Quantity must be between 1 and 100,000" }
        require(ratePaise in 0..1_000_000_000L) { "Rate is out of range" }
        return quantity * ratePaise
    }

    /** Result of the Difference Finder. */
    data class DifferenceResult(
        val expectedPaise: Long,
        val recordedPaise: Long,
        val differencePaise: Long // expected − recorded; 0 means the hisab matches
    ) {
        val matches: Boolean get() = differencePaise == 0L
    }

    fun findDifference(expectedPaise: Long, recordedPaise: Long): DifferenceResult =
        DifferenceResult(expectedPaise, recordedPaise, expectedPaise - recordedPaise)

    /**
     * Suggest transactions that MIGHT explain a difference. A suggestion is
     * never treated as the mistake and never changes any entry — the user
     * decides. Matches by exact amount, or by amount + payment mode, or by
     * amount + date. Sorted: exact-amount matches first.
     */
    data class CandidateTransaction(
        val id: Long,
        val label: String,
        val amountPaise: Long,
        val mode: PaymentMode,
        val dateEpochDay: Long
    )

    data class DifferenceSuggestion(
        val transaction: CandidateTransaction,
        val reason: String // plain words, e.g. "Same amount as the difference"
    )

    fun suggestForDifference(
        differencePaise: Long,
        transactions: List<CandidateTransaction>
    ): List<DifferenceSuggestion> {
        if (differencePaise == 0L) return emptyList()
        val target = abs(differencePaise)
        val exact = transactions.filter { abs(it.amountPaise) == target }
            .map { DifferenceSuggestion(it, "Same amount as the difference (₹${target / 100})") }
        val sameDay = transactions.filter {
            abs(it.amountPaise) == target && it.dateEpochDay == todayEpochDay()
        }.map { DifferenceSuggestion(it, "Same amount and same day as the difference") }
        // De-duplicate (a transaction can appear in both lists), exact first.
        return (exact + sameDay).distinctBy { it.transaction.id }
    }

    /** Today's date as epoch days (UTC). Kept in one place for testability. */
    fun todayEpochDay(): Long =
        java.time.LocalDate.now(java.time.ZoneOffset.UTC).toEpochDay()
}
