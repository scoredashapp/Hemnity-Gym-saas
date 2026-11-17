package com.example.core.security

object RoleGuard {
    private val allowedMemberRoles = setOf("member", "gym_member")
    private val privilegedRoles = setOf(
        "owner",
        "gym_owner",
        "super_admin",
        "superadmin",
        "admin",
        "staff",
        "trainer",
        "manager",
    )

    fun normalizeRole(rawRole: String?): String =
        rawRole?.trim()?.lowercase()?.replace('-', '_')?.replace(' ', '_').orEmpty()

    fun isAllowedMemberRole(rawRole: String?): Boolean {
        val normalized = normalizeRole(rawRole)
        return normalized in allowedMemberRoles
    }

    fun isPrivilegedRole(rawRole: String?): Boolean {
        val normalized = normalizeRole(rawRole)
        return normalized in privilegedRoles
    }

    fun rejectionMessageFor(rawRole: String?): String {
        val normalized = normalizeRole(rawRole)
        return when {
            normalized == "super_admin" || normalized == "superadmin" ->
                "Super Admin accounts cannot sign in to Hemnity Gym Member. Please use the web admin portal."
            normalized == "owner" || normalized == "gym_owner" ->
                "Gym Owner accounts cannot sign in to Hemnity Gym Member. This app is exclusively for Gym Members."
            normalized in privilegedRoles ->
                "Staff and Admin accounts are not permitted in the Member app. Please sign in with a Gym Member account."
            else ->
                "Your account role is not authorized for the Gym Member app."
        }
    }
}
