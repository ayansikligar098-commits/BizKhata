package com.alfalah.business.ui.agents

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.AvatarCircle
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
 * Agent Profile — detail page for one agent: header, Total Charges /
 * Paid / Remaining Payable, the agent's jobs (with per-job margin:
 * received − agent charges) and the payment ledger. Agent payable is
 * its own ledger — never netted against customer receivable.
 */
@Composable
fun AgentDetailScreen(
    profileId: Long,
    agentId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    var agent by remember { mutableStateOf<AgentEntity?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(agentId) {
        try {
            agent = repository.getAgent(agentId)
        } catch (e: Exception) {
            loadError = e.message ?: "Could not load agent"
        }
    }
    val jobs by repository.observeJobsByAgent(profileId, agentId).collectAsState(initial = emptyList())
    val payments by repository.observeAgentPayments(agentId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showPay by remember { mutableStateOf(false) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    if (loadError != null) {
        Column(Modifier.fillMaxSize().padding(24.dp)) { Text("Could not load this agent: $loadError") }
        return
    }
    val a = agent
    if (a == null) {
        Column(Modifier.fillMaxSize().padding(24.dp)) { Text("Loading agent…") }
        return
    }

    val totalCharges = jobs.sumOf { it.agentChargesPaise }
    val totalPaid = payments.sumOf { it.amountPaise }
    val payable = AccountingEngine.agentPayable(totalCharges, totalPaid)

    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                AvatarCircle(a.name, sizeDp = 56)
                Column(Modifier.padding(start = 12.dp)) {
                    Text(a.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(a.mobile, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(a.type.label, style = MaterialTheme.typography.bodySmall, color = BizColors.Purple)
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Total Charges", formatRupees(totalCharges), modifier = Modifier.weight(1f))
                StatCard("Paid", formatRupees(totalPaid), valueColor = BizColors.IncomeGreen, modifier = Modifier.weight(1f))
                StatCard("Payable", formatRupees(payable), valueColor = BizColors.ExpenseRed, modifier = Modifier.weight(1f))
            }
        }
        item {
            PrimaryButton("Pay Agent") { showPay = true }
            Text(
                "Jobs: ${jobs.size} • Completed: ${jobs.count { it.status.name == "COMPLETED" }} • Pending: ${jobs.count { it.status.name != "COMPLETED" && it.status.name != "CANCELLED" }}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        item { Text("Jobs", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (jobs.isEmpty()) {
            item { EmptyState("No jobs assigned to this agent yet. Assign a job from its service page (Agent button).") }
        } else {
            items(jobs) { job ->
                val margin = job.amountReceivedPaise - job.agentChargesPaise
                BizCard(Modifier.fillMaxWidth()) {
                    Text("Job #${job.id} — ${job.workDetails}", fontWeight = FontWeight.SemiBold)
                    Text(
                        "${job.service.label} • Status: ${job.status} • ${formatDay(job.submissionDateEpochDay)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Charges ${formatRupees(job.agentChargesPaise)} • Received ${formatRupees(job.amountReceivedPaise)} • Your margin ${formatRupees(margin)}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
        item { Text("Payments Made", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (payments.isEmpty()) {
            item { EmptyState("No payments made to this agent yet.") }
        } else {
            items(payments) { p ->
                BizCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text("Payment", fontWeight = FontWeight.SemiBold)
                            Text(
                                "${p.mode} • ${formatDay(p.dateEpochDay)}" + if (p.note.isNotBlank()) " • ${p.note}" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text("− ${formatRupees(p.amountPaise)}", fontWeight = FontWeight.Bold, color = BizColors.ExpenseRed)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showPay) {
        var amount by remember { mutableStateOf("") }
        var mode by remember { mutableStateOf(PaymentMode.CASH) }
        var error by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { showPay = false },
            title = { Text("Pay ${a.name}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Payable: ${formatRupees(payable)}")
                    OutlinedTextField(amount, { amount = it }, label = { Text("Amount (₹)") }, modifier = Modifier.fillMaxWidth())
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
                        valuePaise > payable -> error = "Amount is more than the payable (${formatRupees(payable)})."
                        else -> scope.launch {
                            repository.payAgent(
                                AgentPaymentEntity(
                                    profileId = profileId, agentId = a.id,
                                    amountPaise = valuePaise, mode = mode, dateEpochDay = today
                                )
                            )
                            showPay = false
                        }
                    }
                }) { Text("Save Payment") }
            },
            dismissButton = { TextButton(onClick = { showPay = false }) { Text("Cancel") } }
        )
    }
}
