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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.theme.BizColors

/**
 * Settings — list rows like the reference design: Business Profiles,
 * Language, Theme (Light / Dark / System), Receipt Settings, Service
 * Settings, Categories, Data & Backup, Security & Privacy, About.
 * Language and theme apply immediately; profile switching is here.
 */
@Composable
fun SettingsScreen(
    profileId: Long,
    language: AppLanguage,
    themeMode: SettingsStore.ThemeMode,
    profiles: List<BusinessProfileEntity>,
    activeProfileId: Long?,
    onLanguage: (AppLanguage) -> Unit,
    onThemeMode: (SettingsStore.ThemeMode) -> Unit,
    onProfile: (Long) -> Unit,
    onOpen: (String) -> Unit,
    onRemovePin: () -> Unit
) {
    var showLanguage by remember { mutableStateOf(false) }
    var showTheme by remember { mutableStateOf(false) }
    var showProfiles by remember { mutableStateOf(false) }
    var showAbout by remember { mutableStateOf(false) }
    var showReceiptSettings by remember { mutableStateOf(false) }
    var showSecurity by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(4.dp))
            BizCard(Modifier.fillMaxWidth()) {
                Text(Branding.APP_NAME, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "Al Falah Communication — CSC Center",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text("Version 1.0.0 • Free • Local-first", style = MaterialTheme.typography.bodySmall, color = BizColors.Purple)
            }
        }
        item {
            SettingsRow("Business Profiles", "${profiles.size} profile(s) — tap to switch") { showProfiles = true }
            SettingsRow("Language", "Current: ${language.name}") { showLanguage = true }
            SettingsRow("Theme", "Current: ${themeMode.name}") { showTheme = true }
            SettingsRow("Receipt Settings", "A4 / thermal, signature, numbering") { showReceiptSettings = true }
            SettingsRow("Service Settings", "Services, agents and job statuses") { onOpen(Routes.SERVICES) }
            SettingsRow("Categories", "Business category and ready-made setup") { onOpen(Routes.CATEGORY_PICK) }
            SettingsRow("Customization Studio", "Enable / disable modules") { onOpen(Routes.CUSTOMIZATION) }
            SettingsRow("Audit Log", "Old → new values for every change") { onOpen(Routes.AUDIT_LOG) }
            SettingsRow("Recycle Bin", "Deleted jobs — restore them here") { onOpen(Routes.RECYCLE_BIN) }
            SettingsRow("Data & Backup", "CSV export, local backup") { onOpen(Routes.REPORTS) }
            SettingsRow("Security & Privacy", "PIN lock, owner-only data") { showSecurity = true }
            SettingsRow("About BizKhata", "App info and decisions") { showAbout = true }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showLanguage) {
        AlertDialog(
            onDismissRequest = { showLanguage = false },
            title = { Text("Language / Bhasha") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    AppLanguage.values().forEach { lang ->
                        Button(
                            onClick = { onLanguage(lang); showLanguage = false },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text(if (language == lang) "✓ ${lang.name}" else lang.name) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showLanguage = false }) { Text("Cancel") } }
        )
    }

    if (showTheme) {
        AlertDialog(
            onDismissRequest = { showTheme = false },
            title = { Text("Theme") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(
                        SettingsStore.ThemeMode.SYSTEM to "System (follows the phone)",
                        SettingsStore.ThemeMode.LIGHT to "Light",
                        SettingsStore.ThemeMode.DARK to "Dark"
                    ).forEach { (mode, label) ->
                        Button(
                            onClick = { onThemeMode(mode); showTheme = false },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text(if (themeMode == mode) "✓ $label" else label) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showTheme = false }) { Text("Cancel") } }
        )
    }

    if (showProfiles) {
        AlertDialog(
            onDismissRequest = { showProfiles = false },
            title = { Text("Business Profiles (up to 3)") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("One profile per category — profiles never mix their records.")
                    profiles.forEach { p ->
                        Button(
                            onClick = { onProfile(p.id); showProfiles = false },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text(if (p.id == activeProfileId) "✓ ${p.name.ifBlank { Branding.OWNER_BUSINESS_NAME }}" else p.name.ifBlank { Branding.OWNER_BUSINESS_NAME }) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showProfiles = false }) { Text("Cancel") } }
        )
    }

    if (showReceiptSettings) {
        AlertDialog(
            onDismissRequest = { showReceiptSettings = false },
            title = { Text("Receipt Settings") },
            text = {
                Text(
                    "Receipt numbers look like BIZ-2026-11-26-0001 and increase per profile. " +
                        "Receipts print in A4 or thermal layout with a signature section, and Paid / Due are always shown separately. " +
                        "Choose A4 or thermal on the receipt preview."
                )
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showReceiptSettings = false }) { Text("OK") } }
        )
    }

    if (showSecurity) {
        AlertDialog(
            onDismissRequest = { showSecurity = false },
            title = { Text("Security & Privacy") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("• Owner-only: the app runs local-first on this phone; no account password is ever stored in the app.")
                    Text("• Your 4-digit PIN is stored only as a hash. Remove it below to turn the lock screen off.")
                    Text("• Aadhaar and other sensitive documents: store as little as possible, mask numbers.")
                    Button(onClick = { onRemovePin(); showSecurity = false }, modifier = Modifier.fillMaxWidth()) {
                        Text("Remove PIN Lock")
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showSecurity = false }) { Text("Close") } }
        )
    }

    if (showAbout) {
        AlertDialog(
            onDismissRequest = { showAbout = false },
            title = { Text("About BizKhata") },
            text = {
                Text(
                    "BizKhata 1.0.0 — Business Accounting & Management for CSC Centers and small businesses. " +
                        "Native Android (Kotlin + Jetpack Compose), local-first Room database, free forever. " +
                        "Decisions (changeable): one profile per category; local-first with sync when online; " +
                        "backup/export PDF + Excel/CSV; WhatsApp reminders manual via share link; no inventory in CSC v1; " +
                        "Gemini AI free tier only, off until the owner adds a key."
                )
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showAbout = false }) { Text("OK") } }
        )
    }
}

@Composable
private fun SettingsRow(title: String, subtitle: String, onClick: () -> Unit) {
    BizCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null)
        }
    }
}
