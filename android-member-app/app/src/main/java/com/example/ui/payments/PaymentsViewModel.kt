package com.example.ui.payments

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.core.util.ExportHelper
import com.example.data.repository.MemberRepository
import com.example.domain.model.PaymentsOverview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PaymentsUiState {
    data object Loading : PaymentsUiState
    data class Success(val overview: PaymentsOverview) : PaymentsUiState
    data class Error(val error: AppError) : PaymentsUiState
}

class PaymentsViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<PaymentsUiState>(PaymentsUiState.Loading)
    val uiState: StateFlow<PaymentsUiState> = _uiState.asStateFlow()

    private val _actionFeedback = MutableStateFlow<String?>(null)
    val actionFeedback: StateFlow<String?> = _actionFeedback.asStateFlow()

    private val _pendingCheckoutUrl = MutableStateFlow<String?>(null)
    val pendingCheckoutUrl: StateFlow<String?> = _pendingCheckoutUrl.asStateFlow()

    private var pendingPaymentIdForVerification: String? = null

    fun loadPayments(page: Int = 1) {
        viewModelScope.launch {
            _uiState.value = PaymentsUiState.Loading
            when (val res = memberRepository.getPayments(page)) {
                is NetworkResult.Success -> _uiState.value = PaymentsUiState.Success(res.data)
                is NetworkResult.Failure -> _uiState.value = PaymentsUiState.Error(res.error)
            }
        }
    }

    fun initiateOnlinePayment(paymentId: String? = null) {
        viewModelScope.launch {
            when (val res = memberRepository.initiateOnlinePayment(paymentId = paymentId)) {
                is NetworkResult.Success -> {
                    pendingPaymentIdForVerification = res.data.paymentId ?: paymentId
                    val url = res.data.checkoutUrl
                    if (!url.isNullOrBlank()) {
                        _pendingCheckoutUrl.value = url
                    } else {
                        _actionFeedback.value = res.data.message ?: "Payment session created."
                    }
                }
                is NetworkResult.Failure -> {
                    _actionFeedback.value = res.error.message
                }
            }
        }
    }

    fun verifyReturnedPayment() {
        val pid = pendingPaymentIdForVerification ?: return
        pendingPaymentIdForVerification = null
        viewModelScope.launch {
            when (val res = memberRepository.verifyServerPaymentStatus(pid)) {
                is NetworkResult.Success -> {
                    val status = res.data.status ?: if (res.data.verified == true) "Paid" else "Pending"
                    _actionFeedback.value = res.data.message ?: "Server-verified payment status: $status"
                    loadPayments()
                }
                is NetworkResult.Failure -> {
                    _actionFeedback.value = res.error.message
                }
            }
        }
    }

    fun downloadReceipt(context: Context, paymentId: String, receiptNumber: String) {
        viewModelScope.launch {
            when (val res = memberRepository.downloadReceiptBytes(paymentId)) {
                is NetworkResult.Success -> {
                    val openResult = ExportHelper.saveAndSharePdf(
                        context = context,
                        bytes = res.data,
                        fileName = "receipt_${receiptNumber.ifBlank { paymentId }}.pdf",
                    )
                    openResult.onFailure {
                        _actionFeedback.value = "Receipt saved, but no PDF viewer app was found on this device."
                    }
                }
                is NetworkResult.Failure -> {
                    _actionFeedback.value = res.error.message
                }
            }
        }
    }

    fun consumeCheckoutUrl() {
        _pendingCheckoutUrl.value = null
    }

    fun clearFeedback() {
        _actionFeedback.value = null
    }
}
