package com.alfalah.business.ui.cashbook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise

/**
 * Difference Finder (Hisab Difference Finder).
 * Enter the expected balance; the app compares it with the recorded
 * balance from the chosen ledger and shows the difference.
 * It SUGGESTS transactions that might explain it (same amount / same day)
 * — a suggestion is never the answer and NEVER changes any entry.
 * The user investigates and corrects manually (with an audit trail).
 */
@Composable
fun DifferenceFinderScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val txs by repository.observeTransactions(profileId).collectAsState(initial = emptyList())
    val transfers by repository.observeMoneyTransfers(profileId).collectAsState(initial = emptyList())
    var scope by remember { mutableStateOf("Cash") }
    var expectedText by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<AccountingEngine.DifferenceResult?>(null) }
    var suggestions by remember { mutableStateOf<List<AccountingEngine.DifferenceSuggestion>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

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

    val recorded = when (scope) {
        "Cash" -> cashBalance
        "UPI" -> upiBalance
        "Money Transfer" -> mtNet
        else -> cashBalance + upiBalance // General
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            SectionTitle("Difference Finder")
            Text("Enter the balance you expect. The app compares it with the recorded balance and shows the difference.")
            androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("General", "Cash", "UPI", "Money Transfer").forEach { s ->
                    Button(onClick = { scope = s; result = null; suggestions = emptyList() }) {
                        Text(if (scope == s) "✓ $s" else s)
                    }
                }
            }
            InfoCard("Recorded Balance ($scope)", formatRupees(recorded))
            OutlinedTextField(
                value = expectedText,
                onValueChange = { expectedText = it },
                label = { Text("Expected Balance (₹)") },
                modifier = Modifier.fillMaxWidth()
            )
            error?.let { Text(it) }
            Button(
                onClick = {
                    val expected = parseRupeesToPaise(expectedText)
                    if (expected == null) {
                        error = "Enter a valid expected balance."
                    } else {
                        error = null
                        val diff = AccountingEngine.findDifference(expected, recorded)
                        result = diff
                        val candidates = when (scope) {
                            "Money Transfer" -> transfers.map {
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
                            else -> txs.map {
                                AccountingEngine.CandidateTransaction(it.id, "${it.category} — ${it.description}", it.amountPaise, it.mode, it.dateEpochDay)
                            }
                        }
                        suggestions = AccountingEngine.suggestForDifference(diff.differencePaise, candidates)
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Find Difference") }
        }
        result?.let { r ->
            item {
                InfoCard(
                    if (r.matches) "Hisab matches — no difference" else "Difference Found",
                    formatRupees(r.differencePaise),
                    subtitle = "Expected ${formatRupees(r.expectedPaise)} • Recorded ${formatRupees(r.recordedPaise)}"
                )
                if (!r.matches) {
                    Text("Possible matching transactions — these are only suggestions. Check them yourself; nothing has been changed.")
                }
            }
            if (!r.matches) {
                if (suggestions.isEmpty()) {
                    item { Text("No transaction matches this amount. Check for a missing entry, a duplicate entry, a wrong amount, a wrong payment mode or a wrong date.") }
                } else {
                    items(suggestions) { s ->
                        InfoCard(
                            s.transaction.label,
                            formatRupees(s.transaction.amountPaise),
                            subtitle = s.reason
                        )
                    }
                }
            }
        }
    }
}
