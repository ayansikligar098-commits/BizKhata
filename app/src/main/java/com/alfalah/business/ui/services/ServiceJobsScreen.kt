package com.alfalah.business.ui.services

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
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.ui.components.AvatarCircle
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.components.SearchField
import com.alfalah.business.ui.components.StatusPill
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * One page per service (PAN, Aadhaar, Voter ID, Ayushman, Xerox, Printing,
 * Smart Card, Document Work) — reference screen 7. The list shows ONLY
 * this service's jobs — never a mixed list (§9). Filter pills carry real
 * counts, search filters by name / reference, each card shows the
 * customer, status pill and Amount / Paid / Due.
 *
 * PAN is done by ayan himself: no agent picker is shown for PAN jobs and
 * the repository refuses any agent assignment for PAN. Aadhaar jobs may
 * be assigned to an agent (name/number/biometric work).
 */
@Composable
fun ServiceJobsScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    service: ServiceType,
    onOpenCustomer: (Long) -> Unit,
    onOpenAssistant: () -> Unit = {}
) {
    val jobs by repository.jobsForService(profileId, service).collectAsState(initial = emptyList())
    val customers by repository.searchCustomers(profileId, "").collectAsState(initial = emptyList())
    val agents by repository.observeAgents(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    var payJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    var deleteJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    var statusJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    var agentJob by remember { mutableStateOf<ServiceJobEntity?>(null) }
    var filter by remember { mutableStateOf("All") }
    var query by remember { mutableStateOf("") }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    val nameById = customers.associate { it.id to it }
    val counts = mapOf(
        "All" to jobs.size,
        "New" to jobs.count { it.status == JobStatus.NEW },
        "In Progress" to jobs.count { it.status == JobStatus.IN_PROGRESS },
        "Completed" to jobs.count { it.status == JobStatus.COMPLETED },
        "Pending" to jobs.count { it.status == JobStatus.PENDING }
    )
    val visible = jobs.filter { job ->
        val statusOk = when (filter) {
            "New" -> job.status == JobStatus.NEW
            "In Progress" -> job.status == JobStatus.IN_PROGRESS
            "Completed" -> job.status == JobStatus.COMPLETED
            "Pending" -> job.status == JobStatus.PENDING
            else -> true
        }
        val customer = nameById[job.customerId]
        val queryOk = query.isBlank() ||
            (customer?.name?.contains(query, ignoreCase = true) == true) ||
            job.referenceNumber.contains(query, ignoreCase = true) ||
            job.workDetails.contains(query, ignoreCase = true)
        statusOk && queryOk
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                counts.forEach { (label, count) ->
                    item {
                        androidx.compose.material3.FilterChip(
                            selected = filter == label,
                            onClick = { filter = label },
                            label = { Text("$label ($count)") },
                            colors = androidx.compose.material3.FilterChipDefaults.filterChipColors(
                                selectedContainerColor = BizColors.Purple,
                                selectedLabelColor = androidx.compose.ui.graphics.Color.White
                            )
                        )
                    }
                }
            }
        }
        item {
            SearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search by name, ref no..."
            )
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                androidx.compose.material3.TextButton(onClick = onOpenAssistant) {
                    Text("Ask AI Assistant", color = com.alfalah.business.ui.theme.BizColors.Purple)
                }
            }
        }
        item {
            PrimaryButton("+ Add ${service.label} ${if (service == ServiceType.XEROX || service == ServiceType.PRINTING) "Job" else "Application"}") {
                showAdd = true
            }
        }
        if (visible.isEmpty()) {
            item {
                EmptyState(
                    if (jobs.isEmpty()) "No ${service.label} jobs yet. Add your first job above."
                    else "No ${service.label} jobs match this filter.",
                    actionLabel = "Add ${service.label} Job",
                    onAction = { showAdd = true }
                )
            }
        } else {
            items(visible) { job ->
                val customer = nameById[job.customerId]
                val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                val margin = if (job.agentChargesPaise > 0) job.amountReceivedPaise - job.agentChargesPaise else null
                BizCard(
                    Modifier.fillMaxWidth(),
                    onClick = { customer?.let { onOpenCustomer(it.id) } }
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AvatarCircle(customer?.name ?: "Customer")
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text(customer?.name ?: "Customer #${job.customerId}", fontWeight = FontWeight.SemiBold)
                            Text(
                                "Ref: ${job.referenceNumber.ifBlank { "—" }} • ${formatDay(job.submissionDateEpochDay)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                job.workDetails,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        StatusPill(job.status)
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        AmountCell("Amount", formatRupees(job.totalFeesPaise))
                        AmountCell("Paid", formatRupees(job.amountReceivedPaise), BizColors.IncomeGreen)
                        AmountCell("Due", formatRupees(due), if (due > 0) BizColors.ExpenseRed else BizColors.IncomeGreen)
                    }
                    if (job.agentChargesPaise > 0) {
                        Text(
                            "Agent charges ${formatRupees(job.agentChargesPaise)}" +
                                (margin?.let { " • Your margin ${formatRupees(it)}" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { payJob = job },
                            modifier = Modifier.weight(1f),
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                containerColor = BizColors.Purple
                            )
                        ) { Text("Payment") }
                        Button(
                            onClick = { statusJob = job },
                            modifier = Modifier.weight(1f),
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                contentColor = MaterialTheme.colorScheme.onSurface
                            )
                        ) { Text("Status") }
                        if (service != ServiceType.PAN) {
                            Button(
                                onClick = { agentJob = job },
                                modifier = Modifier.weight(1f),
                                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                                    contentColor = MaterialTheme.colorScheme.onSurface
                                )
                            ) { Text("Agent") }
                        }
                        IconButton(onClick = { deleteJob = job }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "More actions")
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
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
                showAdd = false
            }
        }
    }

    payJob?.let { job ->
        ReceivePaymentDialog(job = job, onDismiss = { payJob = null }) { amountPaise, mode ->
            scope.launch {
                repository.receivePayment(profileId, job, amountPaise = amountPaise, mode = mode, dayEpoch = today)
                payJob = null
            }
        }
    }

    statusJob?.let { job ->
        StatusDialog(job = job, onDismiss = { statusJob = null }) { newStatus ->
            scope.launch {
                repository.updateJobStatus(profileId, job, newStatus)
                statusJob = null
            }
        }
    }

    agentJob?.let { job ->
        AssignAgentDialog(
            job = job,
            agents = agents,
            onDismiss = { agentJob = null }
        ) { agentId, chargesPaise ->
            scope.launch {
                repository.setJobAgent(profileId, job, agentId, chargesPaise)
                agentJob = null
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
private fun AmountCell(label: String, value: String, color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface) {
    Column {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontWeight = FontWeight.Bold, color = color)
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
                    Text("Aadhaar name / number / biometric work can be assigned to an agent from the Agents page or the Agent button on a job.")
                }
                error?.let { Text(it, color = BizColors.ExpenseRed) }
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

@Composable
private fun StatusDialog(
    job: ServiceJobEntity,
    onDismiss: () -> Unit,
    onSave: (JobStatus) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Change Status") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Current status: ${job.status}")
                JobStatus.values().forEach { status ->
                    TextButton(onClick = { onSave(status) }, modifier = Modifier.fillMaxWidth()) {
                        Text(if (status == job.status) "✓ ${status.name}" else status.name)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AssignAgentDialog(
    job: ServiceJobEntity,
    agents: List<com.alfalah.business.data.entity.AgentEntity>,
    onDismiss: () -> Unit,
    onSave: (agentId: Long, chargesPaise: Long) -> Unit
) {
    var selected by remember { mutableStateOf<com.alfalah.business.data.entity.AgentEntity?>(null) }
    var charges by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var menuOpen by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Assign Agent") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("PAN jobs never show this — this job is ${job.service.label}.")
                if (agents.isEmpty()) {
                    Text("No agents yet. Add an agent from the Agents page first.")
                } else {
                    Button(onClick = { menuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(selected?.name ?: "Choose agent")
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        agents.forEach { agent ->
                            DropdownMenuItem(
                                text = { Text("${agent.name} — ${agent.type.label}") },
                                onClick = { selected = agent; menuOpen = false }
                            )
                        }
                    }
                }
                OutlinedTextField(charges, { charges = it }, label = { Text("Agent Charges (₹)") }, modifier = Modifier.fillMaxWidth())
                Text("Your margin = amount received − agent charges.")
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val chargesPaise = parseRupeesToPaise(charges)
                when {
                    selected == null -> error = "Choose an agent."
                    chargesPaise == null || chargesPaise < 0 -> error = "Enter valid agent charges (0 is allowed)."
                    else -> onSave(selected!!.id, chargesPaise)
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
