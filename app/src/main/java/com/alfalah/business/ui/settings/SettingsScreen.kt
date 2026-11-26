package com.alfalah.business.ui.settings

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
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.InfoCard
import com.alfalah.business.ui.components.SectionTitle
import kotlinx.coroutines.launch

/**
 * Settings: language, theme, business profiles, Recycle Bin (restore
 * deleted jobs), backup/export, AI (Gemini, free tier, off until the owner
 * adds his key in Settings — the app works fully without it), and the
 * list of decisions taken with safe defaults, so the owner can change any.
 */
@Composable
fun SettingsScreen(
    profileId: Long,
    repository: BusinessRepository,
    language: AppLanguage,
    themeMode: SettingsStore.ThemeMode,
    profiles: List<BusinessProfileEntity>,
    activeProfileId: Long?,
    onLanguage: (AppLanguage) -> Unit,
    onThemeMode: (SettingsStore.ThemeMode) -> Unit,
    onProfile: (Long) -> Unit
) {
    val deletedJobs by repository.observeDeletedJobs(profileId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        item {
            SectionTitle("Settings")
            InfoCard("App", Branding.APP_NAME)
            InfoCard("Business Profile", "Al Falah Communication — CSC Center")
            Text("App version: 0.1.0 (CSC core, Phase A–F scaffold)")
        }
        item { SectionTitle("Language / Bhasha") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                AppLanguage.values().forEach { lang ->
                    Button(
                        onClick = { onLanguage(lang) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (language == lang) "✓ ${lang.label}" else lang.label) }
                }
            }
        }
        item { SectionTitle("Theme") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf(
                    SettingsStore.ThemeMode.SYSTEM to "System",
                    SettingsStore.ThemeMode.LIGHT to "Light",
                    SettingsStore.ThemeMode.DARK to "Dark"
                ).forEach { (mode, label) ->
                    Button(
                        onClick = { onThemeMode(mode) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (themeMode == mode) "✓ $label" else label) }
                }
            }
        }
        item { SectionTitle("Business Profiles (up to 3)") }
        item {
            Text("One profile per category — profiles never mix their records.")
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                profiles.forEach { p ->
                    Button(
                        onClick = { onProfile(p.id) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (p.id == activeProfileId) "✓ ${p.name}" else p.name) }
                }
            }
        }
        item { SectionTitle("Recycle Bin") }
        item { Text("Deleted jobs stay here for 30 days. Restoring puts them back with all their payments and history.") }
        if (deletedJobs.isEmpty()) {
            item { EmptyState("Recycle Bin is empty.") }
        } else {
            items(deletedJobs) { job ->
                InfoCard("Deleted job #${job.id}", job.workDetails, subtitle = job.service.label)
                Button(
                    onClick = { scope.launch { repository.restoreJob(job.id) } },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Restore") }
            }
        }
        item { SectionTitle("AI — Gemini (free tier)") }
        item {
            Text(
                "AI features (chatbot, sales insights, demand prediction) use the " +
                    "Gemini API free tier only. No API key is set, so AI is OFF right " +
                    "now — the app works fully without it. The owner adds his own key " +
                    "later through secure setup; no key is stored in the app."
            )
        }
        item { SectionTitle("Backup & Export") }
        item {
            Text("Backup: local database backup + PDF / Excel / CSV export of reports and receipts. Export is in Reports (CSV share) and Receipts. Full local DB backup is in the web app.")
        }
        item { SectionTitle("Decisions taken (safe defaults — change any)") }
        item {
            Text(
                "• One business profile per category (separate, no mixing)\n" +
                    "• Local-first data (Room), sync when online, free tiers only\n" +
                    "• Backup/export: PDF + Excel/CSV + local DB backup\n" +
                    "• WhatsApp reminders: manual via share link (no paid service)\n" +
                    "• No inventory/stock in CSC v1\n" +
                    "• Branding: clean professional Material 3; logo placeholder\n" +
                    "• Website built together with the app\n" +
                    "• Language default English; Hindi/Hinglish selectable\n" +
                    "• Theme Light / Dark / System\n" +
                    "• GitHub: blocked for now — the account linked to the owner's " +
                    "Google identity is suspended by GitHub, so no repo was created. " +
                    "Code stays in the local workspace until a repo URL is provided."
            )
        }
    }
}
