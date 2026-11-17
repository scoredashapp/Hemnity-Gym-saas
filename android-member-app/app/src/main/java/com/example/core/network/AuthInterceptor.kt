package com.example.core.network

import com.example.BuildConfig
import com.example.core.security.TokenStorage
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val tokenStorage: TokenStorage,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val session = tokenStorage.currentSession()
        val builder = original.newBuilder()
            .header("Accept", "application/json")
            .header("X-Client-Platform", "android")
            .header("X-App-Package", BuildConfig.APPLICATION_ID)
            .header("X-App-Version", BuildConfig.VERSION_NAME)

        val isAuthRoute = original.url.encodedPath.endsWith("/auth/login") ||
            original.url.encodedPath.endsWith("/auth/refresh") ||
            original.url.encodedPath.endsWith("/auth/forgot-password")

        if (!isAuthRoute && session != null && session.accessToken.isNotBlank()) {
            builder.header("Authorization", "Bearer ${session.accessToken}")
            session.selectedGymId?.takeIf { it.isNotBlank() }?.let { gymId ->
                builder.header("X-Gym-Id", gymId)
            }
        }

        return chain.proceed(builder.build())
    }
}
