package com.example.core.security

import com.squareup.moshi.JsonClass
import kotlinx.coroutines.flow.StateFlow

@JsonClass(generateAdapter = true)
data class SessionTokens(
    val accessToken: String,
    val refreshToken: String? = null,
    val expiresAtEpochSec: Long? = null,
    val role: String,
    val memberId: String? = null,
    val memberName: String? = null,
    val memberEmail: String? = null,
    val selectedGymId: String? = null,
)

interface TokenStorage {
    val sessionFlow: StateFlow<SessionTokens?>

    suspend fun initialize()

    fun currentSession(): SessionTokens?

    suspend fun saveSession(session: SessionTokens)

    suspend fun updateSelectedGymId(gymId: String)

    suspend fun clearSession()
}
