package com.example.ui.screens.login

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.R
import com.example.data.repository.AuthRepository
import com.example.domain.model.ApiResult
import com.example.domain.model.LandingInfo
import com.example.ui.components.HemnityCard
import com.example.ui.components.StatusBadge
import com.example.ui.theme.JetBrainsMonoFamily
import com.example.ui.theme.LocalHemnityColors
import com.example.ui.theme.OrangeAccent
import com.example.ui.theme.OrangePrimary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class LoginAuthMode {
    EMAIL_PASSWORD,
    BEARER_TOKEN
}

data class LoginUiState(
    val authMode: LoginAuthMode = LoginAuthMode.EMAIL_PASSWORD,
    val email: String = "",
    val password: String = "",
    val bearerTokenInput: String = "",
    val passwordVisible: Boolean = false,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val landingInfo: LandingInfo? = null,
    val isForgotDialogOpen: Boolean = false,
    val forgotEmail: String = "",
    val forgotStatusMessage: String? = null,
    val isForgotSubmitting: Boolean = false
)

class LoginViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        loadPublicLanding()
    }

    private fun loadPublicLanding() {
        viewModelScope.launch {
            when (val res = authRepository.fetchPublicLanding()) {
                is ApiResult.Success -> _uiState.update { it.copy(landingInfo = res.data) }
                else -> Unit
            }
        }
    }

    fun onAuthModeSelected(mode: LoginAuthMode) {
        _uiState.update { it.copy(authMode = mode, errorMessage = null) }
    }

    fun onEmailChanged(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null) }
    }

    fun onPasswordChanged(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null) }
    }

    fun onBearerTokenChanged(value: String) {
        _uiState.update { it.copy(bearerTokenInput = value, errorMessage = null) }
    }

    fun togglePasswordVisibility() {
        _uiState.update { it.copy(passwordVisible = !it.passwordVisible) }
    }

    fun openForgotPassword() {
        _uiState.update {
            it.copy(
                isForgotDialogOpen = true,
                forgotEmail = it.email,
                forgotStatusMessage = null
            )
        }
    }

    fun closeForgotPassword() {
        _uiState.update { it.copy(isForgotDialogOpen = false, forgotStatusMessage = null) }
    }

    fun onForgotEmailChanged(value: String) {
        _uiState.update { it.copy(forgotEmail = value, forgotStatusMessage = null) }
    }

    fun submitForgotPassword() {
        val email = _uiState.value.forgotEmail.trim()
        if (email.isBlank()) {
            _uiState.update { it.copy(forgotStatusMessage = "Please enter your registered Gym Owner email.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isForgotSubmitting = true, forgotStatusMessage = null) }
            val result = authRepository.requestPasswordReset(email)
            val msg = when (result) {
                is ApiResult.Success -> result.data
                is ApiResult.HttpError -> {
                    if (result.isNotFound) {
                        "Password reset API (/api/v1/auth/forgot-password) is not yet enabled on gym.hemnity.in. Please reset at https://gym.hemnity.in/login.php or contact support@hemnity.in."
                    } else {
                        result.message
                    }
                }
                is ApiResult.NetworkError -> result.message
            }
            _uiState.update { it.copy(isForgotSubmitting = false, forgotStatusMessage = msg) }
        }
    }

    fun submitLogin(onAuthenticatedOwner: () -> Unit) {
        val state = _uiState.value
        if (state.authMode == LoginAuthMode.BEARER_TOKEN) {
            val token = state.bearerTokenInput.trim()
            if (token.isBlank()) {
                _uiState.update { it.copy(errorMessage = "Please paste your Hemnity Owner Bearer token.") }
                return
            }
            viewModelScope.launch {
                _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
                when (val res = authRepository.loginWithBearerToken(token)) {
                    is ApiResult.Success -> {
                        _uiState.update { it.copy(isSubmitting = false) }
                        onAuthenticatedOwner()
                    }
                    is ApiResult.HttpError -> _uiState.update {
                        it.copy(isSubmitting = false, errorMessage = res.message)
                    }
                    is ApiResult.NetworkError -> _uiState.update {
                        it.copy(isSubmitting = false, errorMessage = res.message)
                    }
                }
            }
            return
        }

        val email = state.email.trim()
        val password = state.password
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Email and password are required.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            when (val res = authRepository.loginOwner(email, password)) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(isSubmitting = false) }
                    onAuthenticatedOwner()
                }
                is ApiResult.HttpError -> {
                    _uiState.update {
                        it.copy(isSubmitting = false, errorMessage = res.message)
                    }
                }
                is ApiResult.NetworkError -> {
                    _uiState.update {
                        it.copy(isSubmitting = false, errorMessage = res.message)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    uiState: LoginUiState,
    sessionRevokedBanner: String?,
    onAuthModeSelected: (LoginAuthMode) -> Unit = {},
    onEmailChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onBearerTokenChanged: (String) -> Unit = {},
    onTogglePasswordVisibility: () -> Unit,
    onOpenForgotPassword: () -> Unit,
    onCloseForgotPassword: () -> Unit,
    onForgotEmailChanged: (String) -> Unit,
    onSubmitForgotPassword: () -> Unit,
    onSubmitLogin: () -> Unit
) {
    var showPlatformInfoSheet by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.surfaceContainerLow
                    )
                )
            )
            .systemBarsPadding()
            .imePadding(),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 520.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(16.dp))
            Image(
                painter = painterResource(id = R.drawable.hemnity_logo),
                contentDescription = stringResource(R.string.cd_hemnity_logo),
                modifier = Modifier
                    .size(90.dp)
                    .clip(RoundedCornerShape(22.dp)),
                contentScale = ContentScale.Crop
            )
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = "Hemnity Gym Owner",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(4.dp))
            StatusBadge(text = "Gym Owner Console • gym.hemnity.in")

            Spacer(modifier = Modifier.height(22.dp))

            if (!sessionRevokedBanner.isNullOrBlank()) {
                HemnityCard(
                    modifier = Modifier.fillMaxWidth(),
                    highlightAccent = true
                ) {
                    Text(
                        text = sessionRevokedBanner,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.AdminPanelSettings,
                        contentDescription = null,
                        tint = OrangePrimary,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Gym Owner Sign In",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Sign in with your authorized Gym Owner credentials. Member and Super Admin accounts are rejected.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(14.dp))

                Spacer(modifier = Modifier.height(14.dp))

                if (uiState.authMode == LoginAuthMode.EMAIL_PASSWORD) {
                    OutlinedTextField(
                        value = uiState.email,
                        onValueChange = onEmailChanged,
                        label = { Text("Registered Email") },
                        placeholder = { Text("owner@yourgym.in") },
                        leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("email_input")
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = uiState.password,
                        onValueChange = onPasswordChanged,
                        label = { Text("Password") },
                        leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                        trailingIcon = {
                            IconButton(
                                onClick = onTogglePasswordVisibility,
                                modifier = Modifier.testTag("toggle_password_visibility")
                            ) {
                                Icon(
                                    imageVector = if (uiState.passwordVisible) {
                                        Icons.Filled.VisibilityOff
                                    } else {
                                        Icons.Filled.Visibility
                                    },
                                    contentDescription = stringResource(R.string.cd_toggle_password)
                                )
                            }
                        },
                        visualTransformation = if (uiState.passwordVisible) {
                            VisualTransformation.None
                        } else {
                            PasswordVisualTransformation()
                        },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(onDone = { onSubmitLogin() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("password_input")
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(
                            onClick = onOpenForgotPassword,
                            modifier = Modifier.testTag("forgot_password_button")
                        ) {
                            Text("Forgot password?")
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = uiState.bearerTokenInput,
                        onValueChange = onBearerTokenChanged,
                        label = { Text("Personal Bearer Token") },
                        placeholder = { Text("hem_live_...") },
                        leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Ascii,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(onDone = { onSubmitLogin() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("bearer_token_input")
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Paste your Gym Owner token generated in Hemnity Developer API v1. Validated live against /api/v1/owner/dashboard.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                }

                AnimatedVisibility(visible = !uiState.errorMessage.isNullOrBlank()) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.errorContainer
                    ) {
                        Text(
                            text = uiState.errorMessage.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }

                Button(
                    onClick = onSubmitLogin,
                    enabled = !uiState.isSubmitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .testTag("login_button"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                ) {
                    if (uiState.isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.5.dp,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Verifying Owner Role...")
                    } else {
                        Text(
                            text = "Sign In to Gym Console",
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.Shield,
                    contentDescription = null,
                    tint = LocalHemnityColors.current.success,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "HTTPS • Keystore AES-256-GCM • Tenant Isolated",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (uiState.landingInfo != null) {
                Spacer(modifier = Modifier.height(14.dp))
                OutlinedButton(
                    onClick = { showPlatformInfoSheet = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("platform_plans_button")
                ) {
                    Icon(Icons.Filled.HelpOutline, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("View Hemnity SaaS Plans & Support")
                }
            }
        }
    }

    if (uiState.isForgotDialogOpen) {
        AlertDialog(
            onDismissRequest = onCloseForgotPassword,
            title = { Text("Reset Owner Password") },
            text = {
                Column {
                    Text(
                        text = "Enter your registered Gym Owner email address.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = uiState.forgotEmail,
                        onValueChange = onForgotEmailChanged,
                        label = { Text("Email Address") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (!uiState.forgotStatusMessage.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = uiState.forgotStatusMessage,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = onSubmitForgotPassword,
                    enabled = !uiState.isForgotSubmitting
                ) {
                    Text(if (uiState.isForgotSubmitting) "Sending..." else "Send Reset")
                }
            },
            dismissButton = {
                TextButton(onClick = onCloseForgotPassword) {
                    Text("Close")
                }
            }
        )
    }

    if (showPlatformInfoSheet && uiState.landingInfo != null) {
        ModalBottomSheet(onDismissRequest = { showPlatformInfoSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 8.dp)
            ) {
                Text(
                    text = uiState.landingInfo.softwareName,
                    style = MaterialTheme.typography.titleLarge
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = uiState.landingInfo.heroSubtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Hemnity SaaS Plans (from /api/v1/public/landing)",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                uiState.landingInfo.plans.forEach { plan ->
                    HemnityCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 10.dp),
                        highlightAccent = plan.isFeatured
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(plan.planName, style = MaterialTheme.typography.titleMedium)
                            StatusBadge(text = "Up to ${plan.maxMembers} members")
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "₹${plan.monthlyPrice}/mo • Yearly ₹${plan.yearlyPrice}",
                            style = MaterialTheme.typography.titleSmall.copy(fontFamily = JetBrainsMonoFamily),
                            color = OrangeAccent
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = plan.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Support: ${uiState.landingInfo.supportEmail} • ${uiState.landingInfo.supportPhone}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
