package com.example.core.network

import org.json.JSONArray
import org.json.JSONObject

object JsonParserHelpers {
    fun parseObjectOrNull(raw: String?): JSONObject? {
        if (raw.isNullOrBlank()) return null
        return runCatching { JSONObject(raw.trim()) }.getOrNull()
    }

    fun parseArrayOrNull(raw: String?): JSONArray? {
        if (raw.isNullOrBlank()) return null
        return runCatching { JSONArray(raw.trim()) }.getOrNull()
    }

    fun extractErrorMessage(rawBody: String?, fallback: String): String {
        val obj = parseObjectOrNull(rawBody) ?: return fallback
        return firstNonBlankString(
            obj,
            "error",
            "message",
            "detail",
            "msg"
        ) ?: fallback
    }

    fun firstNonBlankString(obj: JSONObject?, vararg keys: String): String? {
        if (obj == null) return null
        for (key in keys) {
            if (!obj.has(key) || obj.isNull(key)) continue
            val value = obj.opt(key)
            val str = when (value) {
                is String -> value.trim()
                is Number, is Boolean -> value.toString()
                else -> ""
            }
            if (str.isNotBlank() && !str.equals("null", ignoreCase = true)) {
                return str
            }
        }
        return null
    }

    fun firstBoolean(obj: JSONObject?, vararg keys: String): Boolean? {
        if (obj == null) return null
        for (key in keys) {
            if (!obj.has(key) || obj.isNull(key)) continue
            val raw = obj.opt(key)
            when (raw) {
                is Boolean -> return raw
                is Number -> return raw.toInt() != 0
                is String -> {
                    val v = raw.trim().lowercase()
                    if (v == "1" || v == "true" || v == "yes") return true
                    if (v == "0" || v == "false" || v == "no") return false
                }
            }
        }
        return null
    }

    fun firstObject(obj: JSONObject?, vararg keys: String): JSONObject? {
        if (obj == null) return null
        for (key in keys) {
            val child = obj.optJSONObject(key)
            if (child != null) return child
        }
        return null
    }

    fun firstArray(obj: JSONObject?, vararg keys: String): JSONArray? {
        if (obj == null) return null
        for (key in keys) {
            val arr = obj.optJSONArray(key)
            if (arr != null) return arr
        }
        return null
    }

    fun resolveAbsoluteAssetUrl(rawUrl: String?, baseOrigin: String = "https://gym.hemnity.in"): String? {
        val clean = rawUrl?.trim().orEmpty()
        if (clean.isBlank()) return null
        return when {
            clean.startsWith("https://") -> clean
            clean.startsWith("http://") -> clean.replaceFirst("http://", "https://")
            clean.startsWith("/") -> "$baseOrigin$clean"
            else -> "$baseOrigin/$clean"
        }
    }
}
