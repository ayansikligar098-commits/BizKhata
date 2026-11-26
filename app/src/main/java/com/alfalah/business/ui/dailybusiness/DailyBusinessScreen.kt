package com.alfalah.business.ui.dailybusiness

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.DailyBusiness
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.DonutChart
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.FilterPills
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.components.parseRupeesToPaise
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Daily Business (Daily Dhandha) — the ONE central daily-business hub
 * (brief 2026-11-26 22:04 IST). Same route / nav entry as before
 * (Routes.DAILY_BUSINESS, "Daily Dhandha" in the drawer); the old screen
 * was just the Reports screen reused, this is the real hub.
 *
 * Shows, for the selected day / week / month / year: Today's Total
 * Collection, Cash Collection, UPI Collection, Expenses, Net Earnings,
 * Service-wise Collection, Total Transactions and Recent Entries — all
 * derived from the single `transactions` table, so anything entered in
 * a service module (job payment, MT commission) is already here and
 * anything entered here is already in the books. Tapping a service row
 * opens that service's own module (D of the brief).
 *
 * The app starts empty: every figure is ₹0 until a real entry exists.
 */
@Composable
fun DailyBusinessScreen(
    profileId: Long,
    repository: BusinessRepository,
    settings: SettingsStore,
    language: AppLanguage,
    viewModel: DailyBusinessViewModel,
    onOpen: (String) -> Unit
) {
    val state by viewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    var showAdd by remember { mutableStateOf(false) }
    val totals = state.totals

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Daily Business", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                IconButton(onClick = { onOpen(Routes.CHATBOT) }) {
                    Icon(Icons.Filled.Chat, contentDescription = "AI Assistant", tint = BizColors.Purple)
                }
            }
            Text(
                "Daily Dhandha — all of today's small work in one place. Entries from the service modules appear here automatically; nothing is entered twice.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item {
            FilterPills(
                options = DailyBusinessPeriod.values().map { it.label },
                selected = state.period.label,
                onSelect = { label ->
                    viewModel.selectPeriod(DailyBusinessPeriod.values().first { it.label == label })
                }
            )
            Row(
                Modifier.fillMaxWidth().padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                IconButton(onClick = { viewModel.stepDay(-1) }) {
                    Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous day")
                }
                Text(
                    if (state.period == DailyBusinessPeriod.TODAY) formatDay(state.selectedDay)
                    else "${formatDay(state.fromDay)} — ${formatDay(state.selectedDay)}",
                    fontWeight = FontWeight.SemiBold
                )
                IconButton(onClick = { viewModel.stepDay(1) }) {
                    Icon(Icons.Filled.ChevronRight, contentDescription = "Next day")
                }
                TextButton(onClick = { viewModel.goToday() }) { Text("Today") }
            }
        }
        item {
            PrimaryButton("+ Add Daily Entry") { showAdd = true }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Total Collection", formatRupees(totals.totalCollectionPaise), valueColor = BizColors.Purple, modifier = Modifier.weight(1f))
                StatCard("Net Earnings", formatRupees(totals.netEarningsPaise), valueColor = BizColors.IncomeGreen, modifier = Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Cash Collection", formatRupees(totals.cashCollectionPaise), modifier = Modifier.weight(1f))
                StatCard("UPI Collection", formatRupees(totals.upiCollectionPaise), modifier = Modifier.weight(1f))
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Expenses", formatRupees(totals.expensesPaise), valueColor = BizColors.ExpenseRed, modifier = Modifier.weight(1f))
                StatCard("Total Transactions", "${totals.transactionCount}", modifier = Modifier.weight(1f))
            }
        }
        item {
            BizCard(Modifier.fillMaxWidth()) {
                SectionTitle("Service-wise Collection")
                DonutChart(
                    segments = state.serviceWise.filter { it.amountPaise > 0 }
                        .map { it.label to it.amountPaise },
                    totalPaise = totals.totalCollectionPaise
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Money Transfer principal ${formatRupees(state.moneyTransferPrincipalPaise)} is tracked separately — only the commission ${formatRupees(state.moneyTransferCommissionPaise)} counts as collection.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = state.filterService == "All",
                        onClick = { viewModel.selectServiceFilter("All") },
                        label = { Text("All Services") },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = BizColors.Purple,
                            selectedLabelColor = Color.White
                        )
                    )
                }
                state.serviceWise.forEach { row ->
                    item {
                        FilterChip(
                            selected = state.filterService == row.label,
                            onClick = { viewModel.selectServiceFilter(row.label) },
                            label = { Text(row.label) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = BizColors.Purple,
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            }
        }
        item { SectionTitle("Combined Service Summary") }
        items(state.serviceWise) { row ->
            val route = routeForServiceLabel(row.label)
            BizCard(
                Modifier.fillMaxWidth(),
                onClick = route?.let { { onOpen(it) } }
            ) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(row.label, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${row.count} ${if (row.count == 1) "entry" else "entries"}" +
                                if (route != null) " • Tap to open module" else "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(formatRupees(row.amountPaise), fontWeight = FontWeight.Bold)
                }
            }
        }
        item { SectionTitle("Recent Entries") }
        if (state.recentEntries.isEmpty()) {
            item {
                EmptyState(
                    "No entries in this period yet. Add a daily entry above, or record work in a service module — it will appear here automatically.",
                    actionLabel = "Add Daily Entry",
                    onAction = { showAdd = true }
                )
            }
        } else {
            items(state.recentEntries) { tx ->
                BizCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(tx.category, fontWeight = FontWeight.SemiBold)
                            Text(
                                tx.description.ifBlank { "—" },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "${formatDay(tx.dateEpochDay)} • ${tx.mode.name}" +
                                    if (tx.relatedJobId != null) " • Job #${tx.relatedJobId}" else " • Daily entry",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Text(
                            (if (tx.kind == "INCOME") "+" else "−") + formatRupees(tx.amountPaise),
                            fontWeight = FontWeight.Bold,
                            color = if (tx.kind == "INCOME") BizColors.IncomeGreen else BizColors.ExpenseRed
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showAdd) {
        QuickDailyEntryDialog(
            selectedDay = state.selectedDay,
            customServices = state.customServices,
            onDismiss = { showAdd = false },
            onSave = { entry ->
                scope.launch {
                    repository.addDailyEntry(
                        profileId = profileId,
                        service = entry.service,
                        serviceLabel = entry.serviceLabel,
                        description = entry.description,
                        quantity = entry.quantity,
                        ratePaise = entry.ratePaise,
                        totalPaise = entry.totalPaise,
                        mode = entry.mode,
                        dayEpoch = entry.dayEpoch,
                        createdAtEpochMs = entry.createdAtEpochMs,
                        directExpensePaise = entry.directExpensePaise,
                        notes = entry.notes
                    )
                    showAdd = false
                }
            }
        )
    }
}

/** Module route for a summary row, or null when the service has no module
 *  (Other / a custom service lives only in Daily Business). */
private fun routeForServiceLabel(label: String): String? = when (label) {
    DailyBusiness.MONEY_TRANSFER_COMMISSION_LABEL -> Routes.MONEY_TRANSFER
    else -> ServiceType.values().firstOrNull { it.label == label }?.let { Routes.service(it.name) }
}

private data class DailyEntryInput(
    val service: ServiceType?,
    val serviceLabel: String,
    val description: String,
    val quantity: Long,
    val ratePaise: Long,
    val totalPaise: Long,
    val mode: PaymentMode,
    val dayEpoch: Long,
    val createdAtEpochMs: Long,
    val directExpensePaise: Long,
    val notes: String
)

/**
 * Quick Daily Entry form (brief B): Date and Time, Service Category,
 * Description, Quantity, Rate, Total Amount, Payment Mode (Cash / UPI /
 * Other), Direct Expense if applicable, Notes.
 * Total is worked out from Quantity × Rate as you type, and can still be
 * edited by hand (e.g. a discount). The entry is saved once, in the
 * correct service category, and appears in Daily Business, the Cash/UPI
 * Book and Reports from that single row.
 */
@Composable
private fun QuickDailyEntryDialog(
    selectedDay: Long,
    customServices: Set<String>,
    onDismiss: () -> Unit,
    onSave: (DailyEntryInput) -> Unit
) {
    val serviceOptions: List<Pair<String, ServiceType?>> =
        DailyBusiness.quickEntryServices.map { it.label to it } +
            customServices.sorted().map { it to null }
    var selectedOption by remember { mutableStateOf(serviceOptions.first()) }
    var menuOpen by remember { mutableStateOf(false) }
    var day by remember { mutableStateOf(selectedDay) }
    var timeText by remember {
        mutableStateOf(LocalTime.now(ZoneOffset.UTC).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")))
    }
    var description by remember { mutableStateOf("") }
    var quantityText by remember { mutableStateOf("1") }
    var rateText by remember { mutableStateOf("") }
    var totalText by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(PaymentMode.CASH) }
    var expenseText by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    fun recomputeTotal(qty: String, rate: String) {
        val qtyValue = qty.toLongOrNull()
        val ratePaise = parseRupeesToPaise(rate)
        if (qtyValue != null && ratePaise != null) {
            try {
                val totalPaise = AccountingEngine.quickEntryTotal(qtyValue, ratePaise)
                totalText = paiseToRupeesText(totalPaise)
            } catch (_: IllegalArgumentException) {
                // Out of range — leave the total alone; validation reports it.
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Daily Entry") },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { day -= 1 }) {
                        Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous day")
                    }
                    Text("Date: ${formatDay(day)}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    IconButton(onClick = { day += 1 }) {
                        Icon(Icons.Filled.ChevronRight, contentDescription = "Next day")
                    }
                }
                OutlinedTextField(
                    timeText, { timeText = it },
                    label = { Text("Time (HH:MM, 24-hour)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true
                )
                Button(onClick = { menuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Service: ${selectedOption.first}")
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    serviceOptions.forEach { option ->
                        DropdownMenuItem(
                            text = { Text(option.first) },
                            onClick = { selectedOption = option; menuOpen = false }
                        )
                    }
                }
                Text(
                    "Add your own services in Customization Studio — they appear here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    description, { description = it },
                    label = { Text("Description (e.g. 10 xerox copies)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        quantityText,
                        {
                            quantityText = it
                            recomputeTotal(it, rateText)
                        },
                        label = { Text("Quantity") },
                        modifier = Modifier.weight(1f), singleLine = true
                    )
                    OutlinedTextField(
                        rateText,
                        {
                            rateText = it
                            recomputeTotal(quantityText, it)
                        },
                        label = { Text("Rate (₹)") },
                        modifier = Modifier.weight(1f), singleLine = true
                    )
                }
                OutlinedTextField(
                    totalText, { totalText = it },
                    label = { Text("Total Amount (₹)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true
                )
                Text("How was it paid? Cash and UPI are separate accounts.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(PaymentMode.CASH, PaymentMode.UPI, PaymentMode.OTHER).forEach { m ->
                        Button(
                            onClick = { mode = m },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (mode == m) BizColors.Purple
                                else MaterialTheme.colorScheme.surfaceVariant,
                                contentColor = if (mode == m) Color.White
                                else MaterialTheme.colorScheme.onSurface
                            )
                        ) { Text(m.name) }
                    }
                }
                OutlinedTextField(
                    expenseText, { expenseText = it },
                    label = { Text("Direct Expense (₹) — if any") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true
                )
                Text(
                    "A direct expense is paid from the same Cash/UPI account and is counted once as an expense.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    notes, { notes = it },
                    label = { Text("Notes (optional)") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true
                )
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val qtyValue = quantityText.toLongOrNull()
                val ratePaise = parseRupeesToPaise(rateText)
                val totalPaise = parseRupeesToPaise(totalText)
                val expensePaise = if (expenseText.isBlank()) 0L else parseRupeesToPaise(expenseText)
                val timeParts = timeText.trim().split(":")
                val hour = timeParts.getOrNull(0)?.toIntOrNull()
                val minute = timeParts.getOrNull(1)?.toIntOrNull()
                when {
                    description.isBlank() -> error = "Enter a description."
                    qtyValue == null || qtyValue < 1 -> error = "Enter a valid quantity (1 or more)."
                    ratePaise == null -> error = "Enter a valid rate."
                    totalPaise == null || totalPaise <= 0 -> error = "Enter a valid total amount."
                    expensePaise == null || expensePaise < 0 -> error = "Enter a valid direct expense (or leave it blank)."
                    hour == null || minute == null || hour !in 0..23 || minute !in 0..59 ->
                        error = "Enter the time as HH:MM (24-hour, e.g. 14:30)."
                    else -> {
                        val createdAt = LocalDate.ofEpochDay(day).atTime(hour, minute)
                            .toInstant(ZoneOffset.UTC).toEpochMilli()
                        onSave(
                            DailyEntryInput(
                                service = selectedOption.second,
                                serviceLabel = selectedOption.first,
                                description = description.trim(),
                                quantity = qtyValue,
                                ratePaise = ratePaise,
                                totalPaise = totalPaise,
                                mode = mode,
                                dayEpoch = day,
                                createdAtEpochMs = createdAt,
                                directExpensePaise = expensePaise,
                                notes = notes.trim()
                            )
                        )
                    }
                }
            }) { Text("Save Entry") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

/** Paise → editable rupee text ("12" or "12.50"). Integer maths only. */
private fun paiseToRupeesText(amountPaise: Long): String {
    val rupees = amountPaise / 100
    val paise = amountPaise % 100
    return if (paise == 0L) "$rupees" else "$rupees.${paise.toString().padStart(2, '0')}"
}
