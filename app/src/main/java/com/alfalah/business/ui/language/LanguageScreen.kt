package com.alfalah.business.ui.language

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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.ui.theme.BizColors

/**
 * Language selection — shown after login, before anything else (v2 spec).
 * English is the default. The choice is saved and can be changed in Settings.
 */
@Composable
fun LanguageScreen(
    language: AppLanguage,
    onChoose: (AppLanguage) -> Unit
) {
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
        Spacer(Modifier.height(24.dp))
        Text("Choose your language", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text("Apni bhasha chuno", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { onChoose(AppLanguage.ENGLISH) },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
        ) { Text("English (Default)", fontSize = 16.sp) }
        Button(
            onClick = { onChoose(AppLanguage.HINDI) },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
        ) { Text("हिन्दी (Hindi)", fontSize = 16.sp) }
        Button(
            onClick = { onChoose(AppLanguage.HINGLISH) },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple)
        ) { Text("Hinglish", fontSize = 16.sp) }
        Spacer(Modifier.height(16.dp))
        Text("You can change the language later in Settings.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
