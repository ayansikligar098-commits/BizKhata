package com.alfalah.business.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// BizKhata colours — professional, calm, not flashy. The final branding
// (colours/fonts/logo) is a Section 28 pending item; these are safe defaults
// in one place, easy to change.
private val BizGreen = Color(0xFF1B7A4D)
private val BizGreenDark = Color(0xFF7BC8A4)
private val BizGold = Color(0xFFB8860B)
private val LightBackground = Color(0xFFF7F5F0)
private val DarkBackground = Color(0xFF121614)

private val LightColors = lightColorScheme(
    primary = BizGreen,
    secondary = BizGold,
    background = LightBackground,
    surface = Color.White
)

private val DarkColors = darkColorScheme(
    primary = BizGreenDark,
    secondary = BizGold,
    background = DarkBackground,
    surface = Color(0xFF1C211E)
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
