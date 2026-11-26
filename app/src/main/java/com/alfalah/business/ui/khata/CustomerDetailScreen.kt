package com.alfalah.business.ui.khata

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Description
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
import androidx.compose.runtime.LaunchedEffect
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
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.AvatarCircle
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.StatusPill
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Customer Profile / Khata detail — reference screen 8 (detail).
 * Header (avatar, name, mobile), Total Bill / Paid / Due cards,
 * tabs Ledger / Jobs (n) / Documents. Ledger rows: Payment Received
 * (green down-arrow) and Bill (blue doc icon). Bottom: + Add Payment
 * and + Add Job (Add Job goes back to the service page for a new job).
 */
@Composable
fun CustomerDetailScreen(
    profileId: Long,
    customerId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    onAddJob: (String) -> Unit
) {
    var customer by remember { mutableStateOf<CustomerEntity?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(customerId) {
        try {
            customer = repository.getCustomer(customerId)
        } catch (e: Exception) {
            loadError = e.message ?: "Could not load customer"
        }
    }
    val jobs by repository.observeJobsByCustomer(profileId, customerId).collectAsState(initial = emptyList())
    val khata by repository.observeKhataByProfile(profileId).collectAsState(initial = emptyList())
    val documents by repository.observeDocumentsByCustomer(customerId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var payJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    if (loadError != null) {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            Text("Could not load this customer: $loadError")
        }
        return
    }
    val c = customer
    if (c == null) {
        Column(Modifier.fillMaxSize().padding(24.dp)) {
            Text("Loading customer…")
        }
        return
    }

    val totalBill = jobs.sumOf { it.totalFeesPaise }
    val totalPaid = jobs.sumOf { it.amountReceivedPaise }
    val totalDue = jobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }
    val jobIds = jobs.map { it.id }.toSet()
    val ledgerPayments = khata.filter { it.jobId in jobIds }

    Column(Modifier.fillMaxSize()) {
        // Header
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AvatarCircle(c.name, sizeDp = 56)
            Column(Modifier.padding(start = 12.dp)) {
                Text(c.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(c.mobile.ifBlank { "No mobile" }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(c.service.label, style = MaterialTheme.typography.bodySmall, color = BizColors.Purple)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StatCard("Total Bill", formatRupees(totalBill), modifier = Modifier.weight(1f))
            StatCard("Paid", formatRupees(totalPaid), valueColor = BizColors.IncomeGreen, modifier = Modifier.weight(1f))
            StatCard("Due", formatRupees(totalDue), valueColor = BizColors.ExpenseRed, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(12.dp))
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Ledger") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Jobs (${jobs.size})") })
            Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Documents") })
        }
        when (tab) {
            0 -> LedgerTab(jobs = jobs, payments = ledgerPayments)
            1 -> JobsTab(jobs = jobs, onPay = { payJob = it })
            2 -> DocumentsTab(count = documents.size, names = documents.map { it.fileName })
        }
        // Bottom actions
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val dueJob = jobs.firstOrNull { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) > 0 }
            Button(
                onClick = { dueJob?.let { payJob = it } },
                enabled = dueJob != null,
                modifier = Modifier.weight(1f),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
            ) { Text("+ Add Payment") }
            Button(
                onClick = { onAddJob(c.service.name) },
                modifier = Modifier.weight(1f),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            ) { Text("+ Add Job") }
        }
    }

    payJob?.let { job ->
        AddPaymentDialog(job = job, onDismiss = { payJob = null }) { amountPaise, mode ->
            scope.launch {
                repository.receivePayment(profileId, job, amountPaise = amountPaise, mode = mode, dayEpoch = today)
                payJob = null
            }
        }
    }
}

@Composable
private fun LedgerTab(
    jobs: List<ServiceJobEntity>,
    payments: List<com.alfalah.business.data.entity.KhataEntryEntity>
) {
    // One ledger timeline: bills (job created) + payments received, newest first.
    val jobById = jobs.associateBy { it.id }
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Spacer(Modifier.height(4.dp)) }
        if (jobs.isEmpty() && payments.isEmpty()) {
            item { EmptyState("No ledger entries for this customer yet.") }
        } else {
            items(payments) { p ->
                val job = jobById[p.jobId]
                BizCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.ArrowDownward, contentDescription = null, tint = BizColors.IncomeGreen)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text("Payment Received", fontWeight = FontWeight.SemiBold)
                            Text(
                                "${p.mode} • ${formatDay(p.dateEpochDay)}" + (job?.let { " • ${it.service.label}" } ?: ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text("+ ${formatRupees(p.amountPaise)}", fontWeight = FontWeight.Bold, color = BizColors.IncomeGreen)
                    }
                }
            }
            items(jobs) { job ->
                BizCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Description, contentDescription = null, tint = BizColors.Purple)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text("${job.service.label} — Bill", fontWeight = FontWeight.SemiBold)
                            Text(
                                "${job.workDetails} • ${formatDay(job.submissionDateEpochDay)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(formatRupees(job.totalFeesPaise), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun JobsTab(jobs: List<ServiceJobEntity>, onPay: (ServiceJobEntity) -> Unit) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Spacer(Modifier.height(4.dp)) }
        if (jobs.isEmpty()) {
            item { EmptyState("No jobs for this customer yet.") }
        } else {
            items(jobs) { job ->
                val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                BizCard(Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${job.service.label} — ${job.workDetails}", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Ref: ${job.referenceNumber.ifBlank { "—" }} • ${formatDay(job.submissionDateEpochDay)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "Total ${formatRupees(job.totalFeesPaise)} • Paid ${formatRupees(job.amountReceivedPaise)} • Due ${formatRupees(due)}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        StatusPill(job.status)
                    }
                    if (due > 0) {
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = { onPay(job) },
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
                        ) { Text("Add Payment") }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun DocumentsTab(count: Int, names: List<String>) {
    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Spacer(Modifier.height(4.dp)) }
        if (count == 0) {
            item {
                EmptyState(
                    "No documents attached to this customer's jobs yet. " +
                        "Document upload per customer is remaining work — see README."
                )
            }
        } else {
            items(names) { name ->
                BizCard(Modifier.fillMaxWidth()) {
                    Text(name, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun AddPaymentDialog(
    job: ServiceJobEntity,
    onDismiss: () -> Unit,
    onSave: (amountPaise: Long, mode: PaymentMode) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(PaymentMode.CASH) }
    var error by remember { mutableStateOf<String?>(null) }
    val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Payment") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${job.service.label} — ${job.workDetails}")
                Text("Due: ${formatRupees(due)}")
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount Received (₹)") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { mode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                    Button(onClick = { mode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                }
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val valuePaise = parseRupeesToPaise(amount)
                when {
                    valuePaise == null || valuePaise <= 0 -> error = "Enter a valid amount."
                    valuePaise > due -> error = "Amount is more than the due (${formatRupees(due)})."
                    else -> onSave(valuePaise, mode)
                }
            }) { Text("Save Payment") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
