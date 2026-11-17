package com.example.core.network

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed interface SessionEvent {
    data class SessionExpired(val reason: String) : SessionEvent
    data class PrivilegedRoleBlocked(val message: String) : SessionEvent
}

class SessionEventBus {
    private val _events = MutableSharedFlow<SessionEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<SessionEvent> = _events.asSharedFlow()

    fun emit(event: SessionEvent) {
        _events.tryEmit(event)
    }
}
