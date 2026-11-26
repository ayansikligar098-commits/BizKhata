package com.alfalah.business.ui.reports

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Reports + Daily Business. All figures come from recorded entries.
 * Export: CSV text share (WhatsApp / email / files). PDF and Excel export
 * are implemented in the BizKhata web app on the same data model;
 * the Android file export (PDF) is listed as remaining work in the README.
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
    val context = LocalContext.current
    var period by remember { mutableStateOf("Today") }
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    val fromDay = when (period) {
        "This Week" -> today - 6
        "This Month" -> today - 29
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
    val totalDue = jobs.sumOf {
        AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Reports — Daily Business")
            androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Today", "This Week", "This Month").forEach { p ->
                    Button(onClick = { period = p }) { Text(if (period == p) "✓ $p" else p) }
                }
            }
            InfoCard("Income ($period)", formatRupees(income))
            InfoCard("Expenses ($period)", formatRupees(expenses))
            InfoCard(
                "Money Transfer Profit ($period)",
                formatRupees(mtProfit),
                subtitle = "Commission only — principal ${formatRupees(periodMt.sumOf { it.amountPaise })} is not profit"
            )
            InfoCard("Net Profit ($period)", formatRupees(profit))
            InfoCard("Customer Due (all time)", formatRupees(totalDue))
        }
        item { SectionTitle("Service-wise Income") }
        if (byService.isEmpty()) {
            item { Text("No income recorded in this period yet.") }
        } else {
            byService.forEach { (service, amount) ->
                item { InfoCard(service, formatRupees(amount)) }
            }
        }
        item {
            Button(
                onClick = {
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
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "BizKhata Report — $period")
                        putExtra(Intent.EXTRA_TEXT, csv)
                    }
                    context.startActivity(Intent.createChooser(send, "Share report as CSV text"))
                },
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
            ) { Text("Export Report (CSV — share)") }
            Text("PDF and Excel file export are in the BizKhata web app, on the same data. Android PDF export is remaining work — see README.")
        }
    }
}
