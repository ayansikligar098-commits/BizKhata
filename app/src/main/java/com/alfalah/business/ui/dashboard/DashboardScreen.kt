package com.alfalah.business.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.language.Strings

/**
 * Dashboard — the first screen after login. Every figure is calculated
 * from recorded entries by DashboardViewModel. Billing, received, due,
 * balance and profit are shown as SEPARATE figures, never mixed.
 */
@Composable
fun DashboardScreen(
    state: DashboardState,
    language: AppLanguage,
    profileName: String,
    onOpen: (String) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            Text(
                profileName,
                style = androidx.compose.material3.MaterialTheme.typography.titleLarge
            )
            Text(
                "CSC Center",
                style = androidx.compose.material3.MaterialTheme.typography.bodyMedium
            )
            SectionTitle(Strings.get("dashboard", language))
        }
        item {
            Row(Modifier.fillMaxWidth()) {
                InfoCard(
                    Strings.get("today_income", language),
                    formatRupees(state.todayIncomePaise),
                    modifier = Modifier.weight(1f)
                )
                InfoCard(
                    Strings.get("today_expenses", language),
                    formatRupees(state.todayExpensesPaise),
                    modifier = Modifier.weight(1f)
                )
            }
        }
        item {
            Row(Modifier.fillMaxWidth()) {
                InfoCard(
                    Strings.get("net_profit", language),
                    formatRupees(state.netProfitPaise),
                    subtitle = "Money Transfer profit: ${formatRupees(state.moneyTransferProfitPaise)} (commission only)",
                    modifier = Modifier.weight(1f)
                )
                InfoCard(
                    "Money Transfer (today)",
                    formatRupees(state.todayMoneyTransferPrincipalPaise),
                    subtitle = "Principal — tracked, never counted as profit",
                    modifier = Modifier.weight(1f)
                )
            }
        }
        item {
            Row(Modifier.fillMaxWidth()) {
                InfoCard(
                    Strings.get("cash_balance", language),
                    formatRupees(state.cashBalancePaise),
                    modifier = Modifier.weight(1f)
                )
                InfoCard(
                    Strings.get("upi_balance", language),
                    formatRupees(state.upiBalancePaise),
                    modifier = Modifier.weight(1f)
                )
            }
        }
        item {
            Row(Modifier.fillMaxWidth()) {
                InfoCard(
                    Strings.get("customer_due", language),
                    formatRupees(state.customerDuePaise),
                    subtitle = "Due is not cash — it is money still to come",
                    modifier = Modifier.weight(1f)
                )
                InfoCard(
                    Strings.get("agent_payable", language),
                    formatRupees(state.agentPayablePaise),
                    modifier = Modifier.weight(1f)
                )
            }
        }
        item { SectionTitle("Modules") }
        item {
            // One button per module — each opens its own page.
            val modules = listOf(
                Strings.get("cash_book", language) to Routes.CASH_BOOK,
                Strings.get("upi_book", language) to Routes.UPI_BOOK,
                Strings.get("money_transfer", language) to Routes.MONEY_TRANSFER,
                "PAN Card" to Routes.service("PAN"),
                "Aadhaar" to Routes.service("AADHAAR"),
                "Voter ID" to Routes.service("VOTER_ID"),
                "Ayushman" to Routes.service("AYUSHMAN"),
                "Xerox" to Routes.service("XEROX"),
                "Printing" to Routes.service("PRINTING"),
                "Smart Card" to Routes.service("SMART_CARD"),
                Strings.get("customer_khata", language) to Routes.KHATA,
                Strings.get("agents", language) to Routes.AGENTS,
                Strings.get("expenses", language) to Routes.EXPENSES,
                Strings.get("receipts", language) to Routes.RECEIPTS,
                Strings.get("daily_business", language) to Routes.DAILY_BUSINESS,
                Strings.get("reports", language) to Routes.REPORTS,
                Strings.get("difference_finder", language) to Routes.DIFFERENCE_FINDER,
                Strings.get("settings", language) to Routes.SETTINGS
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                modules.forEach { (label, route) ->
                    Button(onClick = { onOpen(route) }, modifier = Modifier.fillMaxWidth()) {
                        Text(label)
                    }
                }
            }
        }
        item { SectionTitle("Recent Transactions") }
        if (state.recentTransactions.isEmpty()) {
            item { EmptyState("No transactions yet. Add your first entry from Cash Book or a service page.") }
        } else {
            items(state.recentTransactions) { tx ->
                InfoCard(
                    tx.category,
                    formatRupees(tx.amountPaise),
                    subtitle = "${tx.kind} • ${tx.mode} • ${tx.description}"
                )
            }
        }
        item {
            Text(
                "App: ${Branding.APP_NAME} • Profile: $profileName",
                modifier = Modifier.padding(vertical = 16.dp)
            )
        }
    }
}
