package com.alfalah.business.ui.services

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
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
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
 * One page per service (PAN, Aadhaar, Voter ID, Ayushman, Xerox, Printing,
 * Smart Card, Document Work). The list shows ONLY this service's customers
 * and jobs — never a mixed list (§9).
 *
 * PAN is done by ayan himself: no agent picker is shown for PAN jobs.
 * Aadhaar jobs may be assigned to an agent (name/number/biometric work).
 */
@Composable
fun ServiceJobsScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    service: ServiceType
) {
    val jobs by repository.jobsForService(profileId, service).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    var payJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    var deleteJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle(service.label)
            Text("Customers and jobs for ${service.label} only.")
            BigButton("Add ${service.label} Job") { showAdd = true }
        }
        if (jobs.isEmpty()) {
            item { EmptyState("No ${service.label} jobs yet. Add your first job above.") }
        } else {
            items(jobs) { job ->
                val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                val margin = if (job.agentChargesPaise > 0) job.amountReceivedPaise - job.agentChargesPaise else null
                InfoCard(
                    "Job #${job.id} — ${job.workDetails}",
                    "Total ${formatRupees(job.totalFeesPaise)} • Received ${formatRupees(job.amountReceivedPaise)} • Due ${formatRupees(due)}",
                    subtitle = "Status: ${job.status} • Ref: ${job.referenceNumber.ifBlank { "—" }} • Agent charges: ${formatRupees(job.agentChargesPaise)}" +
                        (margin?.let { " • Your margin: ${formatRupees(it)}" } ?: "")
                )
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Button(onClick = { payJob = job }, modifier = Modifier.fillMaxWidth()) {
                        Text("Payment Received")
                    }
                    Button(onClick = { deleteJob = job }, modifier = Modifier.fillMaxWidth()) {
                        Text("Delete (goes to Recycle Bin)")
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddJobDialog(service = service, onDismiss = { showAdd = false }) { name, mobile, details, ref, totalPaise ->
            scope.launch {
                repository.addJob(
                    profileId,
                    CustomerEntity(profileId = profileId, name = name, mobile = mobile, service = service),
                    ServiceJobEntity(
                        profileId = profileId, customerId = 0, service = service,
                        workDetails = details, referenceNumber = ref,
                        submissionDateEpochDay = today,
                        status = JobStatus.NEW,
                        totalFeesPaise = totalPaise, amountReceivedPaise = 0
                    )
                )
                // Any payment for this job is recorded afterwards with the
                // "Payment Received" button — it writes a Khata entry and a
                // Cash/UPI book entry in one transaction, so the due and the
                // balances can never disagree.
                showAdd = false
            }
        }
    }

    payJob?.let { job ->
        ReceivePaymentDialog(job = job, onDismiss = { payJob = null }) { amountPaise, mode ->
            scope.launch {
                repository.receivePayment(
                    profileId, job,
                    amountPaise = amountPaise,
                    mode = mode, dayEpoch = today
                )
                payJob = null
            }
        }
    }

    deleteJob?.let { job ->
        AlertDialog(
            onDismissRequest = { deleteJob = null },
            title = { Text("Delete this job?") },
            text = { Text("It goes to the Recycle Bin. You can restore it later. Financial data is never erased silently.") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.deleteJob(profileId, job.id)
                        deleteJob = null
                    }
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { deleteJob = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun AddJobDialog(
    service: ServiceType,
    onDismiss: () -> Unit,
    onSave: (name: String, mobile: String, details: String, ref: String, totalPaise: Long) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var ref by remember { mutableStateOf("") }
    var total by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add ${service.label} Job") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Customer Name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(mobile, { mobile = it }, label = { Text("Mobile Number") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(details, { details = it }, label = { Text("Work Details") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(ref, { ref = it }, label = { Text("Reference Number (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(total, { total = it }, label = { Text("Total Fees (₹)") }, modifier = Modifier.fillMaxWidth())
                if (service == ServiceType.PAN) {
                    Text("PAN is done by you yourself — no agent is assigned.")
                } else if (service == ServiceType.AADHAAR) {
                    Text("Aadhaar name / number / biometric work can be assigned to an agent from the Agents page.")
                }
                error?.let { Text(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val totalPaise = parseRupeesToPaise(total)
                when {
                    name.isBlank() -> error = "Enter the customer name."
                    mobile.isBlank() -> error = "Enter the mobile number."
                    details.isBlank() -> error = "Enter the work details."
                    totalPaise == null || totalPaise <= 0 -> error = "Enter a valid total fee."
                    else -> onSave(name.trim(), mobile.trim(), details.trim(), ref.trim(), totalPaise)
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun ReceivePaymentDialog(
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
        title = { Text("Payment Received") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Due: ${formatRupees(due)}")
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount Received (₹)") }, modifier = Modifier.fillMaxWidth())
                Text("How did the customer pay? Cash and UPI are separate accounts.")
                androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { mode = PaymentMode.CASH }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.CASH) "✓ Cash" else "Cash")
                    }
                    Button(onClick = { mode = PaymentMode.UPI }, modifier = Modifier.weight(1f)) {
                        Text(if (mode == PaymentMode.UPI) "✓ UPI" else "UPI")
                    }
                }
                error?.let { Text(it) }
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
