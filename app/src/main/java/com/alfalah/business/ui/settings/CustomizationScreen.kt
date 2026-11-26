package com.alfalah.business.ui.settings

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.theme.BizColors
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
    val customServices by settings.customServices.collectAsState(initial = emptySet())
    val scope = rememberCoroutineScope()
    var showAddService by remember { mutableStateOf(false) }
    var renameService by remember { mutableStateOf<String?>(null) }
    var deleteService by remember { mutableStateOf<String?>(null) }
    val modules: List<Triple<String, String, String>> = listOf(
        Triple("money_transfer", "Money Transfer", "Separate MT ledger with daily closing"),
        Triple("pan", "PAN Card", "PAN applications — done by you, never by an agent"),
        Triple("aadhaar", "Aadhaar Services", "Name correction, mobile update, biometric"),
        Triple("voter_id", "Voter ID", "Voter ID applications"),
        Triple("ayushman", "Ayushman Card", "Ayushman card applications"),
        Triple("xerox", "Xerox", "Xerox jobs"),
        Triple("printing", "Printing", "Printing jobs"),
        Triple("smart_card", "Smart Card", "Smart card jobs"),
        Triple("passport_photo", "Passport Size Photo", "Passport photo jobs"),
        Triple("scanning", "Scanning", "Scanning jobs"),
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
            Spacer(Modifier.height(8.dp))
            Text("Your Own Services", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Services you add here appear as categories in the Daily Business Quick Entry form and in the Daily Business service summary. Renaming one only affects new entries — past entries keep the name they were saved with.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (customServices.isEmpty()) {
            item {
                Text(
                    "No custom services yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(customServices.sorted()) { name ->
                BizCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        TextButton(onClick = { renameService = name }) { Text("Rename") }
                        TextButton(onClick = { deleteService = name }) {
                            Text("Delete", color = BizColors.ExpenseRed)
                        }
                    }
                }
            }
        }
        item {
            PrimaryButton("+ Add Your Own Service") { showAddService = true }
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

    if (showAddService) {
        CustomServiceDialog(
            title = "Add Your Own Service",
            initialName = "",
            onDismiss = { showAddService = false }
        ) { name ->
            scope.launch {
                settings.addCustomService(name)
                showAddService = false
            }
        }
    }
    renameService?.let { oldName ->
        CustomServiceDialog(
            title = "Rename Service",
            initialName = oldName,
            onDismiss = { renameService = null }
        ) { newName ->
            scope.launch {
                settings.renameCustomService(oldName, newName)
                renameService = null
            }
        }
    }
    deleteService?.let { name ->
        AlertDialog(
            onDismissRequest = { deleteService = null },
            title = { Text("Delete this service?") },
            text = { Text("“$name” will no longer appear in the Quick Entry form. Past entries keep their category and their money — nothing is deleted from the books.") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        settings.removeCustomService(name)
                        deleteService = null
                    }
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { deleteService = null }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun CustomServiceDialog(
    title: String,
    initialName: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var name by remember { mutableStateOf(initialName) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    name, { name = it },
                    label = { Text("Service name") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true
                )
                Text(
                    "A name cannot contain a comma. Built-in services (Xerox, Printing, …) cannot be renamed here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                error?.let { Text(it, color = BizColors.ExpenseRed) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                when {
                    name.isBlank() -> error = "Enter a service name."
                    ',' in name -> error = "A service name cannot contain a comma."
                    else -> onSave(name.trim())
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
