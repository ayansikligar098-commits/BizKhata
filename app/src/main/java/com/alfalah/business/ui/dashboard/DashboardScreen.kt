package com.alfalah.business.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.DonutChart
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.FilterPills
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.language.Strings
import com.alfalah.business.ui.theme.BizColors

/**
 * Dashboard — reference screen 1. Business card on top, Today/Week/Month/
 * Year pills, Income / Expenses / Profit cards, Cash / UPI / Due / Payable
 * cards, Service-wise Income donut, Recent Jobs. Every figure is calculated
 * from recorded entries by DashboardViewModel. Billing, received, due,
 * balance and profit are shown as SEPARATE figures, never mixed.
 * On a fresh install everything is ₹0 with a proper empty state — the
 * demo numbers from the old prototype are never shown.
 */
@Composable
fun DashboardScreen(
    state: DashboardState,
    period: DashboardPeriod,
    onPeriod: (DashboardPeriod) -> Unit,
    language: AppLanguage,
    profileName: String,
    profileType: String,
    onOpen: (String) -> Unit
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth > 600.dp
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                // Business card (reference: Al Falah Communication / CSC Center).
                BizCard(Modifier.fillMaxWidth(), onClick = { onOpen(Routes.SETTINGS) }) {
                    Text(profileName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(profileType, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "Tap to switch business profile",
                        style = MaterialTheme.typography.bodySmall,
                        color = BizColors.Purple
                    )
                }
            }
            item {
                FilterPills(
                    options = DashboardPeriod.values().map { it.label },
                    selected = period.label,
                    onSelect = { label ->
                        onPeriod(DashboardPeriod.values().first { it.label == label })
                    }
                )
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(
                        Strings.get("today_income", language),
                        formatRupees(state.todayIncomePaise),
                        valueColor = BizColors.IncomeGreen,
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        Strings.get("today_expenses", language),
                        formatRupees(state.todayExpensesPaise),
                        valueColor = BizColors.ExpenseRed,
                        modifier = Modifier.weight(1f)
                    )
                    if (wide) {
                        StatCard(
                            Strings.get("net_profit", language),
                            formatRupees(state.netProfitPaise),
                            valueColor = BizColors.Purple,
                            subtitle = "MT profit ${formatRupees(state.moneyTransferProfitPaise)} (commission only)",
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
            if (!wide) {
                item {
                    StatCard(
                        Strings.get("net_profit", language),
                        formatRupees(state.netProfitPaise),
                        valueColor = BizColors.Purple,
                        subtitle = "Money Transfer profit ${formatRupees(state.moneyTransferProfitPaise)} — commission only, never principal"
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(
                        Strings.get("cash_balance", language),
                        formatRupees(state.cashBalancePaise),
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        Strings.get("upi_balance", language),
                        formatRupees(state.upiBalancePaise),
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard(
                        Strings.get("customer_due", language),
                        formatRupees(state.customerDuePaise),
                        subtitle = "Due is not cash — money still to come",
                        modifier = Modifier.weight(1f)
                    )
                    StatCard(
                        Strings.get("agent_payable", language),
                        formatRupees(state.agentPayablePaise),
                        subtitle = "Separate ledger from customer due",
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            item {
                BizCard(Modifier.fillMaxWidth()) {
                    SectionTitle("Service-wise Income (${period.label})")
                    DonutChart(
                        segments = state.serviceIncomePaise.toList(),
                        totalPaise = state.todayIncomePaise
                    )
                }
            }
            item { SectionTitle("Recent Transactions") }
            if (state.recentTransactions.isEmpty()) {
                item {
                    EmptyState(
                        "No transactions yet. Add your first entry from Cash Book or a service page.",
                        actionLabel = "Open Cash Book",
                        onAction = { onOpen(Routes.CASH_BOOK) }
                    )
                }
            } else {
                items(state.recentTransactions) { tx ->
                    BizCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text(tx.category, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "${tx.kind} • ${tx.mode} • ${tx.description.ifBlank { "—" }}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                formatRupees(tx.amountPaise),
                                fontWeight = FontWeight.Bold,
                                color = if (tx.kind == "INCOME") BizColors.IncomeGreen else BizColors.ExpenseRed
                            )
                        }
                    }
                }
            }
            item {
                Text(
                    "App: ${Branding.APP_NAME} • Profile: $profileName",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 16.dp)
                )
            }
        }
    }
}
