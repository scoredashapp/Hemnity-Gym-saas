package com.example.data.repository

import com.example.core.network.HemnityApiService
import com.example.core.network.JsonParserHelpers
import com.example.core.network.SessionCookieJar
import com.example.core.security.SecureTokenStorage
import com.example.domain.model.ApiResult
import com.example.domain.model.AuthSession
import com.example.domain.model.FaqItem
import com.example.domain.model.LandingInfo
import com.example.domain.model.SaasPlan
import com.example.domain.model.UserRole
import org.json.JSONArray
import org.json.JSONObject

class AuthRepository(
    private val api: HemnityApiService,
    private val tokenStorage: SecureTokenStorage,
    private val cookieJar: SessionCookieJar
) {
    fun getSavedSession(): AuthSession? = tokenStorage.getSession()

    suspend fun fetchPublicLanding(): ApiResult<LandingInfo> {
        return RepositoryHelpers.safeApiCall("public/landing", { api.getPublicLanding() }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val platform = JsonParserHelpers.firstObject(root, "platform")
            val plansArray = JsonParserHelpers.firstArray(root, "plans") ?: JSONArray()
            val faqsArray = JsonParserHelpers.firstArray(root, "faqs") ?: JSONArray()

            val plans = buildList {
                for (i in 0 until plansArray.length()) {
                    val p = plansArray.optJSONObject(i) ?: continue
                    val rawFeatures = JsonParserHelpers.firstNonBlankString(p, "enabled_features_json")
                    add(
                        SaasPlan(
                            id = JsonParserHelpers.firstNonBlankString(p, "id") ?: "$i",
                            slug = JsonParserHelpers.firstNonBlankString(p, "slug").orEmpty(),
                            planName = JsonParserHelpers.firstNonBlankString(p, "plan_name", "name") ?: "Plan",
                            tagline = JsonParserHelpers.firstNonBlankString(p, "tagline").orEmpty(),
                            monthlyPrice = JsonParserHelpers.firstNonBlankString(p, "monthly_price") ?: "0",
                            quarterlyPrice = JsonParserHelpers.firstNonBlankString(p, "quarterly_price") ?: "0",
                            yearlyPrice = JsonParserHelpers.firstNonBlankString(p, "yearly_price") ?: "0",
                            trialDays = JsonParserHelpers.firstNonBlankString(p, "trial_days") ?: "0",
                            maxMembers = JsonParserHelpers.firstNonBlankString(p, "max_members") ?: "-",
                            maxBranches = JsonParserHelpers.firstNonBlankString(p, "max_branches") ?: "-",
                            description = JsonParserHelpers.firstNonBlankString(p, "description").orEmpty(),
                            isFeatured = JsonParserHelpers.firstBoolean(p, "is_featured") == true,
                            features = parseFeaturesList(rawFeatures)
                        )
                    )
                }
            }

            val faqs = buildList {
                for (i in 0 until faqsArray.length()) {
                    val f = faqsArray.optJSONObject(i) ?: continue
                    add(
                        FaqItem(
                            id = JsonParserHelpers.firstNonBlankString(f, "id") ?: "$i",
                            question = JsonParserHelpers.firstNonBlankString(f, "question").orEmpty(),
                            answer = JsonParserHelpers.firstNonBlankString(f, "answer").orEmpty()
                        )
                    )
                }
            }

            LandingInfo(
                softwareName = JsonParserHelpers.firstNonBlankString(platform, "software_name")
                    ?: "Hemnity Gym Management Software",
                heroBadge = JsonParserHelpers.firstNonBlankString(platform, "hero_badge").orEmpty(),
                heroTitle = JsonParserHelpers.firstNonBlankString(platform, "hero_title").orEmpty(),
                heroSubtitle = JsonParserHelpers.firstNonBlankString(platform, "hero_subtitle").orEmpty(),
                supportEmail = JsonParserHelpers.firstNonBlankString(platform, "support_email").orEmpty(),
                supportPhone = JsonParserHelpers.firstNonBlankString(platform, "support_phone").orEmpty(),
                supportAddress = JsonParserHelpers.firstNonBlankString(platform, "support_address").orEmpty(),
                plans = plans,
                faqs = faqs
            )
        }
    }

    suspend fun loginOwner(emailOrPhone: String, password: String): ApiResult<AuthSession> {
        val body = RepositoryHelpers.jsonBody {
            put("email", emailOrPhone.trim())
            put("password", password)
        }

        val result = RepositoryHelpers.safeApiCall("auth/login", { api.login(body) }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw)
                ?: error("Invalid response format from login server.")
            val data = JsonParserHelpers.firstObject(root, "data") ?: root
            val userObj = JsonParserHelpers.firstObject(data, "user", "account", "owner")
                ?: JsonParserHelpers.firstObject(root, "user")
            val gymObj = JsonParserHelpers.firstObject(data, "gym")
                ?: JsonParserHelpers.firstObject(userObj, "gym")

            val token = JsonParserHelpers.firstNonBlankString(
                data,
                "token", "access_token", "api_token", "jwt", "auth_token"
            ) ?: JsonParserHelpers.firstNonBlankString(
                root,
                "token", "access_token", "api_token", "jwt", "auth_token"
            ).orEmpty()

            val refreshToken = JsonParserHelpers.firstNonBlankString(
                data,
                "refresh_token", "refreshToken"
            ).orEmpty()

            val rawRole = JsonParserHelpers.firstNonBlankString(
                userObj,
                "role", "user_role", "account_type", "type"
            ) ?: JsonParserHelpers.firstNonBlankString(
                data,
                "role", "user_role", "account_type", "type"
            ) ?: JsonParserHelpers.firstNonBlankString(
                root,
                "role", "user_role", "account_type", "type"
            ).orEmpty()

            val parsedRole = UserRole.fromServerRole(rawRole)
            val expiresInSeconds = JsonParserHelpers.firstNonBlankString(
                data,
                "expires_in", "expiresIn"
            )?.toLongOrNull()
            val expiresAtEpochMs = if (expiresInSeconds != null && expiresInSeconds > 0L) {
                System.currentTimeMillis() + (expiresInSeconds * 1000L)
            } else {
                0L
            }

            val existingCookie = tokenStorage.getSession()?.sessionCookie.orEmpty()
            AuthSession(
                token = token,
                refreshToken = refreshToken,
                sessionCookie = existingCookie,
                role = parsedRole,
                rawRole = rawRole,
                userId = JsonParserHelpers.firstNonBlankString(userObj, "id", "user_id")
                    ?: JsonParserHelpers.firstNonBlankString(data, "user_id", "id").orEmpty(),
                userName = JsonParserHelpers.firstNonBlankString(userObj, "name", "full_name")
                    ?: JsonParserHelpers.firstNonBlankString(data, "name", "user_name").orEmpty(),
                userEmail = JsonParserHelpers.firstNonBlankString(userObj, "email")
                    ?: emailOrPhone.trim(),
                gymId = JsonParserHelpers.firstNonBlankString(gymObj, "id", "gym_id")
                    ?: JsonParserHelpers.firstNonBlankString(userObj, "gym_id")
                    ?: JsonParserHelpers.firstNonBlankString(data, "gym_id").orEmpty(),
                gymName = JsonParserHelpers.firstNonBlankString(gymObj, "name", "gym_name")
                    ?: JsonParserHelpers.firstNonBlankString(userObj, "gym_name")
                    ?: JsonParserHelpers.firstNonBlankString(data, "gym_name").orEmpty(),
                expiresAtEpochMs = expiresAtEpochMs
            )
        }

        if (result is ApiResult.Success) {
            var session = result.data
            if (session.hasCredential) {
                tokenStorage.saveSession(session)
            }
            if (session.role == UserRole.UNKNOWN && session.hasCredential) {
                session = confirmOwnerRoleFromServer(session)
            }
            if (!session.role.isAuthorizedOwner) {
                clearLocalSession()
                val rejectedReason = when (session.role) {
                    UserRole.MEMBER -> "Access denied: Member accounts cannot sign in to Hemnity Gym Owner."
                    UserRole.SUPER_ADMIN -> "Access denied: Super Admin accounts are not permitted in Hemnity Gym Owner."
                    UserRole.UNKNOWN -> "Access denied: Server did not confirm an authorized Gym Owner role."
                    UserRole.OWNER -> ""
                }
                return ApiResult.HttpError(code = 403, message = rejectedReason, route = "auth/login")
            }
            tokenStorage.saveSession(session)
            return ApiResult.Success(session)
        }
        return result
    }

    suspend fun loginWithBearerToken(rawToken: String): ApiResult<AuthSession> {
        val cleanToken = rawToken.trim().removePrefix("Bearer ").trim()
        if (cleanToken.isBlank()) {
            return ApiResult.HttpError(code = 400, message = "Bearer API token is required.", route = "owner/dashboard")
        }

        val res = RepositoryHelpers.safeApiCall(
            routeHint = "owner/dashboard",
            call = { api.getOwnerDashboardWithAuth("Bearer $cleanToken") }
        ) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw)
                ?: error("Unexpected response from owner/dashboard.")
            val data = JsonParserHelpers.firstObject(root, "data") ?: root
            val gymId = JsonParserHelpers.firstNonBlankString(data, "gym_id") ?: ""
            val gymName = JsonParserHelpers.firstNonBlankString(data, "gym_name") ?: "Authorized Gym"
            AuthSession(
                token = cleanToken,
                refreshToken = "",
                sessionCookie = "",
                role = UserRole.OWNER,
                rawRole = "gym_owner",
                userId = "",
                userName = "Gym Owner API Token",
                userEmail = "$gymName (Personal Token)",
                gymId = gymId,
                gymName = gymName,
                expiresAtEpochMs = 0L
            )
        }

        if (res is ApiResult.Success) {
            tokenStorage.saveSession(res.data)
        }
        return res
    }

    private suspend fun confirmOwnerRoleFromServer(session: AuthSession): AuthSession {
        val meRes = RepositoryHelpers.safeApiCall("auth/me", { api.getCurrentUser() }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            val user = JsonParserHelpers.firstObject(obj, "user", "data") ?: obj
            JsonParserHelpers.firstNonBlankString(user, "role", "user_role", "account_type")
        }
        if (meRes is ApiResult.Success && !meRes.data.isNullOrBlank()) {
            return session.copy(
                rawRole = meRes.data,
                role = UserRole.fromServerRole(meRes.data)
            )
        }
        val ownerDash = runCatching { api.getOwnerDashboard() }.getOrNull()
        if (ownerDash?.isSuccessful == true) {
            val dashObj = JsonParserHelpers.parseObjectOrNull(ownerDash.body()?.string())
            val dashGymId = JsonParserHelpers.firstNonBlankString(dashObj, "gym_id").orEmpty()
            val dashGymName = JsonParserHelpers.firstNonBlankString(dashObj, "gym_name").orEmpty()
            return session.copy(
                role = UserRole.OWNER,
                rawRole = "gym_owner",
                gymId = session.gymId.ifBlank { dashGymId },
                gymName = session.gymName.ifBlank { dashGymName }
            )
        }
        return session
    }

    suspend fun validateExistingOwnerSession(): AuthSession? {
        val saved = tokenStorage.getSession() ?: return null
        if (!saved.hasCredential || !saved.role.isAuthorizedOwner) {
            clearLocalSession()
            return null
        }

        if (saved.isExpired() && saved.refreshToken.isNotBlank()) {
            val refreshed = tryRefreshToken(saved)
            if (refreshed == null) {
                clearLocalSession()
                return null
            }
        } else if (saved.isExpired()) {
            clearLocalSession()
            return null
        }

        val res = RepositoryHelpers.safeApiCall("owner/dashboard", { api.getOwnerDashboard() }) { true }
        return when (res) {
            is ApiResult.Success -> tokenStorage.getSession()
            is ApiResult.HttpError -> {
                if (res.isUnauthorized || res.isForbidden) {
                    clearLocalSession()
                    null
                } else {
                    saved
                }
            }
            is ApiResult.NetworkError -> saved
        }
    }

    private suspend fun tryRefreshToken(session: AuthSession): AuthSession? {
        val body = RepositoryHelpers.jsonBody {
            put("refresh_token", session.refreshToken)
        }
        val res = RepositoryHelpers.safeApiCall("auth/refresh", { api.refreshToken(body) }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            val data = JsonParserHelpers.firstObject(obj, "data") ?: obj
            val newToken = JsonParserHelpers.firstNonBlankString(data, "token", "access_token")
            val expSec = JsonParserHelpers.firstNonBlankString(data, "expires_in")?.toLongOrNull()
            if (newToken.isNullOrBlank()) null
            else session.copy(
                token = newToken,
                expiresAtEpochMs = if (expSec != null) System.currentTimeMillis() + expSec * 1000L else 0L
            )
        }
        return if (res is ApiResult.Success && res.data != null) {
            tokenStorage.saveSession(res.data)
            res.data
        } else {
            null
        }
    }

    suspend fun requestPasswordReset(email: String): ApiResult<String> {
        val body = RepositoryHelpers.jsonBody {
            put("email", email.trim())
        }
        return RepositoryHelpers.safeApiCall("auth/forgot-password", { api.forgotPassword(body) }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            JsonParserHelpers.firstNonBlankString(obj, "message", "status")
                ?: "Password reset instructions sent if the account exists."
        }
    }

    suspend fun fetchOpenApiSpec(): ApiResult<String> {
        return RepositoryHelpers.safeApiCall("docs/spec", { api.getOpenApiSpec() }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            obj?.toString(2) ?: raw
        }
    }

    suspend fun logout() {
        runCatching { api.logout() }
        clearLocalSession()
    }

    fun clearLocalSession() {
        tokenStorage.clearSession()
        cookieJar.clear()
    }

    private fun parseFeaturesList(rawJson: String?): List<String> {
        if (rawJson.isNullOrBlank()) return emptyList()
        val arr = JsonParserHelpers.parseArrayOrNull(rawJson) ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val item = arr.optString(i).trim()
                if (item.isNotBlank()) {
                    add(
                        item.split("_").joinToString(" ") { part ->
                            part.replaceFirstChar { ch -> ch.uppercase() }
                        }
                    )
                }
            }
        }
    }
}
