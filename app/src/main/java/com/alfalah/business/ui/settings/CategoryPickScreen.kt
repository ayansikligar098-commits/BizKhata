package com.alfalah.business.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.domain.BusinessCategory
import com.alfalah.business.ui.components.BizCard
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.theme.BizColors

/**
 * Category picker at signup / new profile.
 * CSC / Cyber Cafe is the first category; every category gets its own
 * ready-made setup (dashboard, modules, income/expense categories).
 * A grocery shop never sees CSC modules unless the owner enables them.
 */
@Composable
fun CategoryPickScreen(
    language: AppLanguage,
    onPick: (BusinessCategory) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(Modifier.height(8.dp))
            Text(
                "Choose Your Business Type",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Pick the category that matches your shop. You get a ready-made setup for it, and you can add or change services later.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "CSC / Cyber Cafe is first — ${Branding.OWNER_BUSINESS_NAME} runs on it.",
                style = MaterialTheme.typography.bodyMedium,
                color = BizColors.Purple,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        val categories = BusinessCategory.values().toList()
        if (categories.isEmpty()) {
            item { EmptyState("No categories available.") }
        } else {
            items(categories) { category ->
                BizCard(
                    Modifier.fillMaxWidth(),
                    onClick = { onPick(category) }
                ) {
                    Text(category.label, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                    if (category == BusinessCategory.CSC) {
                        Text(
                            "PAN, Aadhaar, Voter ID, Ayushman, Xerox, Printing, Money Transfer — ready-made",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}
