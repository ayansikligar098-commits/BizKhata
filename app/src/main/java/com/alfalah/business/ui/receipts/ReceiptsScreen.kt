package com.alfalah.business.ui.receipts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.entity.ReceiptEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatRupees
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Receipts — professional receipt from the business profile.
 * Unique receipt number, date, customer, service, total, paid, remaining,
 * payment method. Paid and Due are shown separately and clearly.
 * PDF / print / WhatsApp share are in the web app (same data model);
 * the Android scaffold shares the receipt as text (WhatsApp share intent)
 * — see README for the remaining PDF work.
 */
@Composable
fun ReceiptsScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val receipts by repository.observeReceipts(profileId).collectAsState(initial = emptyList())
    val jobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Receipts")
            Text("Make a receipt for any job that has received a payment.")
        }
        item { SectionTitle("Jobs ready for a receipt") }
        val ready = jobs.filter { it.amountReceivedPaise > 0 }
        if (ready.isEmpty()) {
            item { EmptyState("No jobs with a payment yet. Record a payment first, then make its receipt here.") }
        } else {
            items(ready) { job ->
                val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                InfoCard(
                    "Job #${job.id} — ${job.workDetails}",
                    "Total ${formatRupees(job.totalFeesPaise)} • Paid ${formatRupees(job.amountReceivedPaise)} • Due ${formatRupees(due)}",
                    subtitle = "${job.service.label} • Status: ${job.status}"
                )
                Button(
                    onClick = {
                        scope.launch {
                            val count = receipts.size + 1
                            val number = "BIZ-${LocalDate.now(ZoneOffset.UTC)}-${count.toString().padStart(4, '0')}"
                            repository.addReceipt(
                                ReceiptEntity(
                                    profileId = profileId,
                                    receiptNumber = number,
                                    jobId = job.id,
                                    customerName = "Customer #${job.customerId}",
                                    customerMobile = "",
                                    service = job.service,
                                    totalFeesPaise = job.totalFeesPaise,
                                    amountPaidPaise = job.amountReceivedPaise,
                                    mode = PaymentMode.CASH,
                                    dateEpochDay = today
                                )
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Make Receipt") }
            }
        }
        item { SectionTitle("Receipt History") }
        if (receipts.isEmpty()) {
            item { EmptyState("No receipts yet.") }
        } else {
            items(receipts) { r ->
                val due = r.totalFeesPaise - r.amountPaidPaise
                InfoCard(
                    "Receipt ${r.receiptNumber}",
                    "Paid ${formatRupees(r.amountPaidPaise)} • Due ${formatRupees(due)}",
                    subtitle = "${r.service.label} • ${r.customerName} • Total ${formatRupees(r.totalFeesPaise)}"
                )
                Button(
                    onClick = {
                        scope.launch {
                            val count = receipts.size + 1
                            val number = "BIZ-${LocalDate.now(ZoneOffset.UTC)}-${count.toString().padStart(4, '0')}"
                            repository.addReceipt(r.copy(id = 0, receiptNumber = number))
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Duplicate Receipt") }
            }
        }
    }
}
