package com.example.data.repository

import android.os.Build
import com.example.core.network.ApiErrorMapper
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.core.network.SessionCookieJar
import com.example.core.network.SessionEvent
import com.example.core.network.SessionEventBus
import com.example.core.security.RoleGuard
import com.example.core.security.SessionTokens
import com.example.core.security.TokenStorage
import com.example.data.remote.ForgotPasswordRequestDto
import com.example.data.remote.HemnityApiService
import com.example.data.remote.LoginRequestDto
import com.example.data.remote.LogoutRequestDto
import com.example.data.remote.RefreshTokenRequestDto
import com.squareup.moshi.Moshi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

sealed interface SessionValidationResult {
    data class ValidMember(val session: SessionTokens) : SessionValidationResult
    data class InvalidOrExpired(val message: String? = null) : SessionValidationResult
    data class NetworkOfflineWithNoSession(val message: String) : SessionValidationResult
}

class AuthRepository(
    private val apiService: HemnityApiService,
    private val tokenStorage: TokenStorage,
    private val cookieJar: SessionCookieJar,
    private val sessionEventBus: SessionEventBus,
    private val moshi: Moshi,
) {

    suspend fun validateSavedSession(): SessionValidationResult = withContext(Dispatchers.IO) {
        tokenStorage.initialize()
        val saved = tokenStorage.currentSession()
            ?: return@withContext SessionValidationResult.InvalidOrExpired()

        if (!RoleGuard.isAllowedMemberRole(saved.role)) {
            tokenStorage.clearSession()
            cookieJar.clear()
            return@withContext SessionValidationResult.InvalidOrExpired(
                RoleGuard.rejectionMessageFor(saved.role)
            )
        }

        // Validate saved session with backend (/auth/me -> fallback /auth/refresh)
        val meResult = runCatching { apiService.getCurrentSession() }
        meResult.fold(
            onSuccess = { me ->
                val serverRole = me.resolvedRole() ?: saved.role
                if (!RoleGuard.isAllowedMemberRole(serverRole)) {
                    tokenStorage.clearSession()
                    cookieJar.clear()
                    return@withContext SessionValidationResult.InvalidOrExpired(
                        RoleGuard.rejectionMessageFor(serverRole)
                    )
                }
                val user = me.resolvedUser()
                val updated = saved.copy(
                    role = RoleGuard.normalizeRole(serverRole),
                    memberId = user?.memberId ?: user?.id ?: saved.memberId,
                    memberName = user?.fullName ?: user?.name ?: saved.memberName,
                    memberEmail = user?.email ?: saved.memberEmail,
                    selectedGymId = me.selectedGymId ?: saved.selectedGymId ?: user?.defaultGymId ?: user?.gymId,
                )
                tokenStorage.saveSession(updated)
                SessionValidationResult.ValidMember(updated)
            },
            onFailure = { throwable ->
                val mapped = ApiErrorMapper.mapThrowable(throwable, moshi)
                if (mapped is AppError.Unauthorized && !saved.refreshToken.isNullOrBlank()) {
                    // Attempt explicit refresh
                    val refreshAttempt = runCatching {
                        apiService.refreshToken(RefreshTokenRequestDto(saved.refreshToken))
                    }
                    refreshAttempt.fold(
                        onSuccess = { refreshed ->
                            val newToken = refreshed.resolvedToken()
                            val role = refreshed.resolvedRole() ?: saved.role
                            if (newToken.isNullOrBlank() || !RoleGuard.isAllowedMemberRole(role)) {
                                tokenStorage.clearSession()
                                cookieJar.clear()
                                SessionValidationResult.InvalidOrExpired()
                            } else {
                                val rotated = saved.copy(
                                    accessToken = newToken,
                                    refreshToken = refreshed.resolvedRefreshToken() ?: saved.refreshToken,
                                    expiresAtEpochSec = refreshed.resolvedExpiresAtEpochSec() ?: saved.expiresAtEpochSec,
                                    role = RoleGuard.normalizeRole(role),
                                )
                                tokenStorage.saveSession(rotated)
                                SessionValidationResult.ValidMember(rotated)
                            }
                        },
                        onFailure = {
                            tokenStorage.clearSession()
                            cookieJar.clear()
                            SessionValidationResult.InvalidOrExpired()
                        },
                    )
                } else if (mapped is AppError.Unauthorized || mapped is AppError.ForbiddenRole) {
                    tokenStorage.clearSession()
                    cookieJar.clear()
                    SessionValidationResult.InvalidOrExpired(mapped.message)
                } else {
                    // For transient offline errors when we already have an encrypted member token,
                    // allow entering dashboard so user sees clear offline retry state rather than losing session.
                    if (mapped is AppError.Network) {
                        SessionValidationResult.ValidMember(saved)
                    } else {
                        tokenStorage.clearSession()
                        cookieJar.clear()
                        SessionValidationResult.InvalidOrExpired(mapped.message)
                    }
                }
            },
        )
    }

    suspend fun login(
        identifier: String,
        password: String,
    ): NetworkResult<SessionTokens> = withContext(Dispatchers.IO) {
        val trimmed = identifier.trim()
        val isEmail = trimmed.contains("@")
        val request = LoginRequestDto(
            email = if (isEmail) trimmed else trimmed,
            phone = if (!isEmail) trimmed else null,
            identifier = trimmed,
            password = password,
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            platform = "android",
        )

        val result = runCatching { apiService.login(request) }
        result.fold(
            onSuccess = { response ->
                val serverRole = response.resolvedRole()
                if (!RoleGuard.isAllowedMemberRole(serverRole)) {
                    tokenStorage.clearSession()
                    cookieJar.clear()
                    val msg = RoleGuard.rejectionMessageFor(serverRole)
                    sessionEventBus.emit(SessionEvent.PrivilegedRoleBlocked(msg))
                    return@withContext NetworkResult.Failure(AppError.ForbiddenRole(msg))
                }

                val token = response.resolvedToken()
                if (token.isNullOrBlank()) {
                    return@withContext NetworkResult.Failure(
                        AppError.Server(500, "Authentication succeeded but no session token was issued by the server.")
                    )
                }

                val user = response.resolvedUser()
                val session = SessionTokens(
                    accessToken = token,
                    refreshToken = response.resolvedRefreshToken(),
                    expiresAtEpochSec = response.resolvedExpiresAtEpochSec(),
                    role = RoleGuard.normalizeRole(serverRole),
                    memberId = user?.memberId ?: user?.id,
                    memberName = user?.fullName ?: user?.name,
                    memberEmail = user?.email ?: if (isEmail) trimmed else null,
                    selectedGymId = user?.defaultGymId ?: user?.gymId,
                )
                tokenStorage.saveSession(session)
                NetworkResult.Success(session)
            },
            onFailure = { throwable ->
                NetworkResult.Failure(ApiErrorMapper.mapThrowable(throwable, moshi))
            },
        )
    }

    suspend fun requestPasswordReset(identifier: String): NetworkResult<String> = withContext(Dispatchers.IO) {
        val trimmed = identifier.trim()
        val req = ForgotPasswordRequestDto(
            identifier = trimmed,
            email = if (trimmed.contains("@")) trimmed else null,
        )
        runCatching { apiService.forgotPassword(req) }.fold(
            onSuccess = { resp ->
                NetworkResult.Success(
                    resp.message ?: "If an account matches $trimmed, password reset instructions have been sent."
                )
            },
            onFailure = { throwable ->
                NetworkResult.Failure(ApiErrorMapper.mapThrowable(throwable, moshi))
            },
        )
    }

    suspend fun logout(pushToken: String? = null) = withContext(Dispatchers.IO) {
        val session = tokenStorage.currentSession()
        if (!pushToken.isNullOrBlank()) {
            runCatching { apiService.revokeDeviceToken(pushToken) }
        }
        runCatching {
            apiService.logout(LogoutRequestDto(refreshToken = session?.refreshToken))
        }
        tokenStorage.clearSession()
        cookieJar.clear()
    }
}
