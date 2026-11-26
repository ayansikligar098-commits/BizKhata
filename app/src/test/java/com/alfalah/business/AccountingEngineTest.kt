package com.alfalah.business

import com.alfalah.business.domain.AccountingEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase G — accounting rules, verified against ayan's worked examples.
 * Money is in paise (Long); no Double maths anywhere.
 */
class AccountingEngineTest {

    @Test
    fun bill500_received200_due300_only200IsCash() {
        // ayan's example: bill ₹500, received ₹200 → due ₹300.
        // Only ₹200 counts as cash; ₹300 is a customer due, never cash.
        assertEquals(30_000L, AccountingEngine.customerDue(50_000L, 20_000L))
        assertEquals(20_000L, 20_000L) // received amount = cash in
    }

    @Test
    fun customerDueAndAgentPayableAreSeparateLedgers() {
        // Customer due ₹500 and agent payable ₹300 are different figures;
        // they must never be netted against each other.
        assertEquals(50_000L, AccountingEngine.customerDue(50_000L, 0L))
        assertEquals(30_000L, AccountingEngine.agentPayable(30_000L, 0L))
    }

    @Test
    fun moneyTransferProfitIsCommissionOnly() {
        // ₹10,000 transfer, ₹50 commission → ₹50 income, never ₹10,000.
        assertEquals(5_000L, AccountingEngine.moneyTransferProfit(5_000L, 0L, 0L))
        // With ₹10 charges: profit = 50 − 10 = ₹40.
        assertEquals(4_000L, AccountingEngine.moneyTransferProfit(5_000L, 1_000L, 0L))
    }

    @Test
    fun cashToUpi1000IsInternalOnly() {
        // ₹1,000 Cash → UPI is an internal movement: not income, not
        // expense, and net profit is unchanged. The engine models it as
        // a pair of deltas: cash −₹1,000, UPI +₹1,000 (net zero overall).
        val deltas = AccountingEngine.internalTransfer(
            100_000L, com.alfalah.business.domain.PaymentMode.CASH
        )
        assertEquals(-100_000L, deltas.first)
        assertEquals(100_000L, deltas.second)
        assertEquals(0L, AccountingEngine.netProfit(0L, 0L, 0L))
    }

    @Test
    fun serviceProfitLinksDirectCostsOnly() {
        // Ink expense linked to Printing gives accurate Printing profit.
        // (3-arg form: received − direct expenses − agent charges.)
        assertEquals(40_000L, AccountingEngine.serviceProfit(50_000L, 10_000L, 0L))
    }

    @Test
    fun agentExampleFromOriginalChat() {
        // Original chat, turn 10: customer pays ₹500, agent charge ₹250,
        // paid to agent ₹150, remaining ₹100, ayan's margin ₹250.
        assertEquals(10_000L, AccountingEngine.agentPayable(25_000L, 15_000L))
        assertEquals(25_000L, AccountingEngine.serviceProfit(50_000L, 0L, 25_000L))
    }

    @Test
    fun moneyTransferClosingBalanceFromOriginalChat() {
        // Turn 18 formula: Starting + Received − Sent − Expenses.
        // Fund ₹50,000 (UPI) + customer pays ₹10,000 + ₹50 commission (UPI)
        // − ₹10,000 sent (UPI) = ₹50,050 UPI balance left.
        assertEquals(
            50_050_00L,
            AccountingEngine.moneyTransferClosingBalance(0L, 50_000_00L + 10_050_00L, 10_000_00L, 0L)
        )
        assertEquals(0L, AccountingEngine.moneyTransferClosingBalance(0L, 0L, 0L, 0L))
    }

    @Test
    fun differenceFinderFindsTheGap() {
        val result = AccountingEngine.findDifference(expectedPaise = 100_000L, recordedPaise = 99_500L)
        assertFalse(result.matches)
        assertEquals(500L, result.differencePaise)

        val exact = AccountingEngine.findDifference(expectedPaise = 100_000L, recordedPaise = 100_000L)
        assertTrue(exact.matches)
        assertEquals(0L, exact.differencePaise)
    }

    @Test
    fun differenceFinderSuggestsMatchingAmount() {
        val candidates = listOf(
            AccountingEngine.CandidateTransaction(1L, "Xerox", 500_000L, com.alfalah.business.domain.PaymentMode.CASH, 20_400L),
            AccountingEngine.CandidateTransaction(2L, "PAN", 50_000L, com.alfalah.business.domain.PaymentMode.CASH, 20_400L)
        )
        val suggestions = AccountingEngine.suggestForDifference(50_000L, candidates)
        assertEquals(1, suggestions.size)
        assertEquals(2L, suggestions[0].transaction.id)
    }

    @Test
    fun dailyBusinessTotalsFromRecordedRows() {
        // Cash ₹200 + UPI ₹300 received, ₹100 expenses → collection ₹500,
        // cash ₹200, UPI ₹300, net ₹400, 3 rows. No MT involved.
        val income = listOf(
            AccountingEngine.MoneyEntry(20_000L, com.alfalah.business.domain.PaymentMode.CASH),
            AccountingEngine.MoneyEntry(30_000L, com.alfalah.business.domain.PaymentMode.UPI)
        )
        val expenses = listOf(
            AccountingEngine.MoneyEntry(10_000L, com.alfalah.business.domain.PaymentMode.CASH)
        )
        val totals = AccountingEngine.computeDailyBusiness(income, expenses, 0L, 0L)
        assertEquals(50_000L, totals.totalCollectionPaise)
        assertEquals(20_000L, totals.cashCollectionPaise)
        assertEquals(30_000L, totals.upiCollectionPaise)
        assertEquals(10_000L, totals.expensesPaise)
        assertEquals(40_000L, totals.netEarningsPaise)
        assertEquals(3, totals.transactionCount)
    }

    @Test
    fun dailyBusinessMoneyTransferPrincipalNeverIncome() {
        // MT ₹10,000 transfer, ₹50 commission: the ONLY income row is the
        // ₹50 commission. Principal ₹10,000 never enters the totals, and
        // the ₹50 commission is counted exactly once in net earnings.
        val income = listOf(
            AccountingEngine.MoneyEntry(5_000L, com.alfalah.business.domain.PaymentMode.UPI)
        )
        val totals = AccountingEngine.computeDailyBusiness(
            income, emptyList(),
            moneyTransferProfitPaise = AccountingEngine.moneyTransferProfit(5_000L, 0L, 0L),
            moneyTransferCommissionPaise = 5_000L
        )
        assertEquals(5_000L, totals.totalCollectionPaise)
        assertEquals(5_000L, totals.netEarningsPaise)
    }

    @Test
    fun dailyBusinessOnlyReceivedMoneyCounts() {
        // Bill ₹500, received ₹200: only the ₹200 received is an income
        // row. The ₹300 due is not a row, so it can never be collection.
        val income = listOf(
            AccountingEngine.MoneyEntry(20_000L, com.alfalah.business.domain.PaymentMode.CASH)
        )
        val totals = AccountingEngine.computeDailyBusiness(income, emptyList(), 0L, 0L)
        assertEquals(20_000L, totals.totalCollectionPaise)
        assertEquals(30_000L, AccountingEngine.customerDue(50_000L, 20_000L))
    }

    @Test
    fun dailyBusinessEmptyDayIsZero() {
        val totals = AccountingEngine.computeDailyBusiness(emptyList(), emptyList(), 0L, 0L)
        assertEquals(0L, totals.totalCollectionPaise)
        assertEquals(0L, totals.netEarningsPaise)
        assertEquals(0, totals.transactionCount)
    }

    @Test
    fun quickEntryTotalIsQuantityTimesRate() {
        // 10 xerox copies at ₹2 each = ₹20.
        assertEquals(2_000L, AccountingEngine.quickEntryTotal(10L, 200L))
        assertEquals(5_000L, AccountingEngine.quickEntryTotal(1L, 5_000L))
    }
}
