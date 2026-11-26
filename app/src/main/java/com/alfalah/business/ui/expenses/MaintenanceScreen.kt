package com.alfalah.business.ui.expenses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.entity.EquipmentEntity
import com.alfalah.business.data.entity.MaintenanceEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Machine Maintenance — its own screen (reference screen 10's machines,
 * split out of Expenses). One card per machine: name, Total Cost
 * (lifetime maintenance cost), Last Service date, next service due.
 * Tap a machine for its maintenance history; add a machine or a
 * maintenance entry (work done, parts replaced, cost, next due date).
 */
@Composable
fun MaintenanceScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val equipment by repository.observeEquipment(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAddEquipment by remember { mutableStateOf(false) }
    var selectedEquipment by remember { mutableStateOf<EquipmentEntity?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Text(
                "Machine Maintenance",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Your Xerox machine, printers, computer and scanner — service history and lifetime cost in one place.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            PrimaryButton("Add Machine") { showAddEquipment = true }
        }
        if (equipment.isEmpty()) {
            item {
                EmptyState(
                    "No machines yet. Add your Xerox machine, Epson printer, computer or scanner.",
                    actionLabel = "Add Machine",
                    onAction = { showAddEquipment = true }
                )
            }
        } else {
            items(equipment) { eq ->
                EquipmentCard(
                    profileId = profileId,
                    repository = repository,
                    equipment = eq,
                    expanded = selectedEquipment?.id == eq.id,
                    onToggle = {
                        selectedEquipment = if (selectedEquipment?.id == eq.id) null else eq
                    }
                )
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showAddEquipment) {
        AddEquipmentDialog(onDismiss = { showAddEquipment = false }) { name ->
            scope.launch {
                repository.addEquipment(EquipmentEntity(profileId = profileId, name = name))
                showAddEquipment = false
            }
        }
    }
}

@Composable
private fun EquipmentCard(
    profileId: Long,
    repository: BusinessRepository,
    equipment: EquipmentEntity,
    expanded: Boolean,
    onToggle: () -> Unit
) {
    val history by repository.observeMaintenanceByEquipment(equipment.id).collectAsState(initial = emptyList())
    var lifetime by remember { mutableStateOf(0L) }
    var showAdd by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    LaunchedEffect(equipment.id, history.size) {
        lifetime = repository.lifetimeCost(equipment.id)
    }
    val lastService = history.maxByOrNull { it.dateEpochDay }
    val nextDue = history.mapNotNull { it.nextMaintenanceEpochDay }.maxOrNull()

    BizCard(Modifier.fillMaxWidth(), onClick = onToggle) {
        Text(equipment.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(
            "Total Cost: ${formatRupees(lifetime)} • Last Service: ${lastService?.let { formatDay(it.dateEpochDay) } ?: "Never"}",
            style = MaterialTheme.typography.bodyMedium
        )
        Text(
            "Next service due: ${nextDue?.let { formatDay(it) } ?: "Not set"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (expanded) {
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { showAdd = true },
                modifier = Modifier.fillMaxWidth(),
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
            ) { Text("Add Maintenance") }
            Spacer(Modifier.height(8.dp))
            if (history.isEmpty()) {
                EmptyState("No maintenance recorded for ${equipment.name} yet.")
            } else {
                history.forEach { m ->
                    BizCard(Modifier.fillMaxWidth()) {
                        Text(m.workDone, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Parts: ${m.partsReplaced.ifBlank { "—" }} • Cost: ${formatRupees(m.costPaise)} • ${formatDay(m.dateEpochDay)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (m.nextMaintenanceEpochDay != null) {
                            Text(
                                "Next due: ${formatDay(m.nextMaintenanceEpochDay!!)}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }

    if (showAdd) {
        AddMaintenanceDialog(onDismiss = { showAdd = false }) { work, parts, costPaise, vendor ->
            scope.launch {
                repository.addMaintenance(
                    MaintenanceEntity(
                        profileId = profileId, equipmentId = equipment.id,
                        dateEpochDay = today, workDone = work,
                        partsReplaced = parts, costPaise = costPaise, vendor = vendor
                    )
                )
                lifetime = repository.lifetimeCost(equipment.id)
                showAdd = false
            }
        }
    }
}

@Composable
private fun AddEquipmentDialog(onDismiss: () -> Unit, onSave: (name: String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Machine") },
        text = {
            OutlinedTextField(name, { name = it }, label = { Text("Machine name (e.g. Epson L805)") }, modifier = Modifier.fillMaxWidth())
        },
        confirmButton = {
            TextButton(onClick = { if (name.isNotBlank()) onSave(name.trim()) }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddMaintenanceDialog(
    onDismiss: () -> Unit,
    onSave: (work: String, parts: String, costPaise: Long, vendor: String) -> Unit
) {
    var work by remember { mutableStateOf("") }
    var parts by remember { mutableStateOf("") }
    var cost by remember { mutableStateOf("") }
    var vendor by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Maintenance") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(work, { work = it }, label = { Text("Work done") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(parts, { parts = it }, label = { Text("Parts replaced (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(cost, { cost = it }, label = { Text("Cost (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(vendor, { vendor = it }, label = { Text("Vendor (optional)") }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val costPaise = parseRupeesToPaise(cost)
                when {
                    work.isBlank() -> error = "Enter the work done."
                    costPaise == null || costPaise < 0 -> error = "Enter a valid cost."
                    else -> onSave(work.trim(), parts.trim(), costPaise, vendor.trim())
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
