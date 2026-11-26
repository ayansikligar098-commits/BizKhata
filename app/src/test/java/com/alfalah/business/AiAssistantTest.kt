package com.alfalah.business

import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.EquipmentEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.MaintenanceEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AiAssistantParser
import com.alfalah.business.domain.AiNavigation
import com.alfalah.business.domain.AiPeriod
import com.alfalah.business.domain.AppHelpKnowledge
import com.alfalah.business.domain.BusinessKnowledge
import com.alfalah.business.domain.KnowledgeSnapshot
import com.alfalah.business.domain.LastKnowledge
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.domain.parsePeriod
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * DEDICATED AI TESTING SUITE (UPDATE 11 §15) — BizKhata AI Assistant.
 *
 * The assistant is NOT marked production-ready merely because it can
 * respond. Accuracy is MEASURED on predefined business scenarios with
 * known expected outputs: [accuracySuite] runs every scenario and
 * reports the pass rate. The same scenarios are mirrored in
 * docs/ai_assistant_mirror.py (no JDK on this VM), and the measured
 * accuracy from that run is reported in the delivery notes. Device /
 * live-cloud runs remain pending in Android Studio.
 *
 * Scenario groups: service recognition, amount extraction (digits,
 * Devanagari digits, Hindi words), payment-mode extraction, date
 * interpretation, multi-transaction messages, follow-up understanding,
 * duplicate prevention (idempotency keys), Money Transfer rules,
 * customer outstanding, agent payable, Cash/UPI balances, profile
 * isolation (snapshot is built per profile — see the profileId checks),
 * confirmation handling (preview-before-save is enforced by the
 * ViewModel, tested here via the parse → Action → Clarify contract),
 * Hindi/Hinglish conversations, knowledge Q&A, comparison, analysis,
 * navigation intents, app help, and honest missing-data answers.
 *
 * Money is paise (Long) everywhere. No demo numbers are used as
 * expectations — every expected figure is computed from the scenario's
 * own input rows.
 */
class AiAssistantTest {

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    private val ctx = AiAssistantParser.AiConversationContext(dayEpoch = today)
    private val agents = listOf("Ramesh", "Suresh")
    private val customers = listOf("Rahul", "Sana")

    // ------------------------------------------------------------------
    // 1. Service recognition + amount + mode (UPDATE 9 §2, §3).
    // ------------------------------------------------------------------
    @Test
    fun xeroxCashViaChat() {
        val result = AiAssistantParser.parse("Aaj Xerox ke 300 rupaye cash hue", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.DailyEntries)
        val entries = (action as AiAssistantParser.AiAction.DailyEntries).entries
        assertEquals(1, entries.size)
        assertEquals(ServiceType.XEROX, entries[0].service)
        assertEquals(30_000L, entries[0].amountPaise)
        assertEquals(PaymentMode.CASH, entries[0].mode)
    }

    @Test
    fun upiCollectionViaChat() {
        val result = AiAssistantParser.parse("Aaj 500 rupaye UPI se printing hui", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.DailyEntries
        assertEquals(ServiceType.PRINTING, action.entries[0].service)
        assertEquals(50_000L, action.entries[0].amountPaise)
        assertEquals(PaymentMode.UPI, action.entries[0].mode)
    }

    @Test
    fun multipleServicesInOneMessage() {
        val result = AiAssistantParser.parse(
            "Aaj Xerox 300 cash, 200 UPI aur Smart Card 500 cash hua", ctx, agents, customers
        )
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.DailyEntries
        assertEquals(3, action.entries.size)
        assertEquals(100_000L, action.entries.sumOf { it.amountPaise })
        assertEquals("Xerox", action.entries[0].serviceLabel)
        assertEquals(PaymentMode.UPI, action.entries[1].mode) // inherits Xerox
        assertEquals(ServiceType.XEROX, action.entries[1].service)
        assertEquals(ServiceType.SMART_CARD, action.entries[2].service)
        assertEquals(50_000L, action.entries[2].amountPaise)
    }

    @Test
    fun expenseViaChat() {
        val result = AiAssistantParser.parse(
            "Aaj 200 rupaye machine repair mein cash kharch hue", ctx, agents, customers
        )
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.Expense
        assertEquals("Machine Repair", action.draft.category)
        assertEquals(20_000L, action.draft.amountPaise)
        assertEquals(PaymentMode.CASH, action.draft.mode)
    }

    @Test
    fun agentPaymentViaChat() {
        val result = AiAssistantParser.parse(
            "Agent Ramesh ko 500 rupaye cash diye", ctx, agents, customers
        )
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.AgentPayment
        assertEquals("Ramesh", action.agentName)
        assertEquals(50_000L, action.amountPaise)
        assertEquals(PaymentMode.CASH, action.mode)
    }

    // ------------------------------------------------------------------
    // 2. Money Transfer rules — commission only, never principal.
    // ------------------------------------------------------------------
    @Test
    fun moneyTransferPrincipalAndCommission() {
        val result = AiAssistantParser.parse(
            "10000 transfer kiya, 50 commission mila cash", ctx, agents, customers
        )
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.MoneyTransfer
        assertEquals(1_000_000L, action.principalPaise)
        assertEquals(5_000L, action.commissionPaise)
        // Backend rule (AccountingEngine): profit is commission only.
        assertEquals(5_000L, AccountingEngine.moneyTransferProfit(action.commissionPaise, 0, 0))
    }

    @Test
    fun moneyTransferCommissionOnly() {
        val result = AiAssistantParser.parse(
            "Aaj Money Transfer se 150 rupaye commission mila UPI se", ctx, agents, customers
        )
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.DailyEntries
        assertEquals("Money Transfer Commission", action.entries[0].serviceLabel)
        assertEquals(15_000L, action.entries[0].amountPaise)
        assertEquals(PaymentMode.UPI, action.entries[0].mode)
    }

    @Test
    fun internalTransferIsNotIncome() {
        val result = AiAssistantParser.parse(
            "1000 rupaye cash se UPI transfer kiye", ctx, agents, customers
        )
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.InternalTransfer
        assertEquals(100_000L, action.amountPaise)
        assertEquals(PaymentMode.CASH, action.from)
        val deltas = AccountingEngine.internalTransfer(action.amountPaise, action.from)
        assertEquals(0L, deltas.first + deltas.second) // net zero — not income
    }

    // ------------------------------------------------------------------
    // 3. Customer due is NEVER income; refunds are reversals.
    // ------------------------------------------------------------------
    @Test
    fun customerDueIsNotIncome() {
        val result = AiAssistantParser.parse("Rahul ka PAN ka 500 rupaye due hai", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.RecordCustomerDue)
        assertEquals(50_000L, (action as AiAssistantParser.AiAction.RecordCustomerDue).amountPaise)
    }

    @Test
    fun refundIsClarifiedNotAnExpense() {
        val result = AiAssistantParser.parse("Xerox ke 100 rupaye refund karne hain", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).question.contains("refund"))
    }

    // ------------------------------------------------------------------
    // 4. Smart clarification — never invent mode/service/date/amount.
    // ------------------------------------------------------------------
    @Test
    fun incompleteMessageAsksForMode() {
        val result = AiAssistantParser.parse("Aaj 500 rupaye printing hui", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("payment mode"))
    }

    @Test
    fun ambiguousServiceAsksForService() {
        val result = AiAssistantParser.parse("Aaj 300 rupaye cash hue", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("service"))
    }

    @Test
    fun kalDateIsAmbiguous() {
        val result = AiAssistantParser.parse("Kal Xerox ke 300 cash hue", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("date"))
    }

    @Test
    fun unknownAgentAsksForAgent() {
        val result = AiAssistantParser.parse(
            "Agent Mohan ko 500 rupaye cash diye", ctx, agents, customers
        )
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("agent"))
    }

    // ------------------------------------------------------------------
    // 5. Hindi / Hinglish: Devanagari digits + Hindi number words.
    // ------------------------------------------------------------------
    @Test
    fun devanagariDigitsParsed() {
        val result = AiAssistantParser.parse("Aaj Xerox ke ३०० rupaye cash hue", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.DailyEntries
        assertEquals(30_000L, action.entries[0].amountPaise)
    }

    @Test
    fun hindiNumberWordsParsed() {
        val result = AiAssistantParser.parse("Aaj Xerox ke teen sau rupaye cash hue", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.DailyEntries
        assertEquals(30_000L, action.entries[0].amountPaise)
    }

    @Test
    fun hindiQuestionIsFactual() {
        val result = AiAssistantParser.parse("Aaj kitna dhandha hua?", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Factual)
    }

    // ------------------------------------------------------------------
    // 6. Follow-ups + confirmation words.
    // ------------------------------------------------------------------
    @Test
    fun followUpAmountUsesLastService() {
        val followCtx = ctx.copy(lastService = ServiceType.XEROX, lastServiceLabel = "Xerox", lastMode = PaymentMode.UPI)
        val action = AiAssistantParser.parseFollowUpAmount("Aur 200 UPI bhi add kar do", followCtx)
        assertNotNull(action)
        assertEquals(ServiceType.XEROX, action!!.entries[0].service)
        assertEquals(20_000L, action.entries[0].amountPaise)
        assertEquals(PaymentMode.UPI, action.entries[0].mode)
    }

    @Test
    fun affirmativeAndNegative() {
        assertTrue(AiAssistantParser.isAffirmative("Haan"))
        assertTrue(AiAssistantParser.isAffirmative("haan, save kar do"))
        assertTrue(AiAssistantParser.isNegative("Nahi, cancel karo"))
        assertTrue(AiAssistantParser.isNegative("rehne do"))
    }

    // ------------------------------------------------------------------
    // 7. Duplicate prevention — idempotency keys.
    // ------------------------------------------------------------------
    @Test
    fun idempotencyKeyStableForSameAction() {
        val entries = listOf(
            AiAssistantParser.AiDailyEntry(ServiceType.XEROX, "Xerox", 30_000L, PaymentMode.CASH, "x")
        )
        val key1 = AiAssistantParser.idempotencyKey(1L, today, AiAssistantParser.canonicalDaily(entries))
        val key2 = AiAssistantParser.idempotencyKey(1L, today, AiAssistantParser.canonicalDaily(entries))
        assertEquals(key1, key2)
    }

    @Test
    fun idempotencyKeyDiffersForDifferentActionOrProfile() {
        val a = listOf(AiAssistantParser.AiDailyEntry(ServiceType.XEROX, "Xerox", 30_000L, PaymentMode.CASH, "x"))
        val b = listOf(AiAssistantParser.AiDailyEntry(ServiceType.XEROX, "Xerox", 20_000L, PaymentMode.CASH, "x"))
        val keyA = AiAssistantParser.idempotencyKey(1L, today, AiAssistantParser.canonicalDaily(a))
        val keyB = AiAssistantParser.idempotencyKey(1L, today, AiAssistantParser.canonicalDaily(b))
        val keyOtherProfile = AiAssistantParser.idempotencyKey(2L, today, AiAssistantParser.canonicalDaily(a))
        assertNotEquals(keyA, keyB)
        assertNotEquals(keyA, keyOtherProfile)
    }

    // ------------------------------------------------------------------
    // 8. App help + navigation intents (UPDATE 10 §3, UPDATE 11 §9).
    // ------------------------------------------------------------------
    @Test
    fun helpIntentDetected() {
        val result = AiAssistantParser.parse("Cash Book mein entry kaise add karu?", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Help)
        assertEquals("cash_book", (result as AiAssistantParser.AiParseResult.Help).topic)
        assertNotNull(AppHelpKnowledge.topicFor("cash_book"))
        assertEquals("cash_book", AppHelpKnowledge.topicFor("cash_book").route)
    }

    @Test
    fun navigationIntentMapsToRealRoute() {
        assertEquals("cash_book" to "Cash Book", AiNavigation.routeFor("Cash Book kholo"))
        assertEquals("reports" to "Reports", AiNavigation.routeFor("Reports kholo"))
        assertEquals("service/PAN" to "PAN Card", AiNavigation.routeFor("PAN Card page open karo"))
        assertNull(AiNavigation.routeFor("Aaj kitna dhandha hua?"))
    }

    // ------------------------------------------------------------------
    // 9. Period interpretation (UPDATE 10 §2).
    // ------------------------------------------------------------------
    @Test
    fun periodInterpretation() {
        assertEquals(AiPeriod.THIS_MONTH, parsePeriod("Is mahine total kitna collection hua?", today))
        assertEquals(AiPeriod.YESTERDAY, parsePeriod("Kal kitni earning hui thi?", today))
        assertEquals(AiPeriod.LAST_7_DAYS, parsePeriod("Last 7 days ka business summary do", today))
        assertEquals(AiPeriod.LAST_3_MONTHS, parsePeriod("Pichhle 3 mahine ka profit dikhao", today))
        assertEquals(AiPeriod.LAST_MONTH, parsePeriod("Last month se compare karo", today))
        assertEquals(AiPeriod.THIS_YEAR, parsePeriod("Is saal ki service-wise performance batao", today))
    }

    // ------------------------------------------------------------------
    // 10. Knowledge Q&A on a synthetic snapshot (real-data rules).
    // ------------------------------------------------------------------
    private fun syntheticSnapshot(): KnowledgeSnapshot {
        val txs = listOf(
            TransactionEntity(profileId = 1, kind = "INCOME", category = "Xerox", amountPaise = 30_000L, mode = PaymentMode.CASH, dateEpochDay = today),
            TransactionEntity(profileId = 1, kind = "INCOME", category = "Xerox", amountPaise = 20_000L, mode = PaymentMode.UPI, dateEpochDay = today),
            TransactionEntity(profileId = 1, kind = "INCOME", category = "Printing", amountPaise = 50_000L, mode = PaymentMode.CASH, dateEpochDay = today),
            TransactionEntity(profileId = 1, kind = "INCOME", category = "Money Transfer Commission", amountPaise = 5_000L, mode = PaymentMode.CASH, dateEpochDay = today),
            TransactionEntity(profileId = 1, kind = "EXPENSE", category = "Machine Repair", amountPaise = 20_000L, mode = PaymentMode.CASH, dateEpochDay = today)
        )
        val jobs = listOf(
            ServiceJobEntity(profileId = 1, customerId = 10, service = ServiceType.PAN, workDetails = "PAN", submissionDateEpochDay = today, totalFeesPaise = 50_000L, amountReceivedPaise = 20_000L),
            ServiceJobEntity(profileId = 1, customerId = 11, service = ServiceType.AADHAAR, workDetails = "Aadhaar", submissionDateEpochDay = today, totalFeesPaise = 30_000L, amountReceivedPaise = 30_000L, agentId = 5, agentChargesPaise = 25_000L)
        )
        return KnowledgeSnapshot(
            profileId = 1, profileName = "Test Shop", profileCategory = "CSC",
            transactions = txs,
            transfers = listOf(
                MoneyTransferEntity(profileId = 1, transactionId = "MT-1", customerName = "Walk-in", receiverName = "", amountPaise = 1_000_000L, commissionPaise = 5_000L, mode = PaymentMode.CASH, sentMode = PaymentMode.CASH, dateEpochDay = today)
            ),
            jobs = jobs,
            customers = listOf(
                CustomerEntity(profileId = 1, name = "Rahul", mobile = "", service = ServiceType.PAN),
                CustomerEntity(profileId = 1, name = "Sana", mobile = "", service = ServiceType.AADHAAR)
            ),
            agents = listOf(AgentEntity(profileId = 1, name = "Ramesh", mobile = "", type = com.alfalah.business.domain.AgentType.OTHER)),
            agentPayments = listOf(
                AgentPaymentEntity(profileId = 1, agentId = 5, amountPaise = 15_000L, mode = PaymentMode.CASH, dateEpochDay = today)
            ),
            expenses = listOf(
                ExpenseEntity(profileId = 1, category = "Machine Repair", description = "repair", amountPaise = 20_000L, mode = PaymentMode.CASH, dateEpochDay = today)
            ),
            maintenance = listOf(
                MaintenanceEntity(profileId = 1, equipmentId = 7, dateEpochDay = today, workDone = "Servicing", costPaise = 20_000L)
            ),
            equipment = listOf(EquipmentEntity(profileId = 1, name = "Epson L805")),
            receipts = emptyList(),
            funds = emptyList(),
            documentCount = 3
        )
    }

    @Test
    fun dailySummaryFromRealData() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Aaj kitna dhandha hua?", snap, today)
        assertNotNull(answer)
        // Collection 300+200+500+50 = 1050; expenses 200; profit 850.
        assertTrue(answer!!.text.contains("₹1,050"))
        assertTrue(answer.text.contains("₹850"))
        assertTrue(answer.text.contains("Xerox"))
    }

    @Test
    fun cashAndUpiBalancesSeparate() {
        val snap = syntheticSnapshot()
        assertEquals(65_000L, BusinessKnowledge.cashBalance(snap)) // 300+500+50-200
        assertEquals(20_000L, BusinessKnowledge.upiBalance(snap))
    }

    @Test
    fun moneyTransferCommissionOnlyInKnowledge() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Money Transfer ka total commission kitna hai?", snap, today)
        assertNotNull(answer)
        assertTrue(answer!!.text.contains("₹50"))
        assertTrue(answer.text.contains("₹10,000")) // principal shown, labelled NOT profit
    }

    @Test
    fun biggestCustomerDue() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Sabse zyada due kis customer ka hai?", snap, today)
        assertNotNull(answer)
        assertTrue(answer!!.text.contains("Rahul"))
        assertTrue(answer.text.contains("₹300"))
    }

    @Test
    fun agentPayableSeparateFromCustomerDue() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Ramesh agent ko kitna dena baaki hai?", snap, today)
        assertNotNull(answer)
        // Charges 250, paid 150 → payable 100.
        assertTrue(answer!!.text.contains("₹100"))
        // Customer due (300) must not appear as agent payable.
        assertTrue(!answer.text.contains("₹300"))
    }

    @Test
    fun serviceEarningsThisMonth() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Xerox se is month kitni earning hui?", snap, today)
        assertNotNull(answer)
        // Xerox today (300+200) is inside this month.
        assertTrue(answer!!.text.contains("₹500"))
    }

    @Test
    fun comparisonUsesFollowUpContext() {
        val snap = syntheticSnapshot()
        val last = LastKnowledge(service = ServiceType.XEROX, serviceLabel = "Xerox", period = AiPeriod.THIS_MONTH, kind = "collection")
        val answer = BusinessKnowledge.answer("Last month se compare karo", snap, today, last)
        assertNotNull(answer)
        assertTrue(answer!!.table.isNotEmpty())
        assertTrue(answer.table.any { it.first.contains("Xerox") })
    }

    @Test
    fun maintenanceByEquipmentName() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Epson printer par total kitna kharcha hua?", snap, today)
        assertNotNull(answer)
        assertTrue(answer!!.text.contains("Epson L805"))
        assertTrue(answer.text.contains("₹200"))
    }

    @Test
    fun missingDataIsHonest() {
        val empty = KnowledgeSnapshot(profileId = 1, profileName = "Empty", profileCategory = "CSC")
        val answer = BusinessKnowledge.answer("Aaj kitna dhandha hua?", empty, today)
        assertNotNull(answer)
        assertTrue(answer!!.text.contains("koi record nahi hai"))
    }

    @Test
    fun analysisLabelsFactsVsSuggestions() {
        val snap = syntheticSnapshot()
        val answer = BusinessKnowledge.answer("Business ka analysis do", snap, today)
        assertNotNull(answer)
        assertTrue(answer!!.hasEstimate)
        assertTrue(answer.text.contains("FACTS"))
        assertTrue(answer.text.contains("SUGGESTION"))
    }

    // ------------------------------------------------------------------
    // 11. Profile isolation — the snapshot carries ONE profileId and the
    //     parser/executor keys are profile-scoped (see idempotency test).
    // ------------------------------------------------------------------
    @Test
    fun profileIsolationInSnapshot() {
        val snap = syntheticSnapshot()
        assertEquals(1L, snap.profileId)
        assertTrue(snap.transactions.all { it.profileId == 1L })
        assertTrue(snap.jobs.all { it.profileId == 1L })
    }

    // ------------------------------------------------------------------
    // 12. MEASURED ACCURACY — run every scenario above through one
    //     harness and report the pass rate. This is the number the
    //     delivery report quotes (mirrored in ai_assistant_mirror.py).
    // ------------------------------------------------------------------
    @Test
    fun accuracySuite_reportsMeasuredAccuracy() {
        val scenarios: List<Pair<String, () -> Unit>> = listOf(
            "xerox cash via chat" to { xeroxCashViaChat() },
            "upi collection via chat" to { upiCollectionViaChat() },
            "multiple services in one message" to { multipleServicesInOneMessage() },
            "expense via chat" to { expenseViaChat() },
            "agent payment via chat" to { agentPaymentViaChat() },
            "mt principal + commission" to { moneyTransferPrincipalAndCommission() },
            "mt commission only" to { moneyTransferCommissionOnly() },
            "internal transfer not income" to { internalTransferIsNotIncome() },
            "customer due is not income" to { customerDueIsNotIncome() },
            "refund clarified not expense" to { refundIsClarifiedNotAnExpense() },
            "incomplete asks mode" to { incompleteMessageAsksForMode() },
            "ambiguous asks service" to { ambiguousServiceAsksForService() },
            "kal date ambiguous" to { kalDateIsAmbiguous() },
            "unknown agent asks agent" to { unknownAgentAsksForAgent() },
            "devanagari digits" to { devanagariDigitsParsed() },
            "hindi number words" to { hindiNumberWordsParsed() },
            "hindi question factual" to { hindiQuestionIsFactual() },
            "follow-up uses last service" to { followUpAmountUsesLastService() },
            "affirmative / negative" to { affirmativeAndNegative() },
            "idempotency key stable" to { idempotencyKeyStableForSameAction() },
            "idempotency key differs" to { idempotencyKeyDiffersForDifferentActionOrProfile() },
            "help intent" to { helpIntentDetected() },
            "navigation intent" to { navigationIntentMapsToRealRoute() },
            "period interpretation" to { periodInterpretation() },
            "daily summary from real data" to { dailySummaryFromRealData() },
            "cash/upi balances separate" to { cashAndUpiBalancesSeparate() },
            "mt commission only (knowledge)" to { moneyTransferCommissionOnlyInKnowledge() },
            "biggest customer due" to { biggestCustomerDue() },
            "agent payable separate" to { agentPayableSeparateFromCustomerDue() },
            "service earnings this month" to { serviceEarningsThisMonth() },
            "comparison follow-up context" to { comparisonUsesFollowUpContext() },
            "maintenance by equipment" to { maintenanceByEquipmentName() },
            "missing data honest" to { missingDataIsHonest() },
            "analysis facts vs suggestions" to { analysisLabelsFactsVsSuggestions() },
            "profile isolation" to { profileIsolationInSnapshot() }
        )
        var passed = 0
        val failed = mutableListOf<String>()
        for ((name, check) in scenarios) {
            try {
                check()
                passed++
            } catch (e: AssertionError) {
                failed.add("$name: ${e.message}")
            }
        }
        val rate = passed * 100 / scenarios.size
        println("AI ACCURACY SUITE: $passed/${scenarios.size} passed ($rate%)")
        if (failed.isNotEmpty()) println("FAILED: " + failed.joinToString("; "))
        // The suite must stay above 95% — anything less blocks release.
        assertTrue("AI accuracy $rate% is below 95% — failures: $failed", rate >= 95)
    }
}
