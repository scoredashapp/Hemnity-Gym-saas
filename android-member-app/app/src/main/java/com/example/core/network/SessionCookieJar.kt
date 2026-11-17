package com.example.core.network

import java.util.concurrent.ConcurrentHashMap
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Memory-only CookieJar for PHP session affinity (HEMNITY_GYM_SESSID) alongside Bearer JWT tokens.
 * Cleared immediately on logout or session expiry.
 */
class SessionCookieJar : CookieJar {
    private val cookieStore = ConcurrentHashMap<String, MutableList<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val host = url.host
        val existing = cookieStore.getOrPut(host) { mutableListOf() }
        synchronized(existing) {
            for (cookie in cookies) {
                existing.removeAll { it.name == cookie.name && it.path == cookie.path }
                if (cookie.expiresAt > System.currentTimeMillis()) {
                    existing.add(cookie)
                }
            }
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        val list = cookieStore[url.host] ?: return emptyList()
        synchronized(list) {
            list.removeAll { it.expiresAt <= now }
            return list.filter { it.matches(url) }
        }
    }

    fun clear() {
        cookieStore.clear()
    }
}
