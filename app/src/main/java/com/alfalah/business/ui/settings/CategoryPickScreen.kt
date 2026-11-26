package com.alfalah.business.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.BusinessCategory
import com.alfalah.business.ui.components.EmptyState
import com.alfalah.business.ui.components.SectionTitle

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
        modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            SectionTitle("Choose Your Business Type")
            Text("Pick the category that matches your shop. You get a ready-made setup for it, and you can add or change services later.")
        }
        val categories = BusinessCategory.values().toList()
        if (categories.isEmpty()) {
            item { EmptyState("No categories available.") }
        } else {
            items(categories) { category ->
                Button(
                    onClick = { onPick(category) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(category.label) }
            }
        }
    }
}
