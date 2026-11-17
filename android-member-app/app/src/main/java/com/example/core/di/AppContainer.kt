package com.example.core.di

import android.content.Context
import com.example.BuildConfig
import com.example.core.network.AuthInterceptor
import com.example.core.network.FlexStringAdapter
import com.example.core.network.SessionCookieJar
import com.example.core.network.SessionEventBus
import com.example.core.network.TokenRefreshAuthenticator
import com.example.core.security.AndroidKeystoreTokenStorage
import com.example.core.security.TokenStorage
import com.example.data.remote.HemnityApiService
import com.example.data.repository.AuthRepository
import com.example.data.repository.MemberRepository
import com.example.data.repository.PreferencesRepository
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val moshi: Moshi = Moshi.Builder()
        .add(FlexStringAdapter())
        .addLast(KotlinJsonAdapterFactory())
        .build()

    val sessionEventBus = SessionEventBus()
    val cookieJar = SessionCookieJar()

    val tokenStorage: TokenStorage = AndroidKeystoreTokenStorage(
        context = appContext,
        moshi = moshi,
    )

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        redactHeader("Authorization")
        redactHeader("Cookie")
        redactHeader("Set-Cookie")
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .addInterceptor(AuthInterceptor(tokenStorage))
        .authenticator(
            TokenRefreshAuthenticator(
                baseUrl = BuildConfig.API_BASE_URL,
                tokenStorage = tokenStorage,
                moshi = moshi,
                sessionEventBus = sessionEventBus,
                cookieJar = cookieJar,
            )
        )
        .addInterceptor(loggingInterceptor)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    val apiService: HemnityApiService = retrofit.create(HemnityApiService::class.java)

    val authRepository = AuthRepository(
        apiService = apiService,
        tokenStorage = tokenStorage,
        cookieJar = cookieJar,
        sessionEventBus = sessionEventBus,
        moshi = moshi,
    )

    val memberRepository = MemberRepository(
        apiService = apiService,
        tokenStorage = tokenStorage,
        moshi = moshi,
    )

    val preferencesRepository = PreferencesRepository(appContext)
}
