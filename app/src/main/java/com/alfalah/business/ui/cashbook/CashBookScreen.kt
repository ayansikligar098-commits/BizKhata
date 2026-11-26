package com.alfalah.business.ui.cashbook

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BigButton
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Cash Book / UPI Book — one screen per account (`mode` = CASH or UPI).
 * Shows only that account's entries. Internal Cash ⇄ UPI transfers are
 * listed but never counted as income or expense.
 */
@Composable
fun CashBookScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    mode: String
) {
    val paymentMode = if (mode == "UPI") PaymentMode.UPI else PaymentMode.CASH
    val txs by repository.observeTransactions(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showTransfer by remember { mutableStateOf(false) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    val book = txs.filter { it.mode == paymentMode }
    val income = book.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
    val expense = book.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }
    // Internal transfers: money LEAVING this account (mode == this account)
    // reduces it; money ARRIVING from the other account increases it.
    // (A transfer row carries mode = the account the money left.)
    val transferOut = book.filter { it.kind == "INTERNAL_TRANSFER" }.sumOf { it.amountPaise }
    val transferIn = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode != paymentMode }.sumOf { it.amountPaise }
    val balance = income - expense - transferOut + transferIn

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle(if (paymentMode == PaymentMode.CASH) "Cash Book" else "UPI Book")
            InfoCard("Balance", formatRupees(balance))
            InfoCard("Total In", formatRupees(income))
            InfoCard("Total Out", formatRupees(expense))
            BigButton("Cash ⇄ UPI Transfer") { showTransfer = true }
        }
        if (book.isEmpty()) {
            item { EmptyState("No entries in this book yet.") }
        } else {
            items(book) { tx ->
                InfoCard(
                    tx.category,
                    formatRupees(tx.amountPaise),
                    subtitle = "${tx.kind} • ${tx.description}"
                )
            }
        }
    }

    if (showTransfer) {
        InternalTransferDialog(onDismiss = { showTransfer = false }) { amount ->
            scope.launch {
                repository.internalTransfer(profileId, (amount * 100).toLong(), paymentMode, today)
                showTransfer = false
            }
        }
    }
}

@Composable
private fun InternalTransferDialog(
    onDismiss: () -> Unit,
    onSave: (amount: Double) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cash ⇄ UPI Transfer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount (₹)") }, modifier = Modifier.fillMaxWidth())
                Text("This is an internal transfer — it is not income and not an expense. It only moves money between Cash and UPI.")
                error?.let { Text(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val value = amount.toDoubleOrNull()
                if (value == null || value <= 0) error = "Enter a valid amount."
                else onSave(value)
            }) { Text("Save Transfer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
