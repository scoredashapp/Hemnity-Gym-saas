package com.example.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.NetworkResult
import com.example.data.repository.AuthRepository
import com.example.data.repository.SessionValidationResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface SplashDestination {
    data object Loading : SplashDestination
    data object AuthenticatedMember : SplashDestination
    data object RequiresLogin : SplashDestination
}

data class LoginUiState(
    val identifier: String = "",
    val password: String = "",
    val passwordVisible: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val forgotSheetOpen: Boolean = false,
    val forgotIdentifier: String = "",
    val forgotLoading: Boolean = false,
    val forgotFeedback: String? = null,
    val forgotError: String? = null,
)

class AuthViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _splashState = MutableStateFlow<SplashDestination>(SplashDestination.Loading)
    val splashState: StateFlow<SplashDestination> = _splashState.asStateFlow()

    private val _loginState = MutableStateFlow(LoginUiState())
    val loginState: StateFlow<LoginUiState> = _loginState.asStateFlow()

    private val _loginSuccessEvent = MutableStateFlow(false)
    val loginSuccessEvent: StateFlow<Boolean> = _loginSuccessEvent.asStateFlow()

    fun checkSavedSession() {
        viewModelScope.launch {
            _splashState.value = SplashDestination.Loading
            delay(950)
            when (val result = authRepository.validateSavedSession()) {
                is SessionValidationResult.ValidMember -> {
                    _splashState.value = SplashDestination.AuthenticatedMember
                }
                is SessionValidationResult.InvalidOrExpired -> {
                    if (!result.message.isNullOrBlank()) {
                        _loginState.update { it.copy(errorMessage = result.message) }
                    }
                    _splashState.value = SplashDestination.RequiresLogin
                }
                is SessionValidationResult.NetworkOfflineWithNoSession -> {
                    _loginState.update { it.copy(errorMessage = result.message) }
                    _splashState.value = SplashDestination.RequiresLogin
                }
            }
        }
    }

    fun onIdentifierChanged(value: String) {
        _loginState.update { it.copy(identifier = value, errorMessage = null) }
    }

    fun onPasswordChanged(value: String) {
        _loginState.update { it.copy(password = value, errorMessage = null) }
    }

    fun togglePasswordVisibility() {
        _loginState.update { it.copy(passwordVisible = !it.passwordVisible) }
    }

    fun submitLogin() {
        val current = _loginState.value
        val id = current.identifier.trim()
        val pw = current.password
        if (id.isEmpty() || pw.isEmpty()) {
            _loginState.update {
                it.copy(errorMessage = "Please enter your registered email or mobile number and password.")
            }
            return
        }

        viewModelScope.launch {
            _loginState.update { it.copy(isLoading = true, errorMessage = null) }
            when (val result = authRepository.login(id, pw)) {
                is NetworkResult.Success -> {
                    _loginState.update { it.copy(isLoading = false, password = "") }
                    _loginSuccessEvent.value = true
                }
                is NetworkResult.Failure -> {
                    _loginState.update {
                        it.copy(isLoading = false, errorMessage = result.error.message)
                    }
                }
            }
        }
    }

    fun consumeLoginSuccess() {
        _loginSuccessEvent.value = false
    }

    fun setExternalSessionMessage(message: String) {
        _loginState.update { it.copy(errorMessage = message) }
    }

    fun openForgotPassword() {
        _loginState.update {
            it.copy(
                forgotSheetOpen = true,
                forgotIdentifier = it.identifier,
                forgotFeedback = null,
                forgotError = null,
            )
        }
    }

    fun closeForgotPassword() {
        _loginState.update { it.copy(forgotSheetOpen = false) }
    }

    fun onForgotIdentifierChanged(value: String) {
        _loginState.update { it.copy(forgotIdentifier = value, forgotError = null, forgotFeedback = null) }
    }

    fun submitForgotPassword() {
        val target = _loginState.value.forgotIdentifier.trim()
        if (target.isEmpty()) {
            _loginState.update { it.copy(forgotError = "Enter your registered email or mobile number.") }
            return
        }
        viewModelScope.launch {
            _loginState.update { it.copy(forgotLoading = true, forgotError = null, forgotFeedback = null) }
            when (val res = authRepository.requestPasswordReset(target)) {
                is NetworkResult.Success -> {
                    _loginState.update { it.copy(forgotLoading = false, forgotFeedback = res.data) }
                }
                is NetworkResult.Failure -> {
                    _loginState.update { it.copy(forgotLoading = false, forgotError = res.error.message) }
                }
            }
        }
    }
}
