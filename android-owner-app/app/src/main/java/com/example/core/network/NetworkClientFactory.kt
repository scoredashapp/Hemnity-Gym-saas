package com.example.core.network

import com.example.BuildConfig
import com.example.core.security.SecureTokenStorage
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

object SessionEventBus {
    private val _sessionRevoked = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val sessionRevoked: SharedFlow<String> = _sessionRevoked.asSharedFlow()

    fun notifyRevoked(reason: String) {
        _sessionRevoked.tryEmit(reason)
    }
}

class SessionCookieJar(
    private val tokenStorage: SecureTokenStorage
) : CookieJar {
    private val cookieStore = ConcurrentHashMap<String, List<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (!url.isHttps) return
        val sessionCookies = cookies.filter { it.name.equals("HEMNITY_GYM_SESSID", ignoreCase = true) }
        if (sessionCookies.isNotEmpty()) {
            cookieStore[url.host] = cookies
            val sessValue = sessionCookies.firstOrNull()?.value.orEmpty()
            val current = tokenStorage.getSession()
            if (current != null && sessValue.isNotBlank() && current.sessionCookie != sessValue) {
                tokenStorage.saveSession(current.copy(sessionCookie = sessValue))
            }
        } else if (cookies.isNotEmpty()) {
            cookieStore[url.host] = cookies
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        if (!url.isHttps) return emptyList()
        val stored = cookieStore[url.host].orEmpty().toMutableList()
        val persistedSessId = tokenStorage.getSession()?.sessionCookie.orEmpty()
        if (persistedSessId.isNotBlank() && stored.none { it.name == "HEMNITY_GYM_SESSID" }) {
            stored.add(
                Cookie.Builder()
                    .domain(url.host)
                    .path("/")
                    .name("HEMNITY_GYM_SESSID")
                    .value(persistedSessId)
                    .secure()
                    .httpOnly()
                    .build()
            )
        }
        return stored
    }

    fun clear() {
        cookieStore.clear()
    }
}

class HttpsOnlyAndAuthInterceptor(
    private val tokenStorage: SecureTokenStorage
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        require(original.url.isHttps) {
            "Insecure HTTP blocked. Only HTTPS requests to gym.hemnity.in are allowed."
        }

        val session = tokenStorage.getSession()
        val builder = original.newBuilder()
            .header("Accept", "application/json")
            .header("X-Client-Platform", "android")
            .header("X-App-Version", BuildConfig.VERSION_NAME)

        val token = session?.token.orEmpty()
        val path = original.url.encodedPath
        val isPublicEndpoint = path.endsWith("/auth/login") ||
            path.endsWith("/auth/forgot-password") ||
            path.endsWith("/public/landing")

        if (token.isNotBlank() && !isPublicEndpoint) {
            builder.header("Authorization", "Bearer $token")
        }

        val response = chain.proceed(builder.build())
        if (response.code == 401 && !isPublicEndpoint && session?.hasCredential == true) {
            tokenStorage.clearSession()
            SessionEventBus.notifyRevoked("Your session expired or was revoked. Please sign in again.")
        }
        return response
    }
}

object NetworkClientFactory {
    fun createApiService(
        tokenStorage: SecureTokenStorage,
        cookieJar: SessionCookieJar,
        baseUrl: String = BuildConfig.API_BASE_URL
    ): HemnityApiService {
        val okHttp = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .cookieJar(cookieJar)
            .addInterceptor(HttpsOnlyAndAuthInterceptor(tokenStorage))
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttp)
            .build()
            .create(HemnityApiService::class.java)
    }
}
