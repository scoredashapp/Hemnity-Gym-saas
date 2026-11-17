package com.example.ui.idcard

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.core.util.QrBitmapGenerator
import com.example.data.repository.MemberRepository
import com.example.domain.model.DigitalIdCard
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface IdCardUiState {
    data object Loading : IdCardUiState
    data class Success(val card: DigitalIdCard, val qrBitmap: Bitmap?) : IdCardUiState
    data class Error(val error: AppError) : IdCardUiState
}

class IdCardViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<IdCardUiState>(IdCardUiState.Loading)
    val uiState: StateFlow<IdCardUiState> = _uiState.asStateFlow()

    fun loadIdCard() {
        viewModelScope.launch {
            _uiState.value = IdCardUiState.Loading
            when (val res = memberRepository.getDigitalIdCard()) {
                is NetworkResult.Success -> {
                    val payload = res.data.qrPayload
                    val qrBmp = if (!payload.isNullOrBlank()) {
                        withContext(Dispatchers.Default) {
                            QrBitmapGenerator.generate(payload, sizePx = 640)
                        }
                    } else {
                        null
                    }
                    _uiState.value = IdCardUiState.Success(res.data, qrBmp)
                }
                is NetworkResult.Failure -> _uiState.value = IdCardUiState.Error(res.error)
            }
        }
    }
}
