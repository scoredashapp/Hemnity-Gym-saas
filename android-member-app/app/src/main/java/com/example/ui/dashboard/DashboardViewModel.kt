package com.example.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.data.repository.MemberRepository
import com.example.domain.model.DashboardSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface DashboardUiState {
    data object Loading : DashboardUiState
    data class Success(val data: DashboardSummary) : DashboardUiState
    data class Error(val error: AppError) : DashboardUiState
}

class DashboardViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = DashboardUiState.Loading
            when (val result = memberRepository.getDashboard()) {
                is NetworkResult.Success -> _uiState.value = DashboardUiState.Success(result.data)
                is NetworkResult.Failure -> _uiState.value = DashboardUiState.Error(result.error)
            }
        }
    }
}
