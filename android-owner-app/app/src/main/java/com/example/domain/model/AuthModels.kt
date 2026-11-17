package com.example.domain.model

import kotlinx.serialization.Serializable

@Serializable
enum class UserRole {
    OWNER,
    MEMBER,
    SUPER_ADMIN,
    UNKNOWN;

    val isAuthorizedOwner: Boolean
        get() = this == OWNER

    companion object {
        fun fromServerRole(raw: String?): UserRole {
            return when (raw?.trim()?.lowercase()) {
                "owner", "gym_owner", "admin", "gym_admin", "staff" -> OWNER
                "superadmin", "super_admin", "platform_admin" -> SUPER_ADMIN
                "member", "gym_member", "user", "customer" -> MEMBER
                else -> UNKNOWN
            }
        }
    }
}

enum class AppThemeMode(val label: String) {
    DARK("Dark"),
    LIGHT("Light"),
    SYSTEM("System")
}

@Serializable
data class AuthSession(
    val token: String = "",
    val refreshToken: String = "",
    val sessionCookie: String = "",
    val role: UserRole = UserRole.UNKNOWN,
    val rawRole: String = "",
    val userId: String = "",
    val userName: String = "",
    val userEmail: String = "",
    val gymId: String = "",
    val gymName: String = "",
    val expiresAtEpochMs: Long = 0L
) {
    val hasCredential: Boolean
        get() = token.isNotBlank() || sessionCookie.isNotBlank()

    fun isExpired(nowMs: Long = System.currentTimeMillis()): Boolean {
        return expiresAtEpochMs > 0L && nowMs >= expiresAtEpochMs
    }
}

data class LandingInfo(
    val softwareName: String,
    val heroBadge: String,
    val heroTitle: String,
    val heroSubtitle: String,
    val supportEmail: String,
    val supportPhone: String,
    val supportAddress: String,
    val plans: List<SaasPlan>,
    val faqs: List<FaqItem>
)

data class SaasPlan(
    val id: String,
    val slug: String,
    val planName: String,
    val tagline: String,
    val monthlyPrice: String,
    val quarterlyPrice: String,
    val yearlyPrice: String,
    val trialDays: String,
    val maxMembers: String,
    val maxBranches: String,
    val description: String,
    val isFeatured: Boolean,
    val features: List<String>
)

data class FaqItem(
    val id: String,
    val question: String,
    val answer: String
)
