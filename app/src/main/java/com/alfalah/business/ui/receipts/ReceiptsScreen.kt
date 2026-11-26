package com.alfalah.business.ui.receipts

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.entity.ReceiptEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.SectionTitle
import com.alfalah.business.ui.components.formatDay
import com.alfalah.business.ui.components.formatRupees
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Receipt Generator — create a professional receipt for any job that has
 * received a payment. A4 / thermal preview toggle, signature section,
 * Paid and Due shown separately and clearly. Share via WhatsApp / any
 * app (text share). PDF export is in the web app on the same data model;
 * Android PDF export is remaining work (see README).
 */
@Composable
fun ReceiptsScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    businessName: String
) {
    val receipts by repository.observeReceipts(profileId).collectAsState(initial = emptyList())
    val jobs by repository.observeAllJobs(profileId).collectAsState(initial = emptyList())
    val customers by repository.searchCustomers(profileId, "").collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    var previewReceipt by remember { mutableStateOf<ReceiptEntity?>(null) }
    var thermal by remember { mutableStateOf(false) }

    val nameById = customers.associate { it.id to it }
    val ready = jobs.filter { it.amountReceivedPaise > 0 }

    fun receiptText(r: ReceiptEntity): String {
        val due = r.totalFeesPaise - r.amountPaidPaise
        return buildString {
            appendLine(businessName)
            appendLine("Receipt ${r.receiptNumber} • ${formatDay(r.dateEpochDay)}")
            appendLine("Customer: ${r.customerName} ${r.customerMobile}")
            appendLine("Service: ${r.service.label}")
            appendLine("Total: ${formatRupees(r.totalFeesPaise)}")
            appendLine("Paid: ${formatRupees(r.amountPaidPaise)} (${r.mode})")
            appendLine("Due: ${formatRupees(due)}")
            appendLine("")
            appendLine("Signature: ________________")
            appendLine("— ${Branding.APP_NAME}")
        }
    }

    fun shareReceipt(r: ReceiptEntity) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Receipt ${r.receiptNumber}")
            putExtra(Intent.EXTRA_TEXT, receiptText(r))
        }
        context.startActivity(Intent.createChooser(send, "Share receipt (WhatsApp / print)"))
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            SectionTitle("Receipt Generator")
            Text(
                "Make a receipt for any job that has received a payment. Paid and Due are always shown separately.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        item { SectionTitle("Jobs ready for a receipt") }
        if (ready.isEmpty()) {
            item { EmptyState("No jobs with a payment yet. Record a payment first, then make its receipt here.") }
        } else {
            items(ready) { job ->
                val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
                val customer = nameById[job.customerId]
                BizCard(Modifier.fillMaxWidth()) {
                    Text(
                        "${customer?.name ?: "Customer #${job.customerId}"} — ${job.workDetails}",
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "${job.service.label} • Total ${formatRupees(job.totalFeesPaise)} • Paid ${formatRupees(job.amountReceivedPaise)} • Due ${formatRupees(due)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = {
                            scope.launch {
                                val count = receipts.size + 1
                                val number = "BIZ-${LocalDate.now(ZoneOffset.UTC)}-${count.toString().padStart(4, '0')}"
                                val id = repository.addReceipt(
                                    ReceiptEntity(
                                        profileId = profileId,
                                        receiptNumber = number,
                                        jobId = job.id,
                                        customerName = customer?.name ?: "Customer #${job.customerId}",
                                        customerMobile = customer?.mobile ?: "",
                                        service = job.service,
                                        totalFeesPaise = job.totalFeesPaise,
                                        amountPaidPaise = job.amountReceivedPaise,
                                        mode = PaymentMode.CASH,
                                        dateEpochDay = today
                                    )
                                )
                                previewReceipt = receipts.firstOrNull { it.id == id }
                                    ?: ReceiptEntity(
                                        profileId = profileId, receiptNumber = number, jobId = job.id,
                                        customerName = customer?.name ?: "", customerMobile = customer?.mobile ?: "",
                                        service = job.service, totalFeesPaise = job.totalFeesPaise,
                                        amountPaidPaise = job.amountReceivedPaise, mode = PaymentMode.CASH,
                                        dateEpochDay = today
                                    )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = com.alfalah.business.ui.theme.BizColors.Purple
                        )
                    ) { Text("Make Receipt") }
                }
            }
        }
        item { SectionTitle("Receipt History") }
        if (receipts.isEmpty()) {
            item { EmptyState("No receipts yet.") }
        } else {
            items(receipts) { r ->
                val due = r.totalFeesPaise - r.amountPaidPaise
                BizCard(Modifier.fillMaxWidth()) {
                    Text("Receipt ${r.receiptNumber}", fontWeight = FontWeight.SemiBold)
                    Text(
                        "${r.service.label} • ${r.customerName} • ${formatDay(r.dateEpochDay)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Total ${formatRupees(r.totalFeesPaise)} • Paid ${formatRupees(r.amountPaidPaise)} • Due ${formatRupees(due)}",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { previewReceipt = r },
                            modifier = Modifier.weight(1f)
                        ) { Text("Preview") }
                        Button(
                            onClick = { shareReceipt(r) },
                            modifier = Modifier.weight(1f)
                        ) { Text("Share") }
                        Button(
                            onClick = {
                                scope.launch {
                                    val count = receipts.size + 1
                                    val number = "BIZ-${LocalDate.now(ZoneOffset.UTC)}-${count.toString().padStart(4, '0')}"
                                    repository.addReceipt(r.copy(id = 0, receiptNumber = number))
                                }
                            },
                            modifier = Modifier.weight(1f)
                        ) { Text("Duplicate") }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    previewReceipt?.let { r ->
        val due = r.totalFeesPaise - r.amountPaidPaise
        AlertDialog(
            onDismissRequest = { previewReceipt = null },
            title = { Text(if (thermal) "Receipt — Thermal" else "Receipt — A4") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { thermal = false }, modifier = Modifier.weight(1f)) {
                            Text(if (!thermal) "✓ A4" else "A4")
                        }
                        Button(onClick = { thermal = true }, modifier = Modifier.weight(1f)) {
                            Text(if (thermal) "✓ Thermal" else "Thermal")
                        }
                    }
                    Text(businessName, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text("Receipt ${r.receiptNumber} • ${formatDay(r.dateEpochDay)}")
                    Text("Customer: ${r.customerName} ${r.customerMobile}")
                    Text("Service: ${r.service.label}")
                    Text("Total: ${formatRupees(r.totalFeesPaise)}")
                    Text("Paid: ${formatRupees(r.amountPaidPaise)} (${r.mode})")
                    Text("Due: ${formatRupees(due)}", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    Text("Signature: ________________")
                    Text("— ${Branding.APP_NAME}", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    shareReceipt(r)
                    previewReceipt = null
                }) { Text("Share / Print") }
            },
            dismissButton = { TextButton(onClick = { previewReceipt = null }) { Text("Close") } }
        )
    }
}
