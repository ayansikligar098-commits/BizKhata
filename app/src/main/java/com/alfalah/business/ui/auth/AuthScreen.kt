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
 */
@Composable
fun AuthScreen(
    hasPin: Boolean,
    savedMobile: String,
    onCreatePin: (mobile: String, pin: String) -> Unit,
    onUnlock: (pin: String, onWrong: () -> Unit) -> Unit,
    onUnlocked: () -> Unit
) {
    var mobile by remember { mutableStateOf(savedMobile) }
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var wrongAttempts by remember { mutableStateOf(0) }

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
            Text(
                "Enter your mobile number and choose a 4-digit PIN. You will use this PIN to unlock the app.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = mobile,
                onValueChange = { mobile = it.filter { c -> c.isDigit() }.take(10) },
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
                when {
                    mobile.length < 10 -> error = "Enter a valid 10-digit mobile number."
                    pin.length != 4 -> error = "PIN must be 4 digits."
                    pin != confirmPin -> error = "PINs do not match."
                    else -> {
                        error = null
                        onCreatePin(mobile, pin)
                    }
                }
            }
        } else {
            Text("Welcome back", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
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
            Button(
                onClick = onUnlocked,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            ) { Text("Use without PIN (this device only)") }
            Text(
                "Forgot PIN? Remove the PIN from Settings → Security & Privacy after unlocking, or clear the app data (this erases local data — keep a backup).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
