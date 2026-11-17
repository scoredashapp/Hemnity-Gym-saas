package com.example.di

import android.content.Context
import com.example.core.network.HemnityApiService
import com.example.core.network.NetworkClientFactory
import com.example.core.network.SessionCookieJar
import com.example.core.security.KeystoreSecureTokenStorage
import com.example.core.security.SecureTokenStorage
import com.example.core.security.ThemePreferenceStorage
import com.example.data.repository.AuthRepository
import com.example.data.repository.OwnerRepository

class AppContainer(context: Context) {
    val tokenStorage: SecureTokenStorage = KeystoreSecureTokenStorage(context)
    val themePreferences: ThemePreferenceStorage = ThemePreferenceStorage(context)
    val cookieJar: SessionCookieJar = SessionCookieJar(tokenStorage)
    val apiService: HemnityApiService = NetworkClientFactory.createApiService(tokenStorage, cookieJar)

    val authRepository = AuthRepository(apiService, tokenStorage, cookieJar)
    val ownerRepository = OwnerRepository(apiService)
}
