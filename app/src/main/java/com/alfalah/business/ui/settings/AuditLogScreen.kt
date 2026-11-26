package com.alfalah.business.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Audit Log — who changed what, old value → new value, when (§16).
 * Read-only: the log is the trail, it is never edited from here.
 * Entries are written by the repository on every payment, status change,
 * agent assignment and delete/restore.
 */
@Composable
fun AuditLogScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val entries by repository.observeAudit(profileId).collectAsState(initial = emptyList())
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Text("Audit Log", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Every change, with its old and new values. Nothing here is ever edited or deleted — this is the trail.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (entries.isEmpty()) {
            item { EmptyState("No changes recorded yet. Payments, status changes and deletes will appear here.") }
        } else {
            items(entries) { e ->
                BizCard(Modifier.fillMaxWidth()) {
                    Text(
                        "${e.action} • ${e.entityType} #${e.entityId}",
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        Instant.ofEpochMilli(e.atEpochMs).atZone(ZoneOffset.UTC)
                            .format(DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm", Locale.ENGLISH)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (e.oldValue.isNotBlank() || e.newValue.isNotBlank()) {
                        Text(
                            "${e.oldValue.ifBlank { "—" }}  →  ${e.newValue.ifBlank { "—" }}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}
