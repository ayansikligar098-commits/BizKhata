package com.alfalah.business.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.theme.BizColors
import kotlinx.coroutines.launch

/**
 * Recycle Bin — soft-deleted jobs stay here and can be restored with all
 * their payments and history. Financial data is never erased silently.
 */
@Composable
fun RecycleBinScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage
) {
    val deletedJobs by repository.observeDeletedJobs(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Text("Recycle Bin", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Deleted jobs stay here. Restoring puts them back with all their payments and history.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (deletedJobs.isEmpty()) {
            item { EmptyState("Recycle Bin is empty.") }
        } else {
            items(deletedJobs) { job ->
                BizCard(Modifier.fillMaxWidth()) {
                    Text("Deleted job #${job.id} — ${job.workDetails}", fontWeight = FontWeight.SemiBold)
                    Text(
                        "${job.service.label} • Status was: ${job.status}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { scope.launch { repository.restoreJob(job.id) } },
                        modifier = Modifier.fillMaxWidth(),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
                    ) { Text("Restore") }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}
