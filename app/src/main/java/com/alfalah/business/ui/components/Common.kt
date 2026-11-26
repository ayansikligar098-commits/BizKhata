package com.alfalah.business.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.ui.theme.BizColors
import java.text.NumberFormat
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max

// ---------------------------------------------------------------------------
// Money — paise (Long) only. NEVER Double maths for money.
// ---------------------------------------------------------------------------

private val inIntegerFormat: NumberFormat =
    NumberFormat.getNumberInstance(Locale("en", "IN")).apply { maximumFractionDigits = 0 }

/**
 * Format paise as Indian rupees, integer-safe (no Double anywhere):
 * ₹1,234 for whole rupees, ₹1,234.50 when paise remain. Negative amounts
 * keep their minus sign (differences can be negative).
 */
fun formatRupees(amountPaise: Long): String {
    val sign = if (amountPaise < 0) "-" else ""
    val abs = kotlin.math.abs(amountPaise)
    val rupees = abs / 100
    val paise = abs % 100
    return if (paise == 0L) {
        "$sign₹${inIntegerFormat.format(rupees)}"
    } else {
        "$sign₹${inIntegerFormat.format(rupees)}.${paise.toString().padStart(2, '0')}"
    }
}

/**
 * Parse a typed rupee amount into paise, decimal-safe (BigDecimal).
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

/** Epoch day → "26 Nov 2026". */
fun formatDay(epochDay: Long): String =
    LocalDate.ofEpochDay(epochDay).format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))

/** Epoch day → "26 Nov, 11:20 AM" style short date (time is not stored, so date only). */
fun formatDayShort(epochDay: Long): String =
    LocalDate.ofEpochDay(epochDay).format(DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH))

fun todayEpochDay(): Long = LocalDate.now(ZoneOffset.UTC).toEpochDay()

/** "Ayan Sikligar" → "AS". One word → first letter. */
fun initialsOf(name: String): String {
    val parts = name.trim().split("\\s+".toRegex()).filter { it.isNotEmpty() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(1).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}

/** A stable avatar tint picked from the name (no random colours). */
fun avatarColorFor(name: String): Color {
    val palette = listOf(
        BizColors.Purple, Color(0xFF00B8A9), Color(0xFFEF6C00),
        BizColors.IncomeGreen, Color(0xFF8E24AA), Color(0xFF5C6BC0),
        Color(0xFFD32F2F), Color(0xFF00897B)
    )
    val idx = (name.hashCode() and Int.MAX_VALUE) % palette.size
    return palette[idx]
}

// ---------------------------------------------------------------------------
// Shared building blocks — the reference design language.
// ---------------------------------------------------------------------------

/** White card with soft shadow + rounded corners (the reference look). */
@Composable
fun BizCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(16.dp)) { content() }
    }
}

/** Big, touch-friendly purple primary button (min 52dp tall). */
@Composable
fun PrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = BizColors.Purple,
            contentColor = Color.White
        )
    ) {
        Text(label, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Small stat card: label on top, big value, optional coloured subtitle. */
@Composable
fun StatCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    subtitle: String? = null,
    subtitleColor: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
    BizCard(modifier = modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = valueColor)
        subtitle?.let {
            Spacer(Modifier.height(2.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = subtitleColor)
        }
    }
}

/** Circle with the person's initials, tinted by name. */
@Composable
fun AvatarCircle(name: String, modifier: Modifier = Modifier, sizeDp: Int = 48) {
    Box(
        modifier = modifier
            .size(sizeDp.dp)
            .clip(CircleShape)
            .background(avatarColorFor(name)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            initialsOf(name),
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = (sizeDp / 3).sp
        )
    }
}

/** Status pill — colour by JobStatus (New grey, In Progress orange, Completed green, Pending red, Delivered teal, Cancelled grey). */
@Composable
fun StatusPill(status: JobStatus) {
    val (label, bg, fg) = when (status) {
        JobStatus.NEW -> Triple("New", Color(0xFFE8EAF6), Color(0xFF3949AB))
        JobStatus.IN_PROGRESS -> Triple("In Progress", Color(0xFFFFF3E0), BizColors.WarningOrange)
        JobStatus.SUBMITTED -> Triple("Submitted", Color(0xFFE3F2FD), Color(0xFF1565C0))
        JobStatus.PENDING -> Triple("Pending", Color(0xFFFCE4EC), BizColors.ExpenseRed)
        JobStatus.COMPLETED -> Triple("Completed", Color(0xFFE8F5E9), BizColors.IncomeGreen)
        JobStatus.DELIVERED -> Triple("Delivered", Color(0xFFE0F2F1), Color(0xFF00796B))
        JobStatus.CANCELLED -> Triple("Cancelled", Color(0xFFEEEEEE), Color(0xFF757575))
    }
    Box(
        Modifier.clip(RoundedCornerShape(20.dp)).background(bg).padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(label, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** A row of selectable filter pills (scrollable by the caller if needed). */
@Composable
fun FilterPills(
    options: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { option ->
            val isSelected = option == selected
            FilterChip(
                selected = isSelected,
                onClick = { onSelect(option) },
                label = { Text(option) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = BizColors.Purple,
                    selectedLabelColor = Color.White
                )
            )
        }
    }
}

/** Search field with a magnifier icon, used on list screens. */
@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = { Text(placeholder) },
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = "Search") },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        modifier = modifier.fillMaxWidth()
    )
}

/** Proper empty state — never demo rows. Optional action button. */
@Composable
fun EmptyState(
    message: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Nothing here yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        if (actionLabel != null && onAction != null) {
            Button(onClick = onAction, colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple)) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
fun LoadingState(message: String = "Loading…") {
    Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        CircularProgressIndicator(color = BizColors.Purple)
        Text(message, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun ErrorState(message: String, onRetry: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Something went wrong", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(message, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
        if (onRetry != null) {
            Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = BizColors.Purple)) {
                Text("Try again")
            }
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        modifier = modifier.padding(vertical = 8.dp)
    )
}

/** Backwards-compatible alias used by older screens. */
@Composable
fun InfoCard(
    title: String,
    value: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    StatCard(label = title, value = value, subtitle = subtitle, modifier = modifier)
}

@Composable
fun BigButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    PrimaryButton(label = label, onClick = onClick, modifier = modifier)
}

// ---------------------------------------------------------------------------
// Charts — Compose Canvas only, no chart dependency.
// ---------------------------------------------------------------------------

/**
 * Donut chart with the total in the centre (overlay text) and a legend
 * beside it. [segments] are (label, paise) pairs; empty input draws a
 * faint ring and "₹0" so the card never looks broken on a fresh install.
 */
@Composable
fun DonutChart(
    segments: List<Pair<String, Long>>,
    totalPaise: Long,
    modifier: Modifier = Modifier
) {
    val total = max(1L, segments.sumOf { it.second })
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(140.dp),
            contentAlignment = Alignment.Center
        ) {
            Canvas(Modifier.size(140.dp)) {
                val stroke = 34f
                var startAngle = -90f
                if (segments.isEmpty() || segments.sumOf { it.second } == 0L) {
                    drawArc(
                        color = Color(0xFFE0E0E0),
                        startAngle = 0f, sweepAngle = 360f, useCenter = false,
                        style = Stroke(width = stroke, cap = StrokeCap.Butt),
                        size = Size(size.width - stroke, size.height - stroke),
                        topLeft = Offset(stroke / 2, stroke / 2)
                    )
                } else {
                    segments.forEachIndexed { i, (_, amount) ->
                        val sweep = (amount.toFloat() / total.toFloat()) * 360f
                        if (sweep > 0f) {
                            drawArc(
                                color = BizColors.ChartColors[i % BizColors.ChartColors.size],
                                startAngle = startAngle, sweepAngle = sweep, useCenter = false,
                                style = Stroke(width = stroke, cap = StrokeCap.Butt),
                                size = Size(size.width - stroke, size.height - stroke),
                                topLeft = Offset(stroke / 2, stroke / 2)
                            )
                            startAngle += sweep
                        }
                    }
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(formatRupees(totalPaise), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text("Total", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.width(16.dp))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
            if (segments.isEmpty()) {
                Text(
                    "No income recorded in this period yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                segments.forEachIndexed { i, (label, amount) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(10.dp).clip(CircleShape)
                                .background(BizColors.ChartColors[i % BizColors.ChartColors.size])
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Text(formatRupees(amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

/**
 * Simple vertical bar chart (Canvas). [values] are (label, paise) pairs.
 * Bars scale to the largest value; a zero max draws an empty baseline.
 */
@Composable
fun BarChart(
    values: List<Pair<String, Long>>,
    modifier: Modifier = Modifier,
    barColor: Color = BizColors.Purple
) {
    val maxValue = max(1L, values.maxOfOrNull { it.second } ?: 0L)
    Column(modifier = modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(160.dp)) {
            if (values.isEmpty()) return@Canvas
            val gap = size.width / values.size
            val barWidth = gap * 0.55f
            values.forEachIndexed { i, (_, amount) ->
                val h = (amount.toFloat() / maxValue.toFloat()) * (size.height - 8f)
                drawRoundRect(
                    color = barColor,
                    topLeft = Offset(i * gap + (gap - barWidth) / 2, size.height - h),
                    size = Size(barWidth, max(h, 2f))
                )
            }
        }
        Row(Modifier.fillMaxWidth()) {
            values.forEach { (label, _) ->
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f)
                )
            }
        }
        if (values.isEmpty()) {
            Text(
                "No data in this period yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
}
