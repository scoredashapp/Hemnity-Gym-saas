package com.example.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.data.repository.MemberRepository
import com.example.domain.model.NotificationsFeed
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface NotificationsUiState {
    data object Loading : NotificationsUiState
    data class Success(val feed: NotificationsFeed) : NotificationsUiState
    data class Error(val error: AppError) : NotificationsUiState
}

class NotificationsViewModel(
    private val memberRepository: MemberRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<NotificationsUiState>(NotificationsUiState.Loading)
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    fun loadNotifications(page: Int = 1) {
        viewModelScope.launch {
            _uiState.value = NotificationsUiState.Loading
            when (val res = memberRepository.getNotifications(page)) {
                is NetworkResult.Success -> _uiState.value = NotificationsUiState.Success(res.data)
                is NetworkResult.Failure -> _uiState.value = NotificationsUiState.Error(res.error)
            }
        }
    }

    fun markRead(notificationId: String) {
        val current = (_uiState.value as? NotificationsUiState.Success)?.feed ?: return
        viewModelScope.launch {
            memberRepository.markNotificationRead(notificationId)
            val updated = current.items.map {
                if (it.id == notificationId) it.copy(isRead = true) else it
            }
            _uiState.value = NotificationsUiState.Success(
                current.copy(
                    items = updated,
                    unreadCount = updated.count { !it.isRead },
                )
            )
        }
    }

    fun markAllRead() {
        val current = (_uiState.value as? NotificationsUiState.Success)?.feed ?: return
        viewModelScope.launch {
            memberRepository.markAllNotificationsRead()
            val updated = current.items.map { it.copy(isRead = true) }
            _uiState.value = NotificationsUiState.Success(
                current.copy(items = updated, unreadCount = 0)
            )
        }
    }
}
