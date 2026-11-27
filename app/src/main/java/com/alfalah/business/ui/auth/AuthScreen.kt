package com.alfalah.business.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alfalah.business.domain.AuthUtils
import com.alfalah.business.domain.Branding
import com.alfalah.business.ui.components.PrimaryButton
import com.alfalah.business.ui.theme.BizColors

/**
 * Auth — mobile + 4-digit PIN (v2 spec §A, single-owner local-first).
 * First run: enter a mobile number and choose a 4-digit PIN. Later runs:
 * enter the PIN to unlock. Only a SHA-256 hash of the PIN is stored
 * (SettingsStore) — never the PIN itself, never a password.
 * Google Sign-In is the server-auth step for multi-device sync and is
 * remaining work (see README); this local PIN is the v1 lock.
 *
 * UPDATE 24 — login/account mirror (2026-11-27):
 * - One account per mobile: when a PIN already exists, creation is
 *   refused (SettingsStore.setPin returns false) — never an overwrite.
 *   When a mobile is already registered on this device, creating a PIN
 *   requires that SAME number (normalised compare); a different number
 *   is refused instead of silently making a "second account".
 * - Mobile normalisation: the field keeps up to 12 digits so "+91 ..."
 *   and a leading 0 survive typing (the old take(10) truncated
 *   "+91 98123 45670" to the WRONG number "9198123456"); the number is
 *   normalised with AuthUtils before it is stored or compared, exactly
 *   like SettingsStore does.
 * - Forgot PIN: a real reset flow (registered mobile + new PIN) that
 *   logs the user in immediately. Before this there was no reset at
 *   all — only "clear app data", which erases everything.
 * - Honest wording: when business data already exists but no PIN is
 *   set, the screen says so instead of looking like a fresh install.
 */
@Composable
fun AuthScreen(
    hasPin: Boolean,
    savedMobile: String,
    hasExistingData: Boolean,
    onCreatePin: (mobile: String, pin: String, onError: (String) -> Unit) -> Unit,
    onUnlock: (pin: String, onWrong: () -> Unit) -> Unit,
    onResetPin: (mobile: String, pin: String, onError: (String) -> Unit) -> Unit,
    onUnlocked: () -> Unit
) {
    // Registered number, normalised: prefill with the number the account
    // was created with ("" on a fresh install). Keyed on savedMobile so
    // the field fills in once DataStore emits it after cold start.
    val savedNormalized = AuthUtils.normalizeMobile(savedMobile)
    var mobile by remember(savedMobile) { mutableStateOf(savedNormalized) }
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var wrongAttempts by remember { mutableStateOf(0) }
    var showReset by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(32.dp))
        Box(
            Modifier.size(84.dp).clip(CircleShape).background(BizColors.Purple),
            contentAlignment = Alignment.Center
        ) {
            Text("B", color = Color.White, fontSize = 40.sp, fontWeight = FontWeight.Bold)
        }
        Text(Branding.APP_NAME, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Business Management", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        if (!hasPin) {
            Text("Create your PIN", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (hasExistingData) {
                // Honest state, not a fresh install: data is already on
                // this device (e.g. the PIN was removed in Settings).
                // Creating a PIN never wipes it.
                Text(
                    "Is device par aapka business data pehle se hai — naya PIN banao, purana data safe rahega.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Text(
                    "Enter your mobile number and choose a 4-digit PIN. You will use this PIN to unlock the app.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (savedNormalized.isNotBlank()) {
                Text(
                    "Account number: ${AuthUtils.maskMobile(savedNormalized)} — wahi number use karo.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            OutlinedTextField(
                value = mobile,
                // Up to 12 digits: 10-digit number + optional "91" / "0"
                // prefix. Never take(10) here — it truncates "+91 ..."
                // into a wrong number. Normalised on submit.
                onValueChange = { mobile = it.filter { c -> c.isDigit() }.take(12) },
                label = { Text("Mobile Number") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = pin,
                onValueChange = { pin = it.filter { c -> c.isDigit() }.take(4) },
                label = { Text("Choose 4-digit PIN") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = confirmPin,
                onValueChange = { confirmPin = it.filter { c -> c.isDigit() }.take(4) },
                label = { Text("Confirm PIN") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            error?.let { Text(it, color = BizColors.ExpenseRed) }
            PrimaryButton("Set PIN & Continue") {
                val normalized = AuthUtils.normalizeMobile(mobile)
                when {
                    normalized.length != 10 -> error = "Enter a valid 10-digit mobile number."
                    // A number is already registered on this device: the
                    // same number must be reused — a different number
                    // must never silently create a second account.
                    savedNormalized.length == 10 && normalized != savedNormalized ->
                        error = "Is number par account pehle se hai (${AuthUtils.maskMobile(savedNormalized)}) — " +
                            "wahi number daal kar naya PIN banao. Naye number se dobara account nahi banta."
                    pin.length != 4 -> error = "PIN must be 4 digits."
                    pin != confirmPin -> error = "PINs do not match."
                    else -> {
                        error = null
                        onCreatePin(normalized, pin) { error = it }
                    }
                }
            }
        } else if (showReset) {
            Text("Forgot PIN?", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "Account banate waqt diya hua mobile number daalo aur naya 4-digit PIN banao. " +
                    "Sahi number hote hi aap turant login ho jaoge — purana data safe rahega.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = mobile,
                onValueChange = { mobile = it.filter { c -> c.isDigit() }.take(12) },
                label = { Text("Registered Mobile Number") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = pin,
                onValueChange = { pin = it.filter { c -> c.isDigit() }.take(4) },
                label = { Text("New 4-digit PIN") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = confirmPin,
                onValueChange = { confirmPin = it.filter { c -> c.isDigit() }.take(4) },
                label = { Text("Confirm New PIN") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            error?.let { Text(it, color = BizColors.ExpenseRed) }
            PrimaryButton("Reset PIN & Login") {
                val normalized = AuthUtils.normalizeMobile(mobile)
                when {
                    normalized.length != 10 -> error = "Enter a valid 10-digit mobile number."
                    pin.length != 4 -> error = "PIN must be 4 digits."
                    pin != confirmPin -> error = "PINs do not match."
                    else -> {
                        error = null
                        onResetPin(normalized, pin) { error = it }
                    }
                }
            }
            TextButton(onClick = { showReset = false; error = null; pin = ""; confirmPin = "" }) {
                Text("Back to login")
            }
        } else {
            Text("Welcome back", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (savedNormalized.isNotBlank()) {
                Text(
                    "Account: ${AuthUtils.maskMobile(savedNormalized)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                "Enter your 4-digit PIN to unlock BizKhata.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = pin,
                onValueChange = { pin = it.filter { c -> c.isDigit() }.take(4) },
                label = { Text("4-digit PIN") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            if (wrongAttempts > 0) {
                Text("Wrong PIN — try again.", color = BizColors.ExpenseRed)
            }
            error?.let { Text(it, color = BizColors.ExpenseRed) }
            PrimaryButton("Unlock") {
                if (pin.length != 4) {
                    error = "Enter your 4-digit PIN."
                } else {
                    error = null
                    onUnlock(pin) { wrongAttempts += 1 }
                }
            }
            TextButton(onClick = { showReset = true; error = null; pin = ""; confirmPin = "" }) {
                Text("Forgot PIN?")
            }
            Button(
                onClick = onUnlocked,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            ) { Text("Use without PIN (this device only)") }
        }
    }
}
