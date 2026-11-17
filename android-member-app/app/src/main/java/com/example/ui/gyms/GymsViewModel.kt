package com.example.ui.gyms

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.data.repository.MemberRepository
import com.example.domain.model.GymMembershipSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface GymsUiState {
    data object Loading : GymsUiState
    data class Success(val gyms: List<GymMembershipSummary>) : GymsUiState
    data class Error(val error: AppError) : GymsUiState
}

class GymsViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<GymsUiState>(GymsUiState.Loading)
    val uiState: StateFlow<GymsUiState> = _uiState.asStateFlow()

    fun loadGyms() {
        viewModelScope.launch {
            _uiState.value = GymsUiState.Loading
            when (val result = memberRepository.getMyGyms()) {
                is NetworkResult.Success -> _uiState.value = GymsUiState.Success(result.data)
                is NetworkResult.Failure -> _uiState.value = GymsUiState.Error(result.error)
            }
        }
    }

    fun selectGym(gymId: String, onSwitched: () -> Unit) {
        viewModelScope.launch {
            memberRepository.switchActiveGym(gymId)
            onSwitched()
        }
    }
}
