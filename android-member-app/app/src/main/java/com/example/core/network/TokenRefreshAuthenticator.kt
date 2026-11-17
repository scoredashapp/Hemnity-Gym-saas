package com.example.core.network

import com.example.core.security.RoleGuard
import com.example.core.security.SessionTokens
import com.example.core.security.TokenStorage
import com.example.data.remote.LoginResponseDto
import com.example.data.remote.RefreshTokenRequestDto
import com.squareup.moshi.Moshi
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route

class TokenRefreshAuthenticator(
    private val baseUrl: String,
    private val tokenStorage: TokenStorage,
    private val moshi: Moshi,
    private val sessionEventBus: SessionEventBus,
    private val cookieJar: SessionCookieJar,
) : Authenticator {

    private val lock = Any()

    // Dedicated lightweight OkHttpClient without this Authenticator to avoid infinite loops
    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .build()
    }

    override fun authenticate(route: Route?, response: Response): Request? {
        val path = response.request.url.encodedPath
        if (path.endsWith("/auth/login") || path.endsWith("/auth/refresh")) {
            return null
        }

        if (responseCount(response) >= 2) {
            clearAndNotifyExpired()
            return null
        }

        synchronized(lock) {
            val currentSession = tokenStorage.currentSession() ?: return null
            val requestAuth = response.request.header("Authorization")
            val expectedAuth = "Bearer ${currentSession.accessToken}"

            // Another thread already refreshed the token
            if (requestAuth != null && requestAuth != expectedAuth) {
                return response.request.newBuilder()
                    .header("Authorization", expectedAuth)
                    .build()
            }

            val refreshToken = currentSession.refreshToken
            if (refreshToken.isNullOrBlank()) {
                clearAndNotifyExpired()
                return null
            }

            val reqAdapter = moshi.adapter(RefreshTokenRequestDto::class.java)
            val resAdapter = moshi.adapter(LoginResponseDto::class.java)
            val jsonBody = reqAdapter.toJson(RefreshTokenRequestDto(refreshToken = refreshToken))
            val refreshRequest = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/auth/refresh")
                .post(jsonBody.toRequestBody("application/json; charset=utf-8".toMediaType()))
                .header("Accept", "application/json")
                .build()

            val refreshResponse = runCatching {
                refreshClient.newCall(refreshRequest).execute()
            }.getOrNull()

            if (refreshResponse == null || !refreshResponse.isSuccessful) {
                refreshResponse?.close()
                clearAndNotifyExpired()
                return null
            }

            val bodyString = refreshResponse.use { it.body?.string() }
            val parsed = bodyString?.let { runCatching { resAdapter.fromJson(it) }.getOrNull() }
            val newToken = parsed?.resolvedToken()
            val resolvedRole = parsed?.resolvedRole() ?: currentSession.role

            if (newToken.isNullOrBlank() || !RoleGuard.isAllowedMemberRole(resolvedRole)) {
                clearAndNotifyExpired()
                return null
            }

            val rotated = currentSession.copy(
                accessToken = newToken,
                refreshToken = parsed?.resolvedRefreshToken() ?: currentSession.refreshToken,
                expiresAtEpochSec = parsed?.resolvedExpiresAtEpochSec() ?: currentSession.expiresAtEpochSec,
                role = RoleGuard.normalizeRole(resolvedRole),
            )
            runBlocking {
                tokenStorage.saveSession(rotated)
            }

            return response.request.newBuilder()
                .header("Authorization", "Bearer ${rotated.accessToken}")
                .build()
        }
    }

    private fun clearAndNotifyExpired() {
        runBlocking {
            tokenStorage.clearSession()
            cookieJar.clear()
        }
        sessionEventBus.emit(
            SessionEvent.SessionExpired("Your session expired. Please sign in again.")
        )
    }

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result++
            prior = prior.priorResponse
        }
        return result
    }
}
