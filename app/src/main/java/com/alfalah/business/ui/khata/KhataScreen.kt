package com.alfalah.business.ui.khata

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees

/**
 * Customer Khata — every customer with money still due, across all services.
 * Due is money still to come; it is NEVER shown as cash received.
 * Advance / partial / full payments are recorded per job on the service
 * page ("Payment Received") and appear here as the remaining due.
 */
@Composable
fun KhataScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val jobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    val customers by repository.searchCustomers(profileId, "").collectAsState(initial = emptyList())
    var query by remember { mutableStateOf("") }

    val nameById = customers.associate { it.id to it.name }
    val dueJobs = jobs.filter {
        AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) > 0
    }.filter { job ->
        query.isBlank() || (nameById[job.customerId] ?: "").contains(query, ignoreCase = true)
    }
    val totalDue = dueJobs.sumOf {
        AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Customer Khata")
            InfoCard("Total Due From Customers", formatRupees(totalDue))
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Search customer") },
                modifier = Modifier.fillMaxWidth()
            )
        }
        if (dueJobs.isEmpty()) {
            item { EmptyState("No pending customer payments. Everyone has paid in full.") }
        } else {
            items(dueJobs) { job ->
                val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                InfoCard(
                    nameById[job.customerId] ?: "Customer #${job.customerId}",
                    "Due ${formatRupees(due)}",
                    subtitle = "${job.service.label} — ${job.workDetails} • Total ${formatRupees(job.totalFeesPaise)} • Received ${formatRupees(job.amountReceivedPaise)} • Status: ${job.status}"
                )
            }
        }
    }
}
