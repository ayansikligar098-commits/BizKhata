package com.alfalah.business.ui.cashbook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors

/**
 * Difference Finder — reference screen 12. Tabs Cash / UPI / MT / Service.
 * Enter the expected balance; the app compares it with the recorded
 * balance from the chosen ledger and shows the difference. "Find Possible
 * Causes" suggests transactions that might explain it (same amount /
 * same day, possible duplicate) — a suggestion is never the answer and
 * NEVER changes any entry. The user investigates and corrects manually
 * (with an audit trail).
 */
@Composable
fun DifferenceFinderScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val txs by repository.observeTransactions(profileId).collectAsState(initial = emptyList())
    val transfers by repository.observeMoneyTransfers(profileId).collectAsState(initial = emptyList())
    val jobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    var tab by remember { mutableStateOf(0) }
    val scopes = listOf("Cash", "UPI", "MT", "Service")
    val scope = scopes[tab]
    var expectedText by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<AccountingEngine.DifferenceResult?>(null) }
    var suggestions by remember { mutableStateOf<List<AccountingEngine.DifferenceSuggestion>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var searched by remember { mutableStateOf(false) }

    // Recorded balance for the chosen scope, computed from real entries.
    val cashIn = txs.filter { it.mode == PaymentMode.CASH && it.kind == "INCOME" }.sumOf { it.amountPaise }
    val cashOut = txs.filter { it.mode == PaymentMode.CASH && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
    val upiIn = txs.filter { it.mode == PaymentMode.UPI && it.kind == "INCOME" }.sumOf { it.amountPaise }
    val upiOut = txs.filter { it.mode == PaymentMode.UPI && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
    val cashToUpi = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
    val upiToCash = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
    val cashBalance = cashIn - cashOut - cashToUpi + upiToCash
    val upiBalance = upiIn - upiOut + cashToUpi - upiToCash
    val mtNet = transfers.sumOf { it.commissionPaise - it.chargesPaise }
    val serviceDue = jobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }

    val recorded = when (scope) {
        "Cash" -> cashBalance
        "UPI" -> upiBalance
        "MT" -> mtNet
        "Service" -> serviceDue
        else -> cashBalance + upiBalance
    }
    val recordedLabel = when (scope) {
        "Cash" -> "App Recorded Cash Balance"
        "UPI" -> "App Recorded UPI Balance"
        "MT" -> "App Recorded MT Profit (commission only)"
        "Service" -> "App Recorded Customer Due"
        else -> "App Recorded Balance"
    }

    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            scopes.forEachIndexed { i, label ->
                Tab(
                    selected = tab == i,
                    onClick = { tab = i; result = null; suggestions = emptyList(); searched = false },
                    text = { Text(label) }
                )
            }
        }
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                BizCard(Modifier.fillMaxWidth()) {
                    Text(
                        when (scope) {
                            "Cash" -> "Cash Reconciliation"
                            "UPI" -> "UPI Reconciliation"
                            "MT" -> "Money Transfer Reconciliation"
                            else -> "Service Due Reconciliation"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = expectedText,
                        onValueChange = { expectedText = it },
                        label = { Text("Expected Balance (₹) — count your cash / check UPI app") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    ReconcileRow("Expected Balance", expectedText.ifBlank { "—" })
                    ReconcileRow(recordedLabel, formatRupees(recorded))
                    result?.let { r ->
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Difference",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            formatRupees(r.differencePaise),
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (r.matches) BizColors.IncomeGreen else BizColors.ExpenseRed
                        )
                        Text(
                            if (r.matches) "Hisab matches — no difference." else "Expected − Recorded. Check the possible causes below.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    error?.let { Text(it, color = BizColors.ExpenseRed) }
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton("Find Possible Causes") {
                        val expected = parseRupeesToPaise(expectedText)
                        if (expected == null) {
                            error = "Enter a valid expected balance."
                        } else {
                            error = null
                            searched = true
                            val diff = AccountingEngine.findDifference(expected, recorded)
                            result = diff
                            val candidates = when (scope) {
                                "MT" -> transfers.map {
                                    AccountingEngine.CandidateTransaction(
                                        it.id, "MT ${it.transactionId} — ${it.customerName}",
                                        it.commissionPaise, it.mode, it.dateEpochDay
                                    )
                                }
                                "Cash" -> txs.filter { it.mode == PaymentMode.CASH }.map {
                                    AccountingEngine.CandidateTransaction(it.id, "${it.category} — ${it.description}", it.amountPaise, it.mode, it.dateEpochDay)
                                }
                                "UPI" -> txs.filter { it.mode == PaymentMode.UPI }.map {
                                    AccountingEngine.CandidateTransaction(it.id, "${it.category} — ${it.description}", it.amountPaise, it.mode, it.dateEpochDay)
                                }
                                "Service" -> jobs.map {
                                    AccountingEngine.CandidateTransaction(
                                        it.id, "${it.service.label} job #${it.id} — ${it.workDetails}",
                                        AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise),
                                        PaymentMode.CASH, it.submissionDateEpochDay
                                    )
                                }
                                else -> txs.map {
                                    AccountingEngine.CandidateTransaction(it.id, "${it.category} — ${it.description}", it.amountPaise, it.mode, it.dateEpochDay)
                                }
                            }
                            suggestions = AccountingEngine.suggestForDifference(diff.differencePaise, candidates)
                        }
                    }
                }
            }
            if (searched && result != null && !result!!.matches) {
                item {
                    Text(
                        "Possible Matches (${suggestions.size})",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "These are only suggestions. Check them yourself; nothing has been changed. " +
                            "Common causes: an unmatched income, a duplicate entry, or an incorrect amount.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (suggestions.isEmpty()) {
                    item {
                        EmptyState(
                            "No transaction matches this amount. Check for a missing entry, a duplicate entry, " +
                                "a wrong amount, a wrong payment mode or a wrong date."
                        )
                    }
                } else {
                    items(suggestions) { s ->
                        BizCard(Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column(Modifier.weight(1f)) {
                                    Text(s.transaction.label, fontWeight = FontWeight.SemiBold)
                                    Text(s.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(
                                        causeHint(s.transaction, txs),
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                                Text(formatRupees(s.transaction.amountPaise), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun ReconcileRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label)
        Text(value, fontWeight = FontWeight.SemiBold)
    }
}

/** Classify a matching transaction into a likely cause, from the books. */
private fun causeHint(
    tx: AccountingEngine.CandidateTransaction,
    all: List<com.alfalah.business.data.entity.TransactionEntity>
): String {
    val sameAmount = all.count { it.amountPaise == tx.amountPaise }
    return when {
        sameAmount > 1 -> "Possible cause: Duplicate Entry — ${sameAmount} entries have this amount."
        tx.amountPaise > 0 -> "Possible cause: Unmatched Income or Incorrect Amount — verify this entry."
        else -> "Possible cause: check this entry's amount and payment mode."
    }
}
