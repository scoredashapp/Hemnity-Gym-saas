package com.example.ui.screens.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.R
import com.example.data.repository.AuthRepository
import com.example.ui.theme.ObsidianBg
import com.example.ui.theme.OrangePrimary
import com.example.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SplashDestination {
    data object Loading : SplashDestination
    data object Login : SplashDestination
    data object OwnerHome : SplashDestination
}

class SplashViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {
    private val _destination = MutableStateFlow<SplashDestination>(SplashDestination.Loading)
    val destination: StateFlow<SplashDestination> = _destination.asStateFlow()

    init {
        validateSession()
    }

    private fun validateSession() {
        viewModelScope.launch {
            delay(850)
            val session = authRepository.validateExistingOwnerSession()
            _destination.value = if (session != null && session.role.isAuthorizedOwner) {
                SplashDestination.OwnerHome
            } else {
                SplashDestination.Login
            }
        }
    }
}

@Composable
fun SplashScreen(
    destination: SplashDestination,
    onNavigateToLogin: () -> Unit,
    onNavigateToOwner: () -> Unit
) {
    val scale = remember { Animatable(0.84f) }
    val alpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        launch {
            scale.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = 550, easing = FastOutSlowInEasing)
            )
        }
        launch {
            alpha.animateTo(
                targetValue = 1f,
                animationSpec = tween(durationMillis = 500)
            )
        }
    }

    LaunchedEffect(destination) {
        when (destination) {
            SplashDestination.Login -> onNavigateToLogin()
            SplashDestination.OwnerHome -> onNavigateToOwner()
            SplashDestination.Loading -> Unit
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        OrangePrimary.copy(alpha = 0.24f),
                        ObsidianBg,
                        ObsidianBg
                    )
                )
            )
            .systemBarsPadding(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .padding(32.dp)
                .scale(scale.value)
                .alpha(alpha.value)
        ) {
            Image(
                painter = painterResource(id = R.drawable.hemnity_logo),
                contentDescription = stringResource(R.string.cd_hemnity_logo),
                modifier = Modifier
                    .size(132.dp)
                    .clip(RoundedCornerShape(30.dp)),
                contentScale = ContentScale.Crop
            )
            Spacer(modifier = Modifier.height(22.dp))
            Text(
                text = "Hemnity Gym Owner",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Gym Operations & QR Check-In Console",
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary
            )
            Spacer(modifier = Modifier.height(36.dp))
            CircularProgressIndicator(
                modifier = Modifier.size(26.dp),
                strokeWidth = 2.5.dp,
                color = OrangePrimary
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Validating Gym Owner session...",
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary
            )
        }
    }
}
