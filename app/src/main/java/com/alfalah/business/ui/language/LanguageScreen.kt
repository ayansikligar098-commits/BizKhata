package com.alfalah.business.ui.language

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.ui.components.SectionTitle

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
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        SectionTitle(Branding.APP_NAME)
        Text("Choose your language / Apni bhasha chuno")
        Button(onClick = { onChoose(AppLanguage.ENGLISH) }, modifier = Modifier.fillMaxWidth()) {
            Text("English (Default)")
        }
        Button(onClick = { onChoose(AppLanguage.HINDI) }, modifier = Modifier.fillMaxWidth()) {
            Text("हिन्दी (Hindi)")
        }
        Button(onClick = { onChoose(AppLanguage.HINGLISH) }, modifier = Modifier.fillMaxWidth()) {
            Text("Hinglish")
        }
        Text("You can change the language later in Settings.")
    }
}
