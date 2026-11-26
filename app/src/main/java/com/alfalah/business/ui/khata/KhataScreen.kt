package com.alfalah.business.ui.khata

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.AvatarCircle
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.SearchField
import com.alfalah.business.ui.components.StatCard
import com.alfalah.business.ui.components.formatRupees
import com.alfalah.business.ui.theme.BizColors

/**
 * Customer Khata — reference screen 8 (list). Every customer with a job,
 * with their total bill / paid / due. Tap a customer for the detail page
 * (Ledger / Jobs / Documents tabs). Due is money still to come; it is
 * NEVER shown as cash received.
 */
@Composable
fun KhataScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    onOpenCustomer: (Long) -> Unit
) {
    val jobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    val customers by repository.searchCustomers(profileId, "").collectAsState(initial = emptyList())
    var query by remember { mutableStateOf("") }

    val totalBill = jobs.sumOf { it.totalFeesPaise }
    val totalPaid = jobs.sumOf { it.amountReceivedPaise }
    val totalDue = jobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }

    val rows = customers.filter { customer ->
        query.isBlank() ||
            customer.name.contains(query, ignoreCase = true) ||
            customer.mobile.contains(query)
    }.map { customer ->
        val cJobs = jobs.filter { it.customerId == customer.id }
        Triple(
            customer,
            cJobs.sumOf { it.totalFeesPaise },
            cJobs.sumOf { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) }
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Total Bill", formatRupees(totalBill), modifier = Modifier.weight(1f))
                StatCard("Paid", formatRupees(totalPaid), valueColor = BizColors.IncomeGreen, modifier = Modifier.weight(1f))
                StatCard("Due", formatRupees(totalDue), valueColor = BizColors.ExpenseRed, modifier = Modifier.weight(1f))
            }
        }
        item {
            SearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search customer by name or mobile..."
            )
        }
        if (rows.isEmpty()) {
            item {
                EmptyState(
                    if (customers.isEmpty()) "No customers yet. Add a job from a service page and the customer appears here."
                    else "No customer matches this search."
                )
            }
        } else {
            items(rows) { (customer, bill, due) ->
                BizCard(Modifier.fillMaxWidth(), onClick = { onOpenCustomer(customer.id) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AvatarCircle(customer.name)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text(customer.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                customer.mobile.ifBlank { "No mobile" } + " • ${customer.service.label}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Due", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(
                                formatRupees(due),
                                fontWeight = FontWeight.Bold,
                                color = if (due > 0) BizColors.ExpenseRed else BizColors.IncomeGreen
                            )
                            Text(
                                "Bill ${formatRupees(bill)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}
