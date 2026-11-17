package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.domain.model.AppThemeMode

private val HemnityDarkColorScheme = darkColorScheme(
    primary = OrangePrimary,
    onPrimary = TextPrimary,
    primaryContainer = OrangeContainer,
    onPrimaryContainer = OrangeAccent,
    secondary = OrangeAccent,
    onSecondary = ObsidianBg,
    secondaryContainer = CharcoalSurfaceHigh,
    onSecondaryContainer = TextPrimary,
    tertiary = Emerald500,
    onTertiary = ObsidianBg,
    background = ObsidianBg,
    onBackground = TextPrimary,
    surface = CharcoalSurface,
    onSurface = TextPrimary,
    surfaceVariant = CharcoalSurfaceHigh,
    onSurfaceVariant = TextSecondary,
    surfaceContainerLow = CharcoalSurfaceLow,
    surfaceContainer = CharcoalSurface,
    surfaceContainerHigh = CharcoalSurfaceHigh,
    outline = BorderZinc,
    outlineVariant = BorderZinc,
    error = Rose500,
    onError = Color.White,
    errorContainer = Rose950,
    onErrorContainer = Color(0xFFFECACA)
)

private val HemnityLightColorScheme = lightColorScheme(
    primary = OrangePrimary,
    onPrimary = Color.White,
    primaryContainer = OrangeLight,
    onPrimaryContainer = Color(0xFF431407),
    secondary = Slate900,
    onSecondary = Color.White,
    secondaryContainer = Slate200,
    onSecondaryContainer = Slate900,
    tertiary = Color(0xFF15803D),
    onTertiary = Color.White,
    background = Slate50,
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate100,
    onSurfaceVariant = Slate700,
    surfaceContainerLow = Color.White,
    surfaceContainer = Slate100,
    surfaceContainerHigh = Slate200,
    outline = Slate200,
    outlineVariant = Slate200,
    error = Color(0xFFDC2626),
    onError = Color.White,
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF7F1D1D)
)

private val HemnityShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

@Composable
fun HemnityGymTheme(
    themeMode: AppThemeMode = AppThemeMode.DARK,
    content: @Composable () -> Unit
) {
    val useDark = when (themeMode) {
        AppThemeMode.DARK -> true
        AppThemeMode.LIGHT -> false
        AppThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    val colorScheme = if (useDark) HemnityDarkColorScheme else HemnityLightColorScheme
    val semanticColors = if (useDark) DarkHemnitySemanticColors else LightHemnitySemanticColors

    CompositionLocalProvider(LocalHemnityColors provides semanticColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = HemnityTypography,
            shapes = HemnityShapes,
            content = content
        )
    }
}
