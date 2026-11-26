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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.FilterPills
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Cash Book / UPI Book — reference screens 3 & 4. One screen per account
 * (`mode` = CASH or UPI). Filter pills, Opening / Closing balances,
 * Total Income / Total Expense cards, transaction rows with a running
 * balance. Internal Cash ⇄ UPI transfers are listed but NEVER counted
 * as income or expense.
 *
 * Opening balance is ₹0 in v1 (opening balances are entered in Settings;
 * see README) — the closing balance is derived from the book itself.
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
    var filter by remember { mutableStateOf("All") }
    var showTransfer by remember { mutableStateOf(false) }
    var showAdd by remember { mutableStateOf(false) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    // This book shows this account's income/expense rows AND every internal
    // transfer (both directions move this account's balance).
    val book = txs.filter { it.mode == paymentMode || it.kind == "INTERNAL_TRANSFER" }
    val income = book.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
    val expense = book.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }
    // Internal transfers: money LEAVING this account (mode == this account)
    // reduces it; money ARRIVING from the other account increases it.
    val transferOut = book.filter { it.kind == "INTERNAL_TRANSFER" }.sumOf { it.amountPaise }
    val transferIn = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode != paymentMode }.sumOf { it.amountPaise }
    val balance = income - expense - transferOut + transferIn
    val opening = 0L // v1: opening balances start at 0 (see README)

    val visible = when (filter) {
        "Income", "Received" -> book.filter { it.kind == "INCOME" }
        "Expense", "Paid" -> book.filter { it.kind == "EXPENSE" }
        else -> book
    }
    // Running balance per row, computed over the WHOLE book (oldest → newest),
    // so it stays correct even when a filter hides some rows.
    val runningById = remember(book) {
        var running = opening
        val map = mutableMapOf<Long, Long>()
        book.sortedBy { it.dateEpochDay }.forEach { tx ->
            running += when (tx.kind) {
                "INCOME" -> tx.amountPaise
                "EXPENSE" -> -tx.amountPaise
                "INTERNAL_TRANSFER" -> if (tx.mode == paymentMode) -tx.amountPaise else tx.amountPaise
                else -> 0L
            }
            map[tx.id] = running
        }
        map
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAdd = true },
                containerColor = BizColors.Purple,
                contentColor = androidx.compose.ui.graphics.Color.White
            ) { Icon(Icons.Filled.Add, contentDescription = "Add entry") }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterPills(
                            options = listOf("All", "Income", "Expense", "Received", "Paid"),
                            selected = filter,
                            onSelect = { filter = it }
                        )
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("Opening", formatRupees(opening), modifier = Modifier.weight(1f))
                    StatCard("Closing", formatRupees(balance), modifier = Modifier.weight(1f))
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(
                        if (paymentMode == PaymentMode.CASH) "Total Income" else "Total Received",
                        formatRupees(income),
                        valueColor = BizColors.IncomeGreen,
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        if (paymentMode == PaymentMode.CASH) "Total Expense" else "Total Sent",
                        formatRupees(expense),
                        valueColor = BizColors.ExpenseRed,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "All entries • ${visible.size} rows",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    TextButton(onClick = { showTransfer = true }) { Text("Cash ⇄ UPI Transfer") }
                }
            }
            if (visible.isEmpty()) {
                item {
                    EmptyState(
                        "No ${if (paymentMode == PaymentMode.CASH) "cash" else "UPI"} entries yet. " +
                            "Payments you record on service pages and Money Transfer appear here automatically.",
                        actionLabel = "Add Entry",
                        onAction = { showAdd = true }
                    )
                }
            } else {
                items(visible) { tx ->
                    BizCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text(tx.description.ifBlank { tx.category }, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "${tx.category} • ${formatDay(tx.dateEpochDay)}" +
                                        if (tx.kind == "INTERNAL_TRANSFER") " • Internal transfer" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    "Balance: ${formatRupees(runningById[tx.id] ?: balance)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                (if (tx.kind == "EXPENSE" || (tx.kind == "INTERNAL_TRANSFER" && tx.mode == paymentMode)) "−" else "+") +
                                    formatRupees(tx.amountPaise),
                                fontWeight = FontWeight.Bold,
                                color = when {
                                    tx.kind == "INCOME" -> BizColors.IncomeGreen
                                    tx.kind == "EXPENSE" -> BizColors.ExpenseRed
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                }
                            )
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(72.dp)) }
        }
    }

    if (showTransfer) {
        InternalTransferDialog(onDismiss = { showTransfer = false }) { amountPaise ->
            scope.launch {
                repository.internalTransfer(profileId, amountPaise, paymentMode, today)
                showTransfer = false
            }
        }
    }

    if (showAdd) {
        AddBookEntryDialog(
            mode = paymentMode,
            onDismiss = { showAdd = false }
        ) { kind, category, amountPaise, description ->
            scope.launch {
                repository.addCashBookEntry(profileId, kind, category, amountPaise, paymentMode, today, description)
                showAdd = false
            }
        }
    }
}

@Composable
private fun InternalTransferDialog(
    onDismiss: () -> Unit,
    onSave: (amountPaise: Long) -> Unit
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
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val value = parseRupeesToPaise(amount)
                if (value == null || value <= 0) error = "Enter a valid amount."
                else onSave(value)
            }) { Text("Save Transfer") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddBookEntryDialog(
    mode: PaymentMode,
    onDismiss: () -> Unit,
    onSave: (kind: String, category: String, amountPaise: Long, description: String) -> Unit
) {
    var kind by remember { mutableStateOf("INCOME") }
    var category by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add ${if (mode == PaymentMode.CASH) "Cash" else "UPI"} Entry") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { kind = "INCOME" },
                        modifier = Modifier.weight(1f),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = if (kind == "INCOME") BizColors.IncomeGreen else MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = if (kind == "INCOME") androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.onSurface
                        )
                    ) { Text("Income") }
                    Button(
                        onClick = { kind = "EXPENSE" },
                        modifier = Modifier.weight(1f),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = if (kind == "EXPENSE") BizColors.ExpenseRed else MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = if (kind == "EXPENSE") androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.onSurface
                        )
                    ) { Text("Expense") }
                }
                OutlinedTextField(category, { category = it }, label = { Text("Category (e.g. Xerox, Rent)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(description, { description = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val value = parseRupeesToPaise(amount)
                when {
                    category.isBlank() -> error = "Enter a category."
                    value == null || value <= 0 -> error = "Enter a valid amount."
                    else -> onSave(kind, category.trim(), value, description.trim())
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
