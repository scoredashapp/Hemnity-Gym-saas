package com.example.ui.theme

import android.app.Activity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

private val HemnityDarkColorScheme = darkColorScheme(
    primary = PrimaryOrange,
    onPrimary = PrimaryText,
    primaryContainer = OrangeContainerDark,
    onPrimaryContainer = OnOrangeContainer,
    secondary = AccentOrange,
    onSecondary = PrimaryBackground,
    secondaryContainer = SurfaceHighlight,
    onSecondaryContainer = PrimaryText,
    tertiary = StatusActive,
    onTertiary = PrimaryBackground,
    background = PrimaryBackground,
    onBackground = PrimaryText,
    surface = SecondaryBackground,
    onSurface = PrimaryText,
    surfaceVariant = ElevatedSurface,
    onSurfaceVariant = SecondaryText,
    outline = CardBorderSubtle,
    outlineVariant = Color(0xFF22222C),
    error = StatusExpired,
    onError = PrimaryText,
    errorContainer = StatusExpiredContainer,
    onErrorContainer = Color(0xFFFCA5A5),
)

val HemnityShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun HemnityGymTheme(
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                WindowCompat.getInsetsController(window, view).apply {
                    isAppearanceLightStatusBars = false
                    isAppearanceLightNavigationBars = false
                }
            }
        }
    }

    MaterialTheme(
        colorScheme = HemnityDarkColorScheme,
        typography = HemnityTypography,
        shapes = HemnityShapes,
        content = content,
    )
}
