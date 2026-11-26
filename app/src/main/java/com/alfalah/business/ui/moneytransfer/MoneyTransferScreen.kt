package com.alfalah.business.ui.moneytransfer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.entity.MoneyTransferClosingEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Money Transfer — reference screen 5. Tabs: Overview / Transactions /
 * Settlement. Its OWN ledger, never mixed with shop accounting (§18).
 * Profit = commission only. The transferred principal is tracked, never
 * counted as income. Fund: ayan's BROTHER gives the fund, by UPI.
 * Closing: Starting + Received − Sent − Expenses (original chat, turn 18).
 */
@Composable
fun MoneyTransferScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val transfers by repository.observeMoneyTransfers(profileId).collectAsState(initial = emptyList())
    val funds by repository.observeFunds(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var showAdd by remember { mutableStateOf(false) }
    var showAddFund by remember { mutableStateOf(false) }
    var closingSaved by remember { mutableStateOf(false) }
    var closingError by remember { mutableStateOf<String?>(null) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    val todayList = transfers.filter { it.dateEpochDay == today }
    val cashReceived = todayList.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise + it.commissionPaise }
    val cashSent = todayList.filter { it.sentMode == PaymentMode.CASH }.sumOf { it.amountPaise }
    val upiReceived = todayList.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise + it.commissionPaise }
    val upiSent = todayList.filter { it.sentMode == PaymentMode.UPI }.sumOf { it.amountPaise }
    val commissionToday = todayList.sumOf { it.commissionPaise }
    val chargesToday = todayList.sumOf { it.chargesPaise }
    val profitToday = AccountingEngine.moneyTransferProfit(commissionToday, chargesToday, 0)
    val principalToday = todayList.sumOf { it.amountPaise }

    // MT closing balances (all time, per account): fund + received − sent.
    val totalFund = funds.sumOf { it.amountPaise }
    val fundCash = funds.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
    val fundUpi = funds.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
    val allCashReceived = transfers.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise + it.commissionPaise }
    val allCashSent = transfers.filter { it.sentMode == PaymentMode.CASH }.sumOf { it.amountPaise }
    val allUpiReceived = transfers.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise + it.commissionPaise }
    val allUpiSent = transfers.filter { it.sentMode == PaymentMode.UPI }.sumOf { it.amountPaise }
    val mtCashBalance = AccountingEngine.moneyTransferClosingBalance(0, fundCash + allCashReceived, allCashSent, 0)
    val mtUpiBalance = AccountingEngine.moneyTransferClosingBalance(0, fundUpi + allUpiReceived, allUpiSent, 0)

    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            listOf("Overview", "Transactions", "Settlement").forEachIndexed { i, label ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label) })
            }
        }
        when (tab) {
            0 -> OverviewTab(
                cashReceived = cashReceived, cashSent = cashSent,
                commissionToday = commissionToday, profitToday = profitToday,
                principalToday = principalToday,
                mtCashBalance = mtCashBalance, mtUpiBalance = mtUpiBalance,
                totalFund = totalFund,
                onNewTransfer = { showAdd = true },
                onHistory = { tab = 1 },
                onClosing = { tab = 2 },
                onAddFund = { showAddFund = true }
            )
            1 -> TransactionsTab(transfers = transfers, onAdd = { showAdd = true })
            2 -> SettlementTab(
                today = today,
                fundReceivedToday = funds.filter { it.dateEpochDay == today }.sumOf { it.amountPaise },
                cashReceived = cashReceived, cashSent = cashSent,
                upiReceived = upiReceived, upiSent = upiSent,
                mtCashBalance = mtCashBalance, mtUpiBalance = mtUpiBalance,
                profitToday = profitToday,
                saved = closingSaved, error = closingError,
                onSaveClosing = {
                    scope.launch {
                        try {
                            repository.closeMoneyTransferDay(
                                MoneyTransferClosingEntity(
                                    profileId = profileId, dateEpochDay = today,
                                    openingCashPaise = 0, openingUpiPaise = 0,
                                    closingCashPaise = mtCashBalance, closingUpiPaise = mtUpiBalance,
                                    fundReceivedPaise = funds.filter { it.dateEpochDay == today }.sumOf { it.amountPaise }
                                )
                            )
                            closingSaved = true
                            closingError = null
                        } catch (e: Exception) {
                            closingError = "Could not save closing: ${e.message}"
                        }
                    }
                }
            )
        }
    }

    if (showAddFund) {
        AddFundDialog(onDismiss = { showAddFund = false }) { amountPaise, mode, note ->
            scope.launch {
                repository.addFund(
                    MoneyTransferFundEntity(
                        profileId = profileId, amountPaise = amountPaise,
                        source = "Brother", mode = mode, dateEpochDay = today, note = note
                    )
                )
                showAddFund = false
            }
        }
    }

    if (showAdd) {
        AddTransferDialog(onDismiss = { showAdd = false }) { customer, receiver, mobile, amountPaise, commissionPaise, chargesPaise, ref, paidMode, sentMode ->
            scope.launch {
                val txnId = "MT-${today}-${System.currentTimeMillis() % 100000}"
                repository.addMoneyTransfer(
                    MoneyTransferEntity(
                        profileId = profileId, transactionId = txnId,
                        customerName = customer, receiverName = receiver, receiverMobile = mobile,
                        amountPaise = amountPaise, commissionPaise = commissionPaise,
                        chargesPaise = chargesPaise, mode = paidMode, sentMode = sentMode,
                        referenceNumber = ref, dateEpochDay = today
                    )
                )
                showAdd = false
            }
        }
    }
}

@Composable
private fun OverviewTab(
    cashReceived: Long, cashSent: Long, commissionToday: Long, profitToday: Long,
    principalToday: Long, mtCashBalance: Long, mtUpiBalance: Long, totalFund: Long,
    onNewTransfer: () -> Unit, onHistory: () -> Unit, onClosing: () -> Unit, onAddFund: () -> Unit
) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Spacer(Modifier.height(4.dp)) }
        item {
            // Today's Summary — purple gradient card (reference screen 5).
            Box(
                Modifier.fillMaxWidth()
                    .background(
                        Brush.linearGradient(listOf(BizColors.Purple, BizColors.Navy)),
                        RoundedCornerShape(16.dp)
                    )
                    .padding(20.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Today's Summary", color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SummaryCell("Cash Received", formatRupees(cashReceived))
                        SummaryCell("Cash Sent", formatRupees(cashSent))
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        SummaryCell("Commission", formatRupees(commissionToday))
                        SummaryCell("Principal Sent", formatRupees(principalToday))
                    }
                    Text(
                        "Net Profit (commission only): ${formatRupees(profitToday)}",
                        color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        "Principal is tracked, never profit.",
                        color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("MT Cash Balance", formatRupees(mtCashBalance), modifier = Modifier.weight(1f))
                StatCard("MT UPI Balance", formatRupees(mtUpiBalance), modifier = Modifier.weight(1f))
            }
        }
        item {
            BizCard(Modifier.fillMaxWidth()) {
                Text("Fund Received From Brother", fontWeight = FontWeight.SemiBold)
                Text(formatRupees(totalFund), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Usually by UPI — the float for transfers", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item { PrimaryButton("Add Fund From Brother", onClick = onAddFund) }
        item {
            MenuRow("New Transfer", "Send / Receive Money", onClick = onNewTransfer)
            MenuRow("Transfer History", "All MT Transactions", onClick = onHistory)
            MenuRow("Daily Closing", "End of Day Summary", onClick = onClosing)
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun SummaryCell(label: String, value: String) {
    Column {
        Text(label, color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun MenuRow(title: String, subtitle: String, onClick: () -> Unit) {
    BizCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null)
        }
    }
}

@Composable
private fun TransactionsTab(transfers: List<MoneyTransferEntity>, onAdd: () -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Spacer(Modifier.height(4.dp)) }
        item { PrimaryButton("New Transfer", onClick = onAdd) }
        if (transfers.isEmpty()) {
            item {
                EmptyState(
                    "No money transfers yet. Add your first transfer above.",
                    actionLabel = "New Transfer", onAction = onAdd
                )
            }
        } else {
            items(transfers) { t ->
                BizCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text("${t.customerName} → ${t.receiverName}", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Txn ${t.transactionId} • ${t.mode} → ${t.sentMode} • ${formatDay(t.dateEpochDay)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "Commission ${formatRupees(t.commissionPaise)} • Status: ${t.status}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        Text(formatRupees(t.amountPaise), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun SettlementTab(
    today: Long, fundReceivedToday: Long,
    cashReceived: Long, cashSent: Long, upiReceived: Long, upiSent: Long,
    mtCashBalance: Long, mtUpiBalance: Long, profitToday: Long,
    saved: Boolean, error: String?,
    onSaveClosing: () -> Unit
) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Spacer(Modifier.height(4.dp)) }
        item {
            BizCard(Modifier.fillMaxWidth()) {
                Text("Daily Closing — ${formatDay(today)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                ClosingRow("Fund Received Today", formatRupees(fundReceivedToday))
                ClosingRow("Cash Received", formatRupees(cashReceived))
                ClosingRow("Cash Sent", formatRupees(cashSent))
                ClosingRow("UPI Received", formatRupees(upiReceived))
                ClosingRow("UPI Sent", formatRupees(upiSent))
                ClosingRow("Commission Profit Today", formatRupees(profitToday))
                Spacer(Modifier.height(8.dp))
                ClosingRow("Closing Cash Balance", formatRupees(mtCashBalance), bold = true)
                ClosingRow("Closing UPI Balance", formatRupees(mtUpiBalance), bold = true)
                Text(
                    "Closing = Starting + Received − Sent − Expenses, per account.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            PrimaryButton("Save Today's Closing", onClick = onSaveClosing)
            if (saved) {
                Text(
                    "Closing saved for today.",
                    color = BizColors.IncomeGreen,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            error?.let {
                Text(it, color = BizColors.ExpenseRed, modifier = Modifier.padding(top = 8.dp))
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun ClosingRow(label: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
        Text(value, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
private fun AddTransferDialog(
    onDismiss: () -> Unit,
    onSave: (customer: String, receiver: String, mobile: String, amountPaise: Long, commissionPaise: Long, chargesPaise: Long, ref: String, paidMode: PaymentMode, sentMode: PaymentMode) -> Unit
) {
    var customer by remember { mutableStateOf("") }
    var receiver by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var commission by remember { mutableStateOf("") }
    var charges by remember { mutableStateOf("0") }
    var ref by remember { mutableStateOf("") }
    var paidMode by remember { mutableStateOf(PaymentMode.CASH) }
    var sentMode by remember { mutableStateOf(PaymentMode.UPI) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Money Transfer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(customer, { customer = it }, label = { Text("Customer Name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(receiver, { receiver = it }, label = { Text("Receiver Name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(mobile, { mobile = it }, label = { Text("Receiver Mobile") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(amount, { amount = it }, label = { Text("Transfer Amount (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(commission, { commission = it }, label = { Text("Commission Earned (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(charges, { charges = it }, label = { Text("Transfer Charges (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ref, { ref = it }, label = { Text("Reference Number (optional)") }, modifier = Modifier.fillMaxWidth())
                Text("How did the customer pay?")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { paidMode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (paidMode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                    Button(onClick = { paidMode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (paidMode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                }
                Text("How was the money sent?")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { sentMode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (sentMode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                    Button(onClick = { sentMode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (sentMode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                }
                Text("Only the commission counts as income — never the full amount.")
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val amountPaise = parseRupeesToPaise(amount)
                val commissionPaise = parseRupeesToPaise(commission)
                val chargesPaise = parseRupeesToPaise(charges) ?: 0L
                when {
                    customer.isBlank() || receiver.isBlank() -> error = "Enter customer and receiver names."
                    amountPaise == null || amountPaise <= 0 -> error = "Enter a valid transfer amount."
                    commissionPaise == null || commissionPaise < 0 -> error = "Enter a valid commission (0 is allowed)."
                    else -> onSave(customer.trim(), receiver.trim(), mobile.trim(), amountPaise, commissionPaise, chargesPaise, ref.trim(), paidMode, sentMode)
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddFundDialog(
    onDismiss: () -> Unit,
    onSave: (amountPaise: Long, mode: PaymentMode, note: String) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(PaymentMode.UPI) }
    var note by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Fund From Brother") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(amount, { amount = it }, label = { Text("Fund Amount (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(note, { note = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth())
                Text("How did the fund come?")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { mode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                    Button(onClick = { mode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                }
                Text("Fund from your brother usually comes by UPI.")
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val amountPaise = parseRupeesToPaise(amount)
                if (amountPaise == null || amountPaise <= 0) error = "Enter a valid fund amount."
                else onSave(amountPaise, mode, note.trim())
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
