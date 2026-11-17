package com.example.ui.attendance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.core.util.DateUtils
import com.example.data.repository.MemberRepository
import com.example.domain.model.AttendanceMonthSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AttendanceUiState {
    data object Loading : AttendanceUiState
    data class Success(val summary: AttendanceMonthSummary) : AttendanceUiState
    data class Error(val error: AppError) : AttendanceUiState
}

class AttendanceViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _selectedMonthKey = MutableStateFlow(DateUtils.currentMonthKey())
    val selectedMonthKey: StateFlow<String> = _selectedMonthKey.asStateFlow()

    private val _uiState = MutableStateFlow<AttendanceUiState>(AttendanceUiState.Loading)
    val uiState: StateFlow<AttendanceUiState> = _uiState.asStateFlow()

    fun loadAttendance(monthKey: String = _selectedMonthKey.value) {
        _selectedMonthKey.value = monthKey
        viewModelScope.launch {
            _uiState.value = AttendanceUiState.Loading
            when (val res = memberRepository.getAttendance(monthKey)) {
                is NetworkResult.Success -> _uiState.value = AttendanceUiState.Success(res.data)
                is NetworkResult.Failure -> _uiState.value = AttendanceUiState.Error(res.error)
            }
        }
    }

    fun previousMonth() {
        loadAttendance(DateUtils.shiftMonthKey(_selectedMonthKey.value, -1))
    }

    fun nextMonth() {
        loadAttendance(DateUtils.shiftMonthKey(_selectedMonthKey.value, 1))
    }
}
