package com.alfalah.business.ui.agents

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
import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AgentType
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
 * Agent Management — one page per agent (tap an agent to see its jobs).
 * Agent payable is its own ledger, separate from customer receivable.
 * PAN never appears here: ayan makes PAN cards himself.
 */
@Composable
fun AgentScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val agents by repository.observeAgents(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    var payAgent by remember { mutableStateOf<AgentEntity?>(null) }
    var selectedAgent by remember { mutableStateOf<AgentEntity?>(null) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Agents")
            Text("Agents do Aadhaar name / number / biometric work and licence work that cannot be done from the shop. You bring the customer and print. PAN is done by you — never by an agent.")
            BigButton("Add Agent") { showAdd = true }
        }
        if (agents.isEmpty()) {
            item { EmptyState("No agents yet. Add your first agent above.") }
        } else {
            items(agents) { agent ->
                InfoCard(
                    agent.name,
                    agent.type.label,
                    subtitle = "Mobile: ${agent.mobile}"
                )
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Button(onClick = { selectedAgent = agent }, modifier = Modifier.fillMaxWidth()) {
                        Text("View Jobs & Payments")
                    }
                    Button(onClick = { payAgent = agent }, modifier = Modifier.fillMaxWidth()) {
                        Text("Pay Agent")
                    }
                }
            }
        }
        selectedAgent?.let { agent ->
            item { AgentDetail(profileId, repository, agent) }
        }
    }

    if (showAdd) {
        AddAgentDialog(onDismiss = { showAdd = false }) { name, mobile, type ->
            scope.launch {
                repository.addAgent(
                    AgentEntity(profileId = profileId, name = name, mobile = mobile, type = type)
                )
                showAdd = false
            }
        }
    }

    payAgent?.let { agent ->
        PayAgentDialog(agent = agent, onDismiss = { payAgent = null }) { amountPaise, mode ->
            scope.launch {
                repository.payAgent(
                    AgentPaymentEntity(
                        profileId = profileId, agentId = agent.id,
                        amountPaise = amountPaise, mode = mode, dateEpochDay = today
                    )
                )
                payAgent = null
            }
        }
    }
}

@Composable
private fun AgentDetail(profileId: Long, repository: BusinessRepository, agent: AgentEntity) {
    val jobs by repository.observeJobsByAgent(profileId, agent.id).collectAsState(initial = emptyList())
    val payments by repository.observeAgentPayments(agent.id).collectAsState(initial = emptyList())
    val totalCharges = jobs.sumOf { it.agentChargesPaise }
    val totalPaid = payments.sumOf { it.amountPaise }
    val payable = AccountingEngine.agentPayable(totalCharges, totalPaid)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SectionTitle("${agent.name} — Hisab")
        InfoCard("Total Agent Charges", formatRupees(totalCharges))
        InfoCard("Amount Paid", formatRupees(totalPaid))
        InfoCard("Remaining Payable", formatRupees(payable))
        Text("Jobs: ${jobs.size} • Completed: ${jobs.count { it.status.name == "COMPLETED" }} • Pending: ${jobs.count { it.status.name != "COMPLETED" && it.status.name != "CANCELLED" }}")
        jobs.forEach { job ->
            InfoCard(
                "Job #${job.id} — ${job.workDetails}",
                "Charges ${formatRupees(job.agentChargesPaise)}",
                subtitle = "Status: ${job.status} • Service: ${job.service.label}"
            )
        }
    }
}

@Composable
private fun AddAgentDialog(
    onDismiss: () -> Unit,
    onSave: (name: String, mobile: String, type: AgentType) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var mobile by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(AgentType.AADHAAR_NAME_CORRECTION) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Agent") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Agent Name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(mobile, { mobile = it }, label = { Text("Mobile Number") }, modifier = Modifier.fillMaxWidth())
                Text("Agent type: ${type.label} (change with the buttons below)")
                androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { type = AgentType.AADHAAR_NAME_CORRECTION }, modifier = Modifier.weight(1f)) { Text("Aadhaar") }
                    Button(onClick = { type = AgentType.LICENCE }, modifier = Modifier.weight(1f)) { Text("Licence") }
                    Button(onClick = { type = AgentType.OTHER }, modifier = Modifier.weight(1f)) { Text("Other") }
                }
                error?.let { Text(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                when {
                    name.isBlank() -> error = "Enter the agent name."
                    mobile.isBlank() -> error = "Enter the mobile number."
                    else -> onSave(name.trim(), mobile.trim(), type)
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun PayAgentDialog(
    agent: AgentEntity,
    onDismiss: () -> Unit,
    onSave: (amountPaise: Long, mode: PaymentMode) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(PaymentMode.CASH) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pay ${agent.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount (₹)") }, modifier = Modifier.fillMaxWidth())
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
                if (valuePaise == null || valuePaise <= 0) error = "Enter a valid amount."
                else onSave(valuePaise, mode)
            }) { Text("Save Payment") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
