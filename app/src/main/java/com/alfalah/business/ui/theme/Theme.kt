package com.alfalah.business.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * BizKhata brand — premium navy + purple, matching the design reference
 * (dark navy header, indigo-violet primary, white cards, soft shadows).
 * The same palette drives Light and Dark: the navy header stays navy in
 * both, the purple primary stays purple, only surfaces/text adapt.
 *
 * Brand colours live here and ONLY here — screens use MaterialTheme or
 * these constants, never ad-hoc hex values.
 */
object BizColors {
    /** Primary indigo-violet (buttons, selected pills, accents). */
    val Purple = Color(0xFF6C5CE7)
    val PurpleDark = Color(0xFF5847D6)
    val PurpleLight = Color(0xFF9D8DF1)
    val PurpleSoft = Color(0xFFEFEBFF)   // light-mode chip / tint background
    val PurpleSoftDark = Color(0xFF2A2350)

    /** Dark navy (top bar, drawer header, gradient cards). */
    val Navy = Color(0xFF1B1B3A)
    val NavyDark = Color(0xFF12122B)
    val NavyLight = Color(0xFF2E2E5C)

    /** Semantic money colours. */
    val IncomeGreen = Color(0xFF1B7A4D)
    val IncomeGreenLight = Color(0xFF7BC8A4)
    val ExpenseRed = Color(0xFFD32F2F)
    val ExpenseRedLight = Color(0xFFEF9A9A)
    val WarningOrange = Color(0xFFEF6C00)
    val WarningOrangeLight = Color(0xFFFFCC80)
    val Gold = Color(0xFFB8860B)

    /** Chart palette for the service-wise donut / bars (colour-blind safe order). */
    val ChartColors = listOf(
        Color(0xFF6C5CE7), Color(0xFF00B8A9), Color(0xFFFF8A00),
        Color(0xFF1B7A4D), Color(0xFFD32F2F), Color(0xFF8E24AA),
        Color(0xFF5C6BC0), Color(0xFF78909C)
    )

    val LightBackground = Color(0xFFF4F2FA)
    val DarkBackground = Color(0xFF12122B)
    val DarkSurface = Color(0xFF1E1E3D)
    val DarkSurfaceVariant = Color(0xFF2A2A4A)
}

private val LightColors = lightColorScheme(
    primary = BizColors.Purple,
    onPrimary = Color.White,
    primaryContainer = BizColors.PurpleSoft,
    onPrimaryContainer = BizColors.Navy,
    secondary = BizColors.Navy,
    onSecondary = Color.White,
    tertiary = BizColors.IncomeGreen,
    background = BizColors.LightBackground,
    onBackground = BizColors.Navy,
    surface = Color.White,
    onSurface = BizColors.Navy,
    surfaceVariant = Color(0xFFEDEAF6),
    onSurfaceVariant = Color(0xFF5B5870),
    error = BizColors.ExpenseRed
)

private val DarkColors = darkColorScheme(
    primary = BizColors.PurpleLight,
    onPrimary = BizColors.NavyDark,
    primaryContainer = BizColors.PurpleSoftDark,
    onPrimaryContainer = Color.White,
    secondary = BizColors.PurpleLight,
    onSecondary = BizColors.NavyDark,
    tertiary = BizColors.IncomeGreenLight,
    background = BizColors.DarkBackground,
    onBackground = Color.White,
    surface = BizColors.DarkSurface,
    onSurface = Color.White,
    surfaceVariant = BizColors.DarkSurfaceVariant,
    onSurfaceVariant = Color(0xFFC5C2DE),
    error = BizColors.ExpenseRedLight
)

@Composable
fun BizKhataTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
