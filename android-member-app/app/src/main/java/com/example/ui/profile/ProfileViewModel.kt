package com.example.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.data.repository.AuthRepository
import com.example.data.repository.MemberRepository
import com.example.data.repository.PreferencesRepository
import com.example.domain.model.MemberProfile
import com.example.domain.model.NotificationPreferences
import com.example.domain.model.PlatformInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ProfileUiState {
    data object Loading : ProfileUiState
    data class Success(val profile: MemberProfile) : ProfileUiState
    data class Error(val error: AppError) : ProfileUiState
}

class ProfileViewModel(
    private val memberRepository: MemberRepository,
    private val authRepository: AuthRepository,
    private val preferencesRepository: PreferencesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    private val _feedbackMessage = MutableStateFlow<String?>(null)
    val feedbackMessage: StateFlow<String?> = _feedbackMessage.asStateFlow()

    private val _loggedOut = MutableStateFlow(false)
    val loggedOut: StateFlow<Boolean> = _loggedOut.asStateFlow()

    private val _platformInfo = MutableStateFlow<PlatformInfo?>(null)
    val platformInfo: StateFlow<PlatformInfo?> = _platformInfo.asStateFlow()

    fun loadProfile() {
        viewModelScope.launch {
            launch {
                val landing = memberRepository.getPlatformInfo()
                if (landing is NetworkResult.Success) {
                    _platformInfo.value = landing.data
                }
            }
            _uiState.value = ProfileUiState.Loading
            when (val res = memberRepository.getProfile()) {
                is NetworkResult.Success -> {
                    preferencesRepository.saveNotificationPreferences(res.data.notificationPreferences)
                    _uiState.value = ProfileUiState.Success(res.data)
                }
                is NetworkResult.Failure -> _uiState.value = ProfileUiState.Error(res.error)
            }
        }
    }

    fun updateProfile(
        fullName: String?,
        phone: String?,
        emergencyName: String?,
        emergencyPhone: String?,
        emergencyRelation: String?,
    ) {
        viewModelScope.launch {
            when (
                val res = memberRepository.updateProfile(
                    fullName = fullName,
                    phone = phone,
                    emergencyName = emergencyName,
                    emergencyPhone = emergencyPhone,
                    emergencyRelation = emergencyRelation,
                )
            ) {
                is NetworkResult.Success -> {
                    _uiState.value = ProfileUiState.Success(res.data)
                    _feedbackMessage.value = "Profile updated successfully."
                }
                is NetworkResult.Failure -> {
                    _feedbackMessage.value = res.error.message
                }
            }
        }
    }

    fun changePassword(current: String, newPw: String, confirm: String) {
        if (newPw.length < 6) {
            _feedbackMessage.value = "New password must be at least 6 characters."
            return
        }
        if (newPw != confirm) {
            _feedbackMessage.value = "New password and confirmation do not match."
            return
        }
        viewModelScope.launch {
            when (val res = memberRepository.changePassword(current, newPw, confirm)) {
                is NetworkResult.Success -> _feedbackMessage.value = res.data
                is NetworkResult.Failure -> _feedbackMessage.value = res.error.message
            }
        }
    }

    fun updateNotificationPreferences(prefs: NotificationPreferences) {
        viewModelScope.launch {
            preferencesRepository.saveNotificationPreferences(prefs)
            val current = (_uiState.value as? ProfileUiState.Success)?.profile
            if (current != null) {
                _uiState.value = ProfileUiState.Success(current.copy(notificationPreferences = prefs))
            }
            when (val res = memberRepository.updateNotificationPreferences(prefs)) {
                is NetworkResult.Success -> {
                    preferencesRepository.saveNotificationPreferences(res.data)
                    _feedbackMessage.value = "Notification preferences saved."
                }
                is NetworkResult.Failure -> {
                    _feedbackMessage.value = res.error.message
                }
            }
        }
    }

    fun registerDevicePushToken(token: String) {
        viewModelScope.launch {
            preferencesRepository.saveDevicePushToken(token)
            memberRepository.registerDeviceToken(token)
        }
    }

    fun logout() {
        viewModelScope.launch {
            val token = preferencesRepository.getDevicePushToken()
            authRepository.logout(token)
            preferencesRepository.clearDevicePushToken()
            _loggedOut.value = true
        }
    }

    fun consumeLoggedOut() {
        _loggedOut.value = false
    }

    fun clearFeedback() {
        _feedbackMessage.value = null
    }
}
