package com.example.ui.membership

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.data.repository.MemberRepository
import com.example.domain.model.MembershipDetails
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface MembershipUiState {
    data object Loading : MembershipUiState
    data class Success(val details: MembershipDetails) : MembershipUiState
    data class Error(val error: AppError) : MembershipUiState
}

class MembershipViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<MembershipUiState>(MembershipUiState.Loading)
    val uiState: StateFlow<MembershipUiState> = _uiState.asStateFlow()

    private val _renewalActionMessage = MutableStateFlow<String?>(null)
    val renewalActionMessage: StateFlow<String?> = _renewalActionMessage.asStateFlow()

    private val _checkoutUrl = MutableStateFlow<String?>(null)
    val checkoutUrl: StateFlow<String?> = _checkoutUrl.asStateFlow()

    fun loadMembership() {
        viewModelScope.launch {
            _uiState.value = MembershipUiState.Loading
            when (val res = memberRepository.getMembershipDetails()) {
                is NetworkResult.Success -> _uiState.value = MembershipUiState.Success(res.data)
                is NetworkResult.Failure -> _uiState.value = MembershipUiState.Error(res.error)
            }
        }
    }

    fun requestRenewal(membershipId: String) {
        viewModelScope.launch {
            when (val res = memberRepository.requestMembershipRenewal(membershipId)) {
                is NetworkResult.Success -> {
                    val url = res.data.checkoutUrl
                    if (!url.isNullOrBlank()) {
                        _checkoutUrl.value = url
                    } else {
                        _renewalActionMessage.value = res.data.message ?: "Renewal request submitted."
                    }
                    loadMembership()
                }
                is NetworkResult.Failure -> {
                    _renewalActionMessage.value = res.error.message
                }
            }
        }
    }

    fun clearActionMessage() {
        _renewalActionMessage.value = null
    }

    fun consumeCheckoutUrl() {
        _checkoutUrl.value = null
    }
}
