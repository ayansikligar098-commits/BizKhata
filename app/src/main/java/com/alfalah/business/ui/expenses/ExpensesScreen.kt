package com.alfalah.business.ui.expenses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
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
import com.alfalah.business.data.entity.EquipmentEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.MaintenanceEntity
import com.alfalah.business.data.repository.BusinessRepository
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
 * Expenses + Machine Maintenance. Direct costs can be linked to a service
 * (so that service's profit is accurate); shared expenses stay separate.
 * Each equipment has its own maintenance history and lifetime cost.
 */
@Composable
fun ExpensesScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val expenses by repository.observeExpenses(profileId).collectAsState(initial = emptyList())
    val equipment by repository.observeEquipment(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAddExpense by remember { mutableStateOf(false) }
    var showAddEquipment by remember { mutableStateOf(false) }
    var selectedEquipment by remember { mutableStateOf<EquipmentEntity?>(null) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    val totalToday = expenses.filter { it.dateEpochDay == today }.sumOf { it.amountPaise }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Expenses")
            InfoCard("Today's Expenses", formatRupees(totalToday))
            BigButton("Add Expense") { showAddExpense = true }
            BigButton("Add Equipment") { showAddEquipment = true }
        }
        item { SectionTitle("Equipment & Maintenance") }
        if (equipment.isEmpty()) {
            item { EmptyState("No equipment yet. Add your Xerox machine, Epson printer, computer or scanner.") }
        } else {
            items(equipment) { eq ->
                InfoCard(eq.name, "Tap to see maintenance history")
                androidx.compose.material3.Button(
                    onClick = { selectedEquipment = eq },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Maintenance History") }
            }
        }
        selectedEquipment?.let { eq ->
            item { EquipmentHistory(profileId, repository, eq) }
        }
        item { SectionTitle("All Expenses") }
        if (expenses.isEmpty()) {
            item { EmptyState("No expenses recorded yet.") }
        } else {
            items(expenses) { e ->
                InfoCard(
                    e.category,
                    formatRupees(e.amountPaise),
                    subtitle = "${e.description} • ${e.mode} • Vendor: ${e.vendor.ifBlank { "—" }}"
                )
            }
        }
    }

    if (showAddExpense) {
        AddExpenseDialog(onDismiss = { showAddExpense = false }) { category, description, amountPaise, vendor ->
            scope.launch {
                repository.addExpense(
                    ExpenseEntity(
                        profileId = profileId, category = category,
                        description = description, amountPaise = amountPaise,
                        mode = PaymentMode.CASH, vendor = vendor, dateEpochDay = today
                    )
                )
                showAddExpense = false
            }
        }
    }

    if (showAddEquipment) {
        AddEquipmentDialog(onDismiss = { showAddEquipment = false }) { name ->
            scope.launch {
                repository.addEquipment(
                    EquipmentEntity(profileId = profileId, name = name)
                )
                showAddEquipment = false
            }
        }
    }
}

@Composable
private fun EquipmentHistory(
    profileId: Long,
    repository: BusinessRepository,
    equipment: EquipmentEntity
) {
    val history by repository.observeMaintenanceByEquipment(equipment.id).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var lifetime by remember { mutableStateOf(0L) }
    var showAdd by remember { mutableStateOf(false) }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    androidx.compose.runtime.LaunchedEffect(equipment.id) {
        lifetime = repository.lifetimeCost(equipment.id)
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        InfoCard("${equipment.name} — Lifetime Maintenance Cost", formatRupees(lifetime))
        BigButton("Add Maintenance") { showAdd = true }
        if (history.isEmpty()) {
            EmptyState("No maintenance recorded for ${equipment.name} yet.")
        } else {
            history.forEach { m ->
                InfoCard(
                    m.workDone,
                    formatRupees(m.costPaise),
                    subtitle = "Parts: ${m.partsReplaced.ifBlank { "—" }} • Next due: ${m.nextMaintenanceEpochDay?.toString() ?: "—"}"
                )
            }
        }
    }
    if (showAdd) {
        AddMaintenanceDialog(onDismiss = { showAdd = false }) { work, parts, costPaise ->
            scope.launch {
                repository.addMaintenance(
                    MaintenanceEntity(
                        profileId = profileId, equipmentId = equipment.id,
                        dateEpochDay = today, workDone = work,
                        partsReplaced = parts, costPaise = costPaise
                    )
                )
                lifetime = repository.lifetimeCost(equipment.id)
                showAdd = false
            }
        }
    }
}

@Composable
private fun AddExpenseDialog(
    onDismiss: () -> Unit,
    onSave: (category: String, description: String, amountPaise: Long, vendor: String) -> Unit
) {
    var category by remember { mutableStateOf("Machine Repair") }
    var description by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var vendor by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val categories = listOf(
        "Machine Repair", "Printer Repair", "Servicing", "Ink", "Toner",
        "Cartridge", "Paper", "Printhead", "Spare Parts", "Electricity",
        "Internet", "Rent", "Staff Expenses", "Transport", "Other Expenses"
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Expense") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Category: $category")
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    categories.take(6).forEach { c ->
                        androidx.compose.material3.Button(onClick = { category = c }) { Text(c) }
                    }
                }
                OutlinedTextField(description, { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(vendor, { vendor = it }, label = { Text("Vendor (optional)") }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val amountPaise = parseRupeesToPaise(amount)
                when {
                    description.isBlank() -> error = "Enter a description."
                    amountPaise == null || amountPaise <= 0 -> error = "Enter a valid amount."
                    else -> onSave(category, description.trim(), amountPaise, vendor.trim())
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun AddEquipmentDialog(onDismiss: () -> Unit, onSave: (name: String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Equipment") },
        text = {
            OutlinedTextField(name, { name = it }, label = { Text("Equipment name (e.g. Epson L805)") }, modifier = Modifier.fillMaxWidth())
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
    onSave: (work: String, parts: String, costPaise: Long) -> Unit
) {
    var work by remember { mutableStateOf("") }
    var parts by remember { mutableStateOf("") }
    var cost by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Maintenance") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(work, { work = it }, label = { Text("Work done") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(parts, { parts = it }, label = { Text("Parts replaced (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(cost, { cost = it }, label = { Text("Cost (₹)") }, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val costPaise = parseRupeesToPaise(cost)
                when {
                    work.isBlank() -> error = "Enter the work done."
                    costPaise == null || costPaise < 0 -> error = "Enter a valid cost."
                    else -> onSave(work.trim(), parts.trim(), costPaise)
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
