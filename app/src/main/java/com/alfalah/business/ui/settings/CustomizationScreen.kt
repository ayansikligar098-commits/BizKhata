package com.alfalah.business.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BizCard
import kotlinx.coroutines.launch

/**
 * Customization Studio (v2 spec) — enable / disable modules for this
 * business profile. Disabled modules disappear from the drawer and the
 * Dashboard; their data stays in the database and comes back when the
 * module is enabled again. A grocery shop never sees CSC modules unless
 * the owner enables them.
 */
@Composable
fun CustomizationScreen(
    settings: SettingsStore,
    language: AppLanguage
) {
    val disabled by settings.disabledModules.collectAsState(initial = emptySet())
    val scope = rememberCoroutineScope()
    val modules: List<Triple<String, String, String>> = listOf(
        Triple("money_transfer", "Money Transfer", "Separate MT ledger with daily closing"),
        Triple("pan", "PAN Card", "PAN applications — done by you, never by an agent"),
        Triple("aadhaar", "Aadhaar Services", "Name correction, mobile update, biometric"),
        Triple("voter_id", "Voter ID", "Voter ID applications"),
        Triple("ayushman", "Ayushman Card", "Ayushman card applications"),
        Triple("xerox", "Xerox", "Xerox jobs"),
        Triple("printing", "Printing", "Printing jobs"),
        Triple("smart_card", "Smart Card", "Smart card jobs"),
        Triple("document_work", "Document Work", "Other document work"),
        Triple("agents", "Agents", "Agent management and agent ledger"),
        Triple("expenses", "Expenses", "Expenses and machine maintenance"),
        Triple("receipts", "Receipts", "Receipt generator (A4 / thermal)"),
        Triple("difference_finder", "Difference Finder", "Cash / UPI / MT reconciliation")
    )
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            Text("Customization Studio", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Turn modules on or off for this business. Turning a module off hides it — it never deletes its data.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        items(modules) { (key, label, subtitle) ->
            val enabled = key !in disabled
            BizCard(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                        Text(label, fontWeight = FontWeight.SemiBold)
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = enabled,
                        onCheckedChange = { on ->
                            scope.launch { settings.setModuleEnabled(key, on) }
                        }
                    )
                }
            }
        }
        item {
            Text(
                "Service list, income/expense categories and custom fields (the full Custom Module & Category Builder) are remaining work — see README.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp)
            )
        }
    }
}
