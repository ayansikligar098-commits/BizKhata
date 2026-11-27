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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.domain.AiLanguage
import com.alfalah.business.domain.AiVoiceConfig
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.chatbot.VoiceTestPlayer
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
    onRemovePin: () -> Unit,
    aiKey: String = "",
    onSaveAiKey: (String) -> Unit = {},
    onClearAiKey: () -> Unit = {},
    aiLanguagePref: String = "AUTO",
    onAiLanguagePref: (String) -> Unit = {},
    // UPDATE 25 — voice: spoken replies on/off, the AI voice pick,
    // and continuous conversation mode. Spoken replies use the real
    // AI voice (never the phone's voice); the voice is rationed to 10
    // spoken replies per day (visible counter), and the picker lets
    // the owner hear each voice and choose. No audio is ever stored.
    voiceResponsesEnabled: Boolean = true,
    onVoiceResponsesEnabled: (Boolean) -> Unit = {},
    voiceName: String = AiVoiceConfig.DEFAULT_VOICE,
    onVoiceName: (String) -> Unit = {},
    voiceUsedToday: Int = 0,
    voiceTestAudio: ByteArray? = null,
    voiceTestError: String? = null,
    onVoiceTest: (String) -> Unit = {},
    onClearVoiceTest: () -> Unit = {},
    voiceContinuousMode: Boolean = false,
    onVoiceContinuousMode: (Boolean) -> Unit = {}
) {
    var showLanguage by remember { mutableStateOf(false) }
    var showTheme by remember { mutableStateOf(false) }
    var showProfiles by remember { mutableStateOf(false) }
    var showAbout by remember { mutableStateOf(false) }
    var showReceiptSettings by remember { mutableStateOf(false) }
    var showSecurity by remember { mutableStateOf(false) }
    var showAiKey by remember { mutableStateOf(false) }
    var showAiLanguage by remember { mutableStateOf(false) }
    var showVoice by remember { mutableStateOf(false) }
    var aiKeyInput by remember { mutableStateOf("") }

    // UPDATE 25: the "Suno" hear-test player — plays the test audio
    // the ViewModel fetched for the picked voice. Released when
    // Settings goes away; the test audio is cleared after it plays.
    val voiceTestPlayer = remember { VoiceTestPlayer(context = LocalContext.current) }
    LaunchedEffect(voiceTestAudio) {
        if (voiceTestAudio != null) {
            voiceTestPlayer.play(voiceTestAudio)
            onClearVoiceTest()
        }
    }
    DisposableEffect(Unit) { onDispose { voiceTestPlayer.release() } }

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
            // BizKhata AI Assistant — branding only, no provider name,
            // no key, no provider details (owner order 2026-11-26 22:16 IST).
            // BizKhata AI Assistant — branding only, no provider name.
            // The key entry is labelled neutrally ("AI key"); the key
            // value is never shown (UPDATE 12).
            SettingsRow(
                "BizKhata AI Assistant",
                if (aiKey.isNotBlank()) "AI summary ON — key saved (tap to change / remove)"
                else "AI summary OFF — tap to add your AI key"
            ) { aiKeyInput = ""; showAiKey = true }
            // UPDATE 13: manual AI language. "Auto" (default) detects the
            // language of every message — the user is never forced to
            // pick one before chatting. A manual choice fixes the reply
            // language and the voice recogniser language instead.
            val aiLangLabel = if (aiLanguagePref == "AUTO") "Auto — detects your language"
                else AiLanguage.fromCode(aiLanguagePref).displayName
            SettingsRow("AI Assistant Language", "Current: $aiLangLabel") { showAiLanguage = true }
            // UPDATE 25 — voice settings: spoken replies (real AI
            // voice), voice pick with hear-test, daily counter,
            // continuous mode. Mic permission is asked in the chat
            // screen when the mic is tapped, never here.
            val voiceLabel = (if (voiceResponsesEnabled) "Spoken replies ON" else "Spoken replies OFF (mute)") +
                ", " + AiVoiceConfig.quotaLabel(voiceUsedToday) +
                ", voice: $voiceName" + if (voiceContinuousMode) ", continuous ON" else ""
            SettingsRow("Voice Assistant", voiceLabel) { showVoice = true }
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

    if (showAiLanguage) {
        AlertDialog(
            onDismissRequest = { showAiLanguage = false },
            title = { Text("AI Assistant Language") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        "Auto detects the language of every message — Hindi, Gujarati, Tamil, Hinglish, " +
                            "Romanized typing, mixed sentences — and replies in the same language. " +
                            "Pick one language to fix it instead (also sets the voice input language)."
                    )
                    Button(
                        onClick = { onAiLanguagePref("AUTO"); showAiLanguage = false },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(if (aiLanguagePref == "AUTO") "✓ Auto (detect from message)" else "Auto (detect from message)") }
                    AiLanguage.values().filter { it != AiLanguage.UNKNOWN }.forEach { lang ->
                        Button(
                            onClick = { onAiLanguagePref(lang.code); showAiLanguage = false },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text(if (aiLanguagePref == lang.code) "✓ ${lang.displayName}" else lang.displayName) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showAiLanguage = false }) { Text("Cancel") } }
        )
    }

    if (showVoice) {
        AlertDialog(
            onDismissRequest = { showVoice = false },
            title = { Text("Voice Assistant") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Bol kar baat karein — apne hisab se boliye, koi fixed command yaad rakhne ki zaroorat nahi hai. " +
                            "Mic sirf tab chalu hota hai jab chat mein 'Sun raha hoon' dikh raha ho; koi audio save nahi hoti. " +
                            "Voice se entry tab bhi sirf preview confirm karne par save hoti hai."
                    )
                    Text("Spoken replies (jawab bol kar sunana)", fontWeight = FontWeight.SemiBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onVoiceResponsesEnabled(true) },
                            modifier = Modifier.weight(1f)
                        ) { Text(if (voiceResponsesEnabled) "✓ ON" else "ON") }
                        Button(
                            onClick = { onVoiceResponsesEnabled(false) },
                            modifier = Modifier.weight(1f)
                        ) { Text(if (!voiceResponsesEnabled) "✓ OFF (mute)" else "OFF (mute)") }
                    }
                    // UPDATE 25: the spoken reply is a real AI voice —
                    // never the phone's voice. Pick a voice and hear it
                    // with "Suno" before choosing. A hear-test uses 1
                    // of today's 10 spoken replies, same as a reply.
                    Text("AI awaz (voice)", fontWeight = FontWeight.SemiBold)
                    Text(
                        AiVoiceConfig.quotaLabel(voiceUsedToday) +
                            " — roz 10 spoken replies milte hain; limit khatm ho jaye to jawab sirf text mein dikhega. " +
                            "Counter har roz midnight Pacific par reset hota hai.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    AiVoiceConfig.VOICES.forEach { name ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Button(
                                onClick = { onVoiceName(name) },
                                modifier = Modifier.weight(1f)
                            ) { Text(if (voiceName == name) "✓ $name" else name) }
                            Button(
                                onClick = { onVoiceTest(name) },
                                modifier = Modifier.weight(1f)
                            ) { Text("Suno") }
                        }
                    }
                    if (voiceTestError != null) {
                        Text(
                            voiceTestError,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    Text("Continuous conversation", fontWeight = FontWeight.SemiBold)
                    Text(
                        "ON rahe to mic har jawab ke baad khud chalu ho jayega — dobara mic dabane ki zaroorat nahi. " +
                            "Chat mein Stop dabakar kabhi bhi band kar sakte hain.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { onVoiceContinuousMode(true) },
                            modifier = Modifier.weight(1f)
                        ) { Text(if (voiceContinuousMode) "✓ ON" else "ON") }
                        Button(
                            onClick = { onVoiceContinuousMode(false) },
                            modifier = Modifier.weight(1f)
                        ) { Text(if (!voiceContinuousMode) "✓ OFF" else "OFF") }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showVoice = false }) { Text("Done") } }
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

    if (showAiKey) {
        AlertDialog(
            onDismissRequest = { showAiKey = false },
            title = { Text("BizKhata AI Assistant — AI Key") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "AI summary chalu karne ke liye apni AI key yahan daalein. " +
                            "Key sirf is phone me save hoti hai — app me ya git me koi key nahi hoti. " +
                            "Key ke bina bhi assistant aapke real record se built-in jawab deta hai; " +
                            "key sirf AI summary ke liye hai. Key hataane par AI summary band ho jata hai."
                    )
                    OutlinedTextField(
                        value = aiKeyInput,
                        onValueChange = { aiKeyInput = it },
                        label = { Text("AI key") },
                        placeholder = { Text("Apni AI key yahan paste karein") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (aiKey.isNotBlank()) {
                        Button(
                            onClick = { onClearAiKey(); showAiKey = false },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Remove Key (AI summary band karein)") }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (aiKeyInput.isNotBlank()) onSaveAiKey(aiKeyInput)
                        showAiKey = false
                    }
                ) { Text("Save Key") }
            },
            dismissButton = { TextButton(onClick = { showAiKey = false }) { Text("Cancel") } }
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
                        "BizKhata AI Assistant answers from your real records."
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
