package com.alfalah.business.ui.expenses

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.FilterPills
import com.alfalah.business.ui.components.SearchField
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Expenses — reference screen 10. Category chips (General, Machine,
 * Stationery, Utility), month label, search, expense rows (icon, title,
 * date + category, amount). Direct costs can be linked to a service so
 * that service's profit is accurate; shared expenses stay separate.
 * Machine Maintenance lives on its own screen (drawer → Machine Maintenance).
 */
@Composable
fun ExpensesScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    onOpenMaintenance: () -> Unit
) {
    val expenses by repository.observeExpenses(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf("All") }
    var query by remember { mutableStateOf("") }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    val monthLabel = LocalDate.now(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH))
    val thisMonth = expenses.filter {
        val d = LocalDate.ofEpochDay(it.dateEpochDay)
        val now = LocalDate.now(ZoneOffset.UTC)
        d.year == now.year && d.month == now.month
    }
    val totalThisMonth = thisMonth.sumOf { it.amountPaise }

    val visible = expenses.filter { e ->
        val categoryOk = when (category) {
            "Machine" -> e.category.contains("Machine", ignoreCase = true) ||
                e.category.contains("Repair", ignoreCase = true) ||
                e.category.contains("Servicing", ignoreCase = true) ||
                e.category.contains("Ink", ignoreCase = true) ||
                e.category.contains("Toner", ignoreCase = true) ||
                e.category.contains("Cartridge", ignoreCase = true) ||
                e.category.contains("Printhead", ignoreCase = true) ||
                e.category.contains("Spare", ignoreCase = true)
            "Stationery" -> e.category.contains("Paper", ignoreCase = true) ||
                e.category.contains("Stationery", ignoreCase = true)
            "Utility" -> e.category.contains("Electricity", ignoreCase = true) ||
                e.category.contains("Internet", ignoreCase = true) ||
                e.category.contains("Rent", ignoreCase = true)
            "General" -> !e.category.contains("Machine", ignoreCase = true) &&
                !e.category.contains("Repair", ignoreCase = true) &&
                !e.category.contains("Paper", ignoreCase = true) &&
                !e.category.contains("Electricity", ignoreCase = true) &&
                !e.category.contains("Internet", ignoreCase = true) &&
                !e.category.contains("Rent", ignoreCase = true)
            else -> true
        }
        val queryOk = query.isBlank() ||
            e.description.contains(query, ignoreCase = true) ||
            e.category.contains(query, ignoreCase = true) ||
            e.vendor.contains(query, ignoreCase = true)
        categoryOk && queryOk
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAdd = true },
                containerColor = BizColors.Purple,
                contentColor = Color.White
            ) { Icon(Icons.Filled.Add, contentDescription = "Add expense") }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterPills(
                            options = listOf("All", "General", "Machine", "Stationery", "Utility"),
                            selected = category,
                            onSelect = { category = it }
                        )
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(monthLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    TextButton(onClick = onOpenMaintenance) { Text("Machine Maintenance →") }
                }
                StatCard(
                    "Total Expenses — $monthLabel",
                    formatRupees(totalThisMonth),
                    valueColor = BizColors.ExpenseRed
                )
            }
            item {
                SearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = "Search expenses..."
                )
            }
            if (visible.isEmpty()) {
                item {
                    EmptyState(
                        if (expenses.isEmpty()) "No expenses recorded yet. Tap + to add your first expense."
                        else "No expenses match this filter.",
                        actionLabel = "Add Expense",
                        onAction = { showAdd = true }
                    )
                }
            } else {
                items(visible) { e ->
                    BizCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.Receipt,
                                contentDescription = null,
                                tint = BizColors.Purple,
                                modifier = Modifier.padding(end = 12.dp)
                            )
                            Column(Modifier.weight(1f)) {
                                Text(e.description.ifBlank { e.category }, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "${formatDay(e.dateEpochDay)} • ${e.category}" +
                                        if (e.vendor.isNotBlank()) " • ${e.vendor}" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(formatRupees(e.amountPaise), fontWeight = FontWeight.Bold, color = BizColors.ExpenseRed)
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(72.dp)) }
        }
    }

    if (showAdd) {
        AddExpenseDialog(onDismiss = { showAdd = false }) { cat, description, amountPaise, vendor, mode ->
            scope.launch {
                repository.addExpense(
                    ExpenseEntity(
                        profileId = profileId, category = cat,
                        description = description, amountPaise = amountPaise,
                        mode = mode, vendor = vendor, dateEpochDay = today
                    )
                )
                showAdd = false
            }
        }
    }
}

@Composable
private fun AddExpenseDialog(
    onDismiss: () -> Unit,
    onSave: (category: String, description: String, amountPaise: Long, vendor: String, mode: PaymentMode) -> Unit
) {
    var category by remember { mutableStateOf("General") }
    var description by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var vendor by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(PaymentMode.CASH) }
    var error by remember { mutableStateOf<String?>(null) }
    val categories = listOf(
        "General", "Machine Repair", "Printer Repair", "Servicing", "Ink", "Toner",
        "Cartridge", "Paper", "Stationery", "Printhead", "Spare Parts", "Electricity",
        "Internet", "Rent", "Staff Expenses", "Transport", "Other Expenses"
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Expense") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Category: $category")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(categories) { c ->
                        Button(onClick = { category = c }) { Text(c) }
                    }
                }
                OutlinedTextField(description, { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(amount, { amount = it }, label = { Text("Amount (₹)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(vendor, { vendor = it }, label = { Text("Vendor (optional)") }, modifier = Modifier.fillMaxWidth())
                Text("How was it paid?")
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
                val amountPaise = parseRupeesToPaise(amount)
                when {
                    description.isBlank() -> error = "Enter a description."
                    amountPaise == null || amountPaise <= 0 -> error = "Enter a valid amount."
                    else -> onSave(category, description.trim(), amountPaise, vendor.trim(), mode)
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
