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
import com.alfalah.business.domain.AgentType
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.AvatarCircle
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.components.SearchField
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Agent Management — reference screen 9. Summary (Total Agents / Total
 * Jobs / Total Charges), search, agent cards (avatar, name, jobs count,
 * payable). Agent payable is its own ledger, separate from customer
 * receivable. PAN never appears here: ayan makes PAN cards himself.
 */
@Composable
fun AgentScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    onOpenAgent: (Long) -> Unit
) {
    val agents by repository.observeAgents(profileId).collectAsState(initial = emptyList())
    val allJobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    var payAgent by remember { mutableStateOf<AgentEntity?>(null) }
    var query by remember { mutableStateOf("") }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    val agentJobs = allJobs.filter { it.agentId != null }
    val totalCharges = agentJobs.sumOf { it.agentChargesPaise }
    val visible = agents.filter { agent ->
        query.isBlank() ||
            agent.name.contains(query, ignoreCase = true) ||
            agent.mobile.contains(query)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Total Agents", agents.size.toString(), modifier = Modifier.weight(1f))
                StatCard("Total Jobs", agentJobs.size.toString(), modifier = Modifier.weight(1f))
                StatCard("Total Charges", formatRupees(totalCharges), modifier = Modifier.weight(1f))
            }
        }
        item {
            SearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search agent by name or mobile..."
            )
        }
        item {
            PrimaryButton("+ Add Agent") { showAdd = true }
        }
        item {
            Text(
                "Agents do Aadhaar name / number / biometric work and licence work that cannot be done from the shop. You bring the customer and print. PAN is done by you — never by an agent.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (visible.isEmpty()) {
            item {
                EmptyState(
                    if (agents.isEmpty()) "No agents yet. Add your first agent above."
                    else "No agent matches this search.",
                    actionLabel = "Add Agent",
                    onAction = { showAdd = true }
                )
            }
        } else {
            items(visible) { agent ->
                AgentCard(
                    profileId = profileId,
                    repository = repository,
                    agent = agent,
                    onOpen = { onOpenAgent(agent.id) },
                    onPay = { payAgent = agent }
                )
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
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

/** One agent card: its own jobs/payments flows, so the payable is always live. */
@Composable
private fun AgentCard(
    profileId: Long,
    repository: BusinessRepository,
    agent: AgentEntity,
    onOpen: () -> Unit,
    onPay: () -> Unit
) {
    val jobs by repository.observeJobsByAgent(profileId, agent.id).collectAsState(initial = emptyList())
    val payments by repository.observeAgentPayments(agent.id).collectAsState(initial = emptyList())
    val totalCharges = jobs.sumOf { it.agentChargesPaise }
    val totalPaid = payments.sumOf { it.amountPaise }
    val payable = com.alfalah.business.domain.AccountingEngine.agentPayable(totalCharges, totalPaid)
    BizCard(Modifier.fillMaxWidth(), onClick = onOpen) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarCircle(agent.name)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(agent.name, fontWeight = FontWeight.SemiBold)
                Text(
                    "${jobs.size} Jobs • ${agent.type.label} • ${agent.mobile}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Payable", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    formatRupees(payable),
                    fontWeight = FontWeight.Bold,
                    color = if (payable > 0) BizColors.ExpenseRed else BizColors.IncomeGreen
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onOpen,
                modifier = Modifier.weight(1f),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            ) { Text("View Jobs & Payments") }
            Button(
                onClick = onPay,
                modifier = Modifier.weight(1f),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
            ) { Text("Pay Agent") }
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
                Text("Agent type: ${type.label}")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { type = AgentType.AADHAAR_NAME_CORRECTION }, modifier = Modifier.weight(1f)) { Text("Aadhaar") }
                    Button(onClick = { type = AgentType.LICENCE }, modifier = Modifier.weight(1f)) { Text("Licence") }
                    Button(onClick = { type = AgentType.OTHER }, modifier = Modifier.weight(1f)) { Text("Other") }
                }
                error?.let { Text(it, color = BizColors.ExpenseRed) }
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
                if (valuePaise == null || valuePaise <= 0) error = "Enter a valid amount."
                else onSave(valuePaise, mode)
            }) { Text("Save Payment") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
