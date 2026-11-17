package com.example.ui.auth

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.R
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryText

@Composable
fun SplashScreen(
    authViewModel: AuthViewModel,
    onNavigateToDashboard: () -> Unit,
    onNavigateToLogin: () -> Unit,
) {
    val destination by authViewModel.splashState.collectAsStateWithLifecycle()
    var appeared by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        appeared = true
        authViewModel.checkSavedSession()
    }

    LaunchedEffect(destination) {
        when (destination) {
            SplashDestination.AuthenticatedMember -> onNavigateToDashboard()
            SplashDestination.RequiresLogin -> onNavigateToLogin()
            SplashDestination.Loading -> Unit
        }
    }

    val logoScale by animateFloatAsState(
        targetValue = if (appeared) 1f else 0.78f,
        animationSpec = tween(durationMillis = 650, easing = FastOutSlowInEasing),
        label = "splash_logo_scale",
    )
    val logoAlpha by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = 600),
        label = "splash_logo_alpha",
    )

    val infiniteTransition = rememberInfiniteTransition(label = "splash_loader")
    val sweepRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "splash_arc_rotation",
    )
    val glowPulse by infiniteTransition.animateFloat(
        initialValue = 0.25f,
        targetValue = 0.55f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "splash_glow_pulse",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PrimaryBackground)
            .statusBarsPadding()
            .navigationBarsPadding()
            .testTag("splash_screen"),
        contentAlignment = Alignment.Center,
    ) {
        // Ambient orange radial glow behind emblem
        Canvas(modifier = Modifier.fillMaxSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        PrimaryOrange.copy(alpha = glowPulse * 0.45f),
                        AccentOrange.copy(alpha = glowPulse * 0.12f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width / 2f, size.height * 0.44f),
                    radius = size.minDimension * 0.48f,
                ),
                center = Offset(size.width / 2f, size.height * 0.44f),
                radius = size.minDimension * 0.48f,
            )
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(164.dp)
                    .scale(logoScale)
                    .alpha(logoAlpha),
            ) {
                Canvas(modifier = Modifier.size(164.dp)) {
                    drawArc(
                        brush = Brush.sweepGradient(
                            colors = listOf(
                                Color.Transparent,
                                PrimaryOrange,
                                AccentOrange,
                                Color.Transparent,
                            )
                        ),
                        startAngle = sweepRotation,
                        sweepAngle = 220f,
                        useCenter = false,
                        style = Stroke(width = 3.5.dp.toPx(), cap = StrokeCap.Round),
                    )
                }

                Image(
                    painter = painterResource(id = R.drawable.hemnity_logo),
                    contentDescription = stringResource(R.string.app_name),
                    modifier = Modifier
                        .size(136.dp)
                        .clip(RoundedCornerShape(32.dp)),
                )
            }

            Spacer(modifier = Modifier.height(28.dp))

            Text(
                text = "HEMNITY GYM",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
                color = PrimaryText,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "MEMBER COMPANION",
                style = MaterialTheme.typography.labelLarge,
                letterSpacing = 3.sp,
                color = PrimaryOrange,
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Verifying your secure gym session...",
                style = MaterialTheme.typography.bodySmall,
                color = SecondaryText,
            )
        }
    }
}
