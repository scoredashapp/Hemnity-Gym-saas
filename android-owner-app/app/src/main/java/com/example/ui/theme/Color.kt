package com.example.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Brand & Surface Tokens (Premium Black + Orange Gym Owner Palette)
val ObsidianBg = Color(0xFF0B0B0F)
val CharcoalSurface = Color(0xFF17171D)
val CharcoalSurfaceHigh = Color(0xFF1F1F27)
val CharcoalSurfaceLow = Color(0xFF111116)
val BorderZinc = Color(0xFF272730)

val TextPrimary = Color(0xFFFFFFFF)
val TextSecondary = Color(0xFFA1A1AA)

val OrangePrimary = Color(0xFFFF6B00)
val OrangeAccent = Color(0xFFFF9500)
val OrangeContainer = Color(0xFF331804)
val OrangeLight = Color(0xFFFFEDD5)

val Slate50 = Color(0xFFF8FAFC)
val Slate100 = Color(0xFFF1F5F9)
val Slate200 = Color(0xFFE2E8F0)
val Slate700 = Color(0xFF3F3F46)
val Slate900 = Color(0xFF18181B)

val Emerald500 = Color(0xFF22C55E)
val Emerald950 = Color(0xFF052E16)
val Amber500 = Color(0xFFF59E0B)
val Amber950 = Color(0xFF451A03)
val Rose500 = Color(0xFFEF4444)
val Rose950 = Color(0xFF450A0A)
val Sky500 = Color(0xFF38BDF8)
val Sky950 = Color(0xFF082F49)

@Immutable
data class HemnitySemanticColors(
    val success: Color,
    val onSuccess: Color,
    val successContainer: Color,
    val warning: Color,
    val onWarning: Color,
    val warningContainer: Color,
    val info: Color,
    val infoContainer: Color,
    val cardBorder: Color,
    val subtleSurface: Color
)

val DarkHemnitySemanticColors = HemnitySemanticColors(
    success = Emerald500,
    onSuccess = Color(0xFF04210F),
    successContainer = Emerald950,
    warning = Amber500,
    onWarning = Color(0xFF291200),
    warningContainer = Amber950,
    info = Sky500,
    infoContainer = Sky950,
    cardBorder = BorderZinc,
    subtleSurface = CharcoalSurfaceLow
)

val LightHemnitySemanticColors = HemnitySemanticColors(
    success = Color(0xFF15803D),
    onSuccess = Color.White,
    successContainer = Color(0xFFDCFCE7),
    warning = Color(0xFFB45309),
    onWarning = Color.White,
    warningContainer = Color(0xFFFEF3C7),
    info = Color(0xFF0369A1),
    infoContainer = Color(0xFFE0F2FE),
    cardBorder = Slate200,
    subtleSurface = Slate100
)

val LocalHemnityColors = staticCompositionLocalOf { DarkHemnitySemanticColors }
