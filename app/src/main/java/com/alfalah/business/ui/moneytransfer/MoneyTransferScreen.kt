package com.alfalah.business.ui.moneytransfer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BigButton
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Money Transfer — its OWN ledger, never mixed with shop accounting (§18).
 * Profit = commission only. The transferred principal is tracked, never
 * counted as income. Example: ₹10,000 transfer, ₹50 commission → ₹50 income.
 *
 * Fund: ayan's BROTHER gives the fund, by UPI (original chat, turns 2–3).
 * Tracked here per receipt: fund received, amount transferred, expenses,
 * balance left, and who each transfer went to. Closing balances follow
 * the original chat's formula: Starting + Received − Sent − Expenses.
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
    var showAdd by remember { mutableStateOf(false) }
    var showAddFund by remember { mutableStateOf(false) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    val todayList = transfers.filter { it.dateEpochDay == today }
    val profitToday = AccountingEngine.moneyTransferProfit(
        commissionPaise = todayList.sumOf { it.commissionPaise },
        transferChargesPaise = todayList.sumOf { it.chargesPaise },
        moneyTransferExpensesPaise = 0
    )
    val principalToday = todayList.sumOf { it.amountPaise }
    // Fund received from brother (all time) and closing balances.
    val totalFund = funds.sumOf { it.amountPaise }
    val cashReceived = transfers.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise + it.commissionPaise }
    val cashSent = transfers.filter { it.sentMode == PaymentMode.CASH }.sumOf { it.amountPaise }
    val fundCash = funds.filter { it.mode == PaymentMode.CASH }.sumOf { it.amountPaise }
    val mtCashBalance = AccountingEngine.moneyTransferClosingBalance(0, fundCash + cashReceived, cashSent, 0)
    val upiReceived = transfers.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise + it.commissionPaise }
    val upiSent = transfers.filter { it.sentMode == PaymentMode.UPI }.sumOf { it.amountPaise }
    val fundUpi = funds.filter { it.mode == PaymentMode.UPI }.sumOf { it.amountPaise }
    val mtUpiBalance = AccountingEngine.moneyTransferClosingBalance(0, fundUpi + upiReceived, upiSent, 0)

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Money Transfer")
            Text("Separate ledger. Principal is tracked, never profit.")
            InfoCard("Fund Received From Brother", formatRupees(totalFund), subtitle = "Usually by UPI — the float for transfers")
            InfoCard("MT Cash Balance (Closing)", formatRupees(mtCashBalance), subtitle = "Fund (Cash) + Cash Received − Cash Sent")
            InfoCard("MT UPI Balance (Closing)", formatRupees(mtUpiBalance), subtitle = "Fund (UPI) + UPI Received − UPI Sent")
            InfoCard("Today's Commission (Profit)", formatRupees(profitToday))
            InfoCard(
                "Today's Principal Sent",
                formatRupees(principalToday),
                subtitle = "Tracked only — not income, not profit"
            )
            BigButton("Add Fund From Brother") { showAddFund = true }
            BigButton("Add Money Transfer") { showAdd = true }
        }
        if (transfers.isEmpty()) {
            item { EmptyState("No money transfers yet. Add your first transfer above.") }
        } else {
            items(transfers) { t ->
                InfoCard(
                    "${t.customerName} → ${t.receiverName}",
                    "Amount ${formatRupees(t.amountPaise)} • Commission ${formatRupees(t.commissionPaise)}",
                    subtitle = "Txn ${t.transactionId} • ${t.mode} → ${t.sentMode} • Ref: ${t.referenceNumber.ifBlank { "—" }} • ${t.status}"
                )
            }
        }
    }

    if (showAddFund) {
        AddFundDialog(onDismiss = { showAddFund = false }) { amountPaise, mode, note ->
            scope.launch {
                repository.addFund(
                    MoneyTransferFundEntity(
                        profileId = profileId,
                        amountPaise = amountPaise,
                        source = "Brother",
                        mode = mode,
                        dateEpochDay = today,
                        note = note
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
                        profileId = profileId,
                        transactionId = txnId,
                        customerName = customer,
                        receiverName = receiver,
                        receiverMobile = mobile,
                        amountPaise = amountPaise,
                        commissionPaise = commissionPaise,
                        chargesPaise = chargesPaise,
                        mode = paidMode,
                        sentMode = sentMode,
                        referenceNumber = ref,
                        dateEpochDay = today
                    )
                )
                showAdd = false
            }
        }
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
                androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { paidMode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (paidMode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                    Button(onClick = { paidMode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (paidMode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                }
                Text("How was the money sent?")
                androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { sentMode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (sentMode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                    Button(onClick = { sentMode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (sentMode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                }
                Text("Only the commission counts as income — never the full amount.")
                error?.let { Text(it) }
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

/**
 * Fund received for Money Transfer — from ayan's brother, by UPI.
 * This is the float the shop sends transfers from. Record every receipt
 * of fund so the closing balance always matches.
 */
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
                androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { mode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                    Button(onClick = { mode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                }
                Text("Fund from your brother usually comes by UPI.")
                error?.let { Text(it) }
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
