package com.alfalah.business.ui.reports

import android.content.Intent
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
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BarChart
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.FilterPills
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.theme.BizColors
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Reports — reference screen 11. Tabs: Business / Service-wise / Customer.
 * Date-range pills, Business Summary (Income / Expense / Profit), a purple
 * bar chart of the last 7 days, and report rows that share a CSV export.
 * All figures come from recorded entries. Money Transfer contributes only
 * its commission-based profit — the principal is shown separately and is
 * never counted as income.
 */
@Composable
fun ReportsScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val txs by repository.observeTransactions(profileId).collectAsState(initial = emptyList())
    val transfers by repository.observeMoneyTransfers(profileId).collectAsState(initial = emptyList())
    val jobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    val customers by repository.searchCustomers(profileId, "").collectAsState(initial = emptyList())
    val context = LocalContext.current
    var tab by remember { mutableStateOf(0) }
    var period by remember { mutableStateOf("Today") }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    val fromDay = when (period) {
        "This Week" -> today - 6
        "This Month" -> today - 29
        "This Year" -> today - 364
        else -> today
    }
    val periodTxs = txs.filter { it.dateEpochDay in fromDay..today && it.kind != "INTERNAL_TRANSFER" }
    val income = periodTxs.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
    val expenses = periodTxs.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }
    val periodMt = transfers.filter { it.dateEpochDay in fromDay..today }
    val mtProfit = AccountingEngine.moneyTransferProfit(
        periodMt.sumOf { it.commissionPaise },
        periodMt.sumOf { it.chargesPaise },
        0
    )
    val profit = AccountingEngine.netProfit(income, mtProfit, expenses)
    val byService = periodTxs.filter { it.kind == "INCOME" }
        .groupBy { it.category }
        .mapValues { (_, list) -> list.sumOf { it.amountPaise } }
        .toList().sortedByDescending { it.second }
    val totalDue = jobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }
    // Last 7 days of income (bar chart), oldest → newest.
    val last7 = (6 downTo 0).map { back ->
        val day = today - back
        val label = LocalDate.ofEpochDay(day).format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
        label to periodTxs.filter { it.kind == "INCOME" && it.dateEpochDay == day }.sumOf { it.amountPaise }
    }

    val csv = buildString {
        appendLine("BizKhata Report,$period")
        appendLine("Income (paise),$income")
        appendLine("Expenses (paise),$expenses")
        appendLine("Money Transfer Profit (paise),$mtProfit")
        appendLine("Net Profit (paise),$profit")
        appendLine("Customer Due (paise),$totalDue")
        appendLine("Service,Income (paise)")
        byService.forEach { (s, a) -> appendLine("$s,$a") }
    }
    fun shareCsv(title: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "BizKhata $title — $period")
            putExtra(Intent.EXTRA_TEXT, csv)
        }
        context.startActivity(Intent.createChooser(send, "Share report as CSV text"))
    }

    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            listOf("Business", "Service-wise", "Customer").forEachIndexed { i, label ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label) })
            }
        }
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                FilterPills(
                    options = listOf("Today", "This Week", "This Month", "This Year"),
                    selected = period,
                    onSelect = { period = it }
                )
                Text(
                    "${formatDay(fromDay)} — ${formatDay(today)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            when (tab) {
                0 -> {
                    item {
                        BizCard(Modifier.fillMaxWidth()) {
                            SectionTitle("Business Summary")
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                StatCard("Income", formatRupees(income), valueColor = BizColors.IncomeGreen, modifier = Modifier.weight(1f))
                                StatCard("Expense", formatRupees(expenses), valueColor = BizColors.ExpenseRed, modifier = Modifier.weight(1f))
                                StatCard("Profit", formatRupees(profit), valueColor = BizColors.Purple, modifier = Modifier.weight(1f))
                            }
                            Text(
                                "Money Transfer profit ${formatRupees(mtProfit)} (commission only) • " +
                                    "MT principal ${formatRupees(periodMt.sumOf { it.amountPaise })} is not profit",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }
                    }
                    item {
                        BizCard(Modifier.fillMaxWidth()) {
                            SectionTitle("Income — Last 7 Days")
                            BarChart(values = last7)
                        }
                    }
                    item { SectionTitle("Reports") }
                    item {
                        ReportRow("Income Report", "All income in this period") { shareCsv("Income Report") }
                        ReportRow("Expense Report", "All expenses in this period") { shareCsv("Expense Report") }
                        ReportRow("Money Transfer Report", "Commission profit only — principal shown separately") { shareCsv("Money Transfer Report") }
                        ReportRow("Customer Due Report", "Total due ${formatRupees(totalDue)}") { shareCsv("Customer Due Report") }
                    }
                    item {
                        Text(
                            "PDF and Excel file export are in the BizKhata web app, on the same data. Android PDF export is remaining work — see README.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 16.dp)
                        )
                    }
                }
                1 -> {
                    item { SectionTitle("Service-wise Income") }
                    if (byService.isEmpty()) {
                        item { EmptyState("No income recorded in this period yet.") }
                    } else {
                        items(byService) { (service, amount) ->
                            BizCard(Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(service, fontWeight = FontWeight.SemiBold)
                                    Text(formatRupees(amount), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    item {
                        ReportRow("Service-wise Report", "Income per service in this period") { shareCsv("Service-wise Report") }
                        Spacer(Modifier.height(16.dp))
                    }
                }
                2 -> {
                    item { SectionTitle("Customer Report") }
                    if (customers.isEmpty()) {
                        item { EmptyState("No customers yet.") }
                    } else {
                        items(customers) { customer ->
                            val cJobs = jobs.filter { it.customerId == customer.id }
                            val due = cJobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }
                            val paid = cJobs.sumOf { it.amountReceivedPaise }
                            BizCard(Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Column(Modifier.weight(1f)) {
                                        Text(customer.name, fontWeight = FontWeight.SemiBold)
                                        Text(
                                            "${cJobs.size} jobs • ${customer.service.label}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text("Due ${formatRupees(due)}", fontWeight = FontWeight.Bold, color = if (due > 0) BizColors.ExpenseRed else BizColors.IncomeGreen)
                                        Text("Paid ${formatRupees(paid)}", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                    item {
                        ReportRow("Customer Due Report", "Total due ${formatRupees(totalDue)}") { shareCsv("Customer Due Report") }
                        Spacer(Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportRow(title: String, subtitle: String, onClick: () -> Unit) {
    BizCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = "Open report")
        }
    }
}
