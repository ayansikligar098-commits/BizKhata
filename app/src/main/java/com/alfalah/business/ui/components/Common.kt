package com.alfalah.business.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.NumberFormat
import java.util.Locale

/** Money formatting — Indian rupees, no decimals for paise-exact amounts. */
fun formatRupees(amountPaise: Long): String {
    val rupees = amountPaise / 100.0
    return NumberFormat.getCurrencyInstance(Locale("en", "IN")).format(rupees)
}

/**
 * Parse a typed rupee amount into paise, decimal-safe.
 * NEVER use Double maths for money (19.99 * 100 can become 1998.99…).
 * Returns null for blank/invalid input.
 */
fun parseRupeesToPaise(text: String): Long? {
    val clean = text.trim().replace(",", "")
    if (clean.isEmpty()) return null
    return try {
        val bd = java.math.BigDecimal(clean)
        if (bd < java.math.BigDecimal.ZERO) return null
        bd.multiply(java.math.BigDecimal(100)).toLong()
    } catch (_: NumberFormatException) {
        null
    }
}

/** Big, touch-friendly primary button (min 56dp tall). */
@Composable
fun BigButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Text(label, fontSize = 18.sp, modifier = Modifier.padding(vertical = 8.dp))
    }
}

/** A simple labelled card used across Dashboard, Khata, Agents and Reports. */
@Composable
fun InfoCard(
    title: String,
    value: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier.fillMaxWidth().padding(4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

@Composable
fun EmptyState(message: String) {
    Text(
        message,
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.padding(24.dp)
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(vertical = 8.dp)
    )
}
