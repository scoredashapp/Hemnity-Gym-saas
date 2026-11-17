package com.example.data.remote

import com.example.core.network.FlexString
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

data class PlatformSettingsDto(
    @FlexString val id: String? = null,
    @Json(name = "software_name") val softwareName: String? = null,
    @Json(name = "base_url") val baseUrl: String? = null,
    @Json(name = "announcement_banner") val announcementBanner: String? = null,
    @Json(name = "support_email") val supportEmail: String? = null,
    @Json(name = "support_phone") val supportPhone: String? = null,
    @Json(name = "support_address") val supportAddress: String? = null,
    @Json(name = "maintenance_mode") @FlexString val maintenanceMode: String? = null,
    @Json(name = "legal_privacy_summary") val legalPrivacySummary: String? = null,
    @Json(name = "legal_terms_summary") val legalTermsSummary: String? = null,
    @Json(name = "default_grace_period_days") @FlexString val defaultGracePeriodDays: String? = null,
)

@JsonClass(generateAdapter = true)
data class PublicLandingResponseDto(
    val platform: PlatformSettingsDto? = null,
)

@JsonClass(generateAdapter = true)
data class LoginRequestDto(
    val email: String? = null,
    val phone: String? = null,
    val identifier: String? = null,
    val password: String,
    @Json(name = "device_name") val deviceName: String = "Android",
    val platform: String = "android",
)

@JsonClass(generateAdapter = true)
data class RefreshTokenRequestDto(
    @Json(name = "refresh_token") val refreshToken: String,
)

@JsonClass(generateAdapter = true)
data class LogoutRequestDto(
    @Json(name = "refresh_token") val refreshToken: String? = null,
)

@JsonClass(generateAdapter = true)
data class ForgotPasswordRequestDto(
    val identifier: String,
    val email: String? = null,
)

@JsonClass(generateAdapter = true)
data class MessageResponseDto(
    val message: String? = null,
    val status: String? = null,
    val success: Boolean? = null,
)

data class UserSummaryDto(
    @FlexString val id: String? = null,
    @FlexString @Json(name = "member_id") val memberId: String? = null,
    @Json(name = "member_code") val memberCode: String? = null,
    val name: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val role: String? = null,
    @Json(name = "user_type") val userType: String? = null,
    @Json(name = "photo_url") val photoUrl: String? = null,
    @Json(name = "avatar_url") val avatarUrl: String? = null,
    @FlexString @Json(name = "default_gym_id") val defaultGymId: String? = null,
    @FlexString @Json(name = "gym_id") val gymId: String? = null,
)

@JsonClass(generateAdapter = true)
data class LoginDataDto(
    val token: String? = null,
    @Json(name = "access_token") val accessToken: String? = null,
    @Json(name = "refresh_token") val refreshToken: String? = null,
    @Json(name = "expires_in") val expiresIn: Long? = null,
    @Json(name = "expires_at") val expiresAt: Long? = null,
    val role: String? = null,
    val user: UserSummaryDto? = null,
    val member: UserSummaryDto? = null,
)

@JsonClass(generateAdapter = true)
data class LoginResponseDto(
    val token: String? = null,
    @Json(name = "access_token") val accessToken: String? = null,
    @Json(name = "refresh_token") val refreshToken: String? = null,
    @Json(name = "expires_in") val expiresIn: Long? = null,
    @Json(name = "expires_at") val expiresAt: Long? = null,
    val role: String? = null,
    val user: UserSummaryDto? = null,
    val member: UserSummaryDto? = null,
    val data: LoginDataDto? = null,
    val message: String? = null,
) {
    fun resolvedToken(): String? =
        accessToken ?: token ?: data?.accessToken ?: data?.token

    fun resolvedRefreshToken(): String? =
        refreshToken ?: data?.refreshToken

    fun resolvedExpiresAtEpochSec(): Long? {
        val explicit = expiresAt ?: data?.expiresAt
        if (explicit != null) return explicit
        val ttl = expiresIn ?: data?.expiresIn
        return ttl?.let { (System.currentTimeMillis() / 1000L) + it }
    }

    fun resolvedUser(): UserSummaryDto? =
        member ?: user ?: data?.member ?: data?.user

    fun resolvedRole(): String? =
        role ?: resolvedUser()?.role ?: resolvedUser()?.userType ?: data?.role
}

data class AuthMeResponseDto(
    val authenticated: Boolean? = null,
    val role: String? = null,
    val user: UserSummaryDto? = null,
    val member: UserSummaryDto? = null,
    val data: UserSummaryDto? = null,
    @FlexString @Json(name = "selected_gym_id") val selectedGymId: String? = null,
    @Json(name = "unread_notifications") val unreadNotifications: Int? = null,
) {
    fun resolvedUser(): UserSummaryDto? = member ?: user ?: data
    fun resolvedRole(): String? = role ?: resolvedUser()?.role ?: resolvedUser()?.userType
}

data class GymMembershipDto(
    @FlexString @Json(name = "gym_id") val gymId: String? = null,
    @FlexString val id: String? = null,
    @Json(name = "gym_name") val gymName: String? = null,
    val name: String? = null,
    @Json(name = "gym_logo_url") val gymLogoUrl: String? = null,
    @Json(name = "logo_url") val logoUrl: String? = null,
    @FlexString @Json(name = "membership_id") val membershipId: String? = null,
    @Json(name = "membership_code") val membershipCode: String? = null,
    @Json(name = "member_code") val memberCode: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    val status: String? = null,
    @Json(name = "expiry_date") val expiryDate: String? = null,
    @Json(name = "membership_expiry_date") val membershipExpiryDate: String? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "is_current") val isCurrent: Boolean? = null,
    val city: String? = null,
)

data class MemberGymsResponseDto(
    val gyms: List<GymMembershipDto>? = null,
    val items: List<GymMembershipDto>? = null,
    val data: List<GymMembershipDto>? = null,
    @FlexString @Json(name = "selected_gym_id") val selectedGymId: String? = null,
)

data class MemberDashboardDto(
    @Json(name = "member_name") val memberName: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "member_photo_url") val memberPhotoUrl: String? = null,
    @Json(name = "photo_url") val photoUrl: String? = null,
    @FlexString @Json(name = "gym_id") val gymId: String? = null,
    @Json(name = "gym_name") val gymName: String? = null,
    @Json(name = "gym_logo_url") val gymLogoUrl: String? = null,
    @FlexString @Json(name = "membership_id") val membershipId: String? = null,
    @Json(name = "membership_code") val membershipCode: String? = null,
    @Json(name = "member_code") val memberCode: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    @Json(name = "membership_status") val membershipStatus: String? = null,
    val status: String? = null,
    @Json(name = "start_date") val startDate: String? = null,
    @Json(name = "membership_start_date") val membershipStartDate: String? = null,
    @Json(name = "expiry_date") val expiryDate: String? = null,
    @Json(name = "membership_expiry_date") val membershipExpiryDate: String? = null,
    @Json(name = "remaining_days") val remainingDays: Int? = null,
    @Json(name = "total_visits") val totalVisits: Int? = null,
    @Json(name = "month_attendance") val monthAttendance: Int? = null,
    @Json(name = "pending_fees") val pendingFees: Double? = null,
    @Json(name = "currency_symbol") val currencySymbol: String? = null,
    @Json(name = "unread_notifications") val unreadNotifications: Int? = null,
    @Json(name = "gyms_count") val gymsCount: Int? = null,
    @Json(name = "today_checked_in") val todayCheckedIn: Boolean? = null,
    @Json(name = "today_checkin_time") val todayCheckinTime: String? = null,
    val data: MemberDashboardDto? = null,
)

data class RenewalHistoryItemDto(
    @FlexString val id: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    @Json(name = "start_date") val startDate: String? = null,
    @Json(name = "expiry_date") val expiryDate: String? = null,
    val amount: Double? = null,
    @Json(name = "payment_status") val paymentStatus: String? = null,
    @Json(name = "renewed_at") val renewedAt: String? = null,
)

data class MembershipDetailDto(
    @FlexString @Json(name = "gym_id") val gymId: String? = null,
    @Json(name = "gym_name") val gymName: String? = null,
    @FlexString @Json(name = "membership_id") val membershipId: String? = null,
    @Json(name = "membership_code") val membershipCode: String? = null,
    @Json(name = "member_code") val memberCode: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    @Json(name = "plan_duration") val planDuration: String? = null,
    @Json(name = "duration_days") val durationDays: Int? = null,
    @Json(name = "start_date") val startDate: String? = null,
    @Json(name = "membership_start_date") val membershipStartDate: String? = null,
    @Json(name = "expiry_date") val expiryDate: String? = null,
    @Json(name = "membership_expiry_date") val membershipExpiryDate: String? = null,
    @Json(name = "remaining_days") val remainingDays: Int? = null,
    val status: String? = null,
    @Json(name = "membership_fee") val membershipFee: Double? = null,
    @Json(name = "currency_symbol") val currencySymbol: String? = null,
    @Json(name = "payment_status") val paymentStatus: String? = null,
    @Json(name = "renewal_supported") val renewalSupported: Boolean? = null,
    @Json(name = "online_payment_enabled") val onlinePaymentEnabled: Boolean? = null,
    @Json(name = "renewal_history") val renewalHistory: List<RenewalHistoryItemDto>? = null,
)

@JsonClass(generateAdapter = true)
data class MembershipListResponseDto(
    val current: MembershipDetailDto? = null,
    val membership: MembershipDetailDto? = null,
    val memberships: List<MembershipDetailDto>? = null,
    val data: MembershipDetailDto? = null,
)

@JsonClass(generateAdapter = true)
data class RenewalRequestDto(
    @Json(name = "gym_id") val gymId: String,
    @Json(name = "membership_id") val membershipId: String,
)

data class RenewalResponseDto(
    val message: String? = null,
    @Json(name = "checkout_url") val checkoutUrl: String? = null,
    @FlexString @Json(name = "payment_id") val paymentId: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = true)
data class AttendanceDayDto(
    val date: String,
    val status: String? = null,
    @Json(name = "checkin_time") val checkinTime: String? = null,
    @Json(name = "checkout_time") val checkoutTime: String? = null,
    val label: String? = null,
    @Json(name = "holiday_name") val holidayName: String? = null,
)

data class AttendanceLogItemDto(
    @FlexString val id: String? = null,
    val date: String? = null,
    @Json(name = "checkin_time") val checkinTime: String? = null,
    @Json(name = "checkout_time") val checkoutTime: String? = null,
    val method: String? = null,
    val status: String? = null,
    @Json(name = "gym_name") val gymName: String? = null,
)

@JsonClass(generateAdapter = true)
data class AttendanceResponseDto(
    val month: String? = null,
    @Json(name = "today_status") val todayStatus: String? = null,
    @Json(name = "today_checkin_time") val todayCheckinTime: String? = null,
    @Json(name = "total_visits") val totalVisits: Int? = null,
    @Json(name = "month_visits") val monthVisits: Int? = null,
    @Json(name = "attendance_streak") val attendanceStreak: Int? = null,
    @Json(name = "calendar_days") val calendarDays: List<AttendanceDayDto>? = null,
    val holidays: List<AttendanceDayDto>? = null,
    val history: List<AttendanceLogItemDto>? = null,
    val records: List<AttendanceLogItemDto>? = null,
)

data class DigitalIdCardDto(
    @FlexString @Json(name = "gym_id") val gymId: String? = null,
    @Json(name = "gym_name") val gymName: String? = null,
    @Json(name = "gym_logo_url") val gymLogoUrl: String? = null,
    @Json(name = "member_name") val memberName: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "member_photo_url") val memberPhotoUrl: String? = null,
    @FlexString @Json(name = "membership_id") val membershipId: String? = null,
    @Json(name = "membership_code") val membershipCode: String? = null,
    @Json(name = "member_code") val memberCode: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    @Json(name = "expiry_date") val expiryDate: String? = null,
    @Json(name = "membership_expiry_date") val membershipExpiryDate: String? = null,
    val status: String? = null,
    @Json(name = "qr_payload") val qrPayload: String? = null,
    @Json(name = "qr_token") val qrToken: String? = null,
    @Json(name = "active_qr_token") val activeQrToken: String? = null,
    @Json(name = "qr_expires_at") val qrExpiresAt: String? = null,
    @Json(name = "download_permitted") val downloadPermitted: Boolean? = null,
    val data: DigitalIdCardDto? = null,
)

data class PaymentItemDto(
    @FlexString val id: String? = null,
    @Json(name = "payment_date") val paymentDate: String? = null,
    val amount: Double? = null,
    @Json(name = "currency_symbol") val currencySymbol: String? = null,
    @Json(name = "payment_method") val paymentMethod: String? = null,
    val method: String? = null,
    val status: String? = null,
    @Json(name = "receipt_number") val receiptNumber: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    @Json(name = "receipt_pdf_url") val receiptPdfUrl: String? = null,
    @Json(name = "receipt_supported") val receiptSupported: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class PaymentsResponseDto(
    @Json(name = "total_paid") val totalPaid: Double? = null,
    @Json(name = "pending_fees") val pendingFees: Double? = null,
    @Json(name = "currency_symbol") val currencySymbol: String? = null,
    @Json(name = "online_payment_enabled") val onlinePaymentEnabled: Boolean? = null,
    @Json(name = "gateway_name") val gatewayName: String? = null,
    val payments: List<PaymentItemDto>? = null,
    val items: List<PaymentItemDto>? = null,
    val page: Int? = null,
    @Json(name = "has_more") val hasMore: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class PaymentInitiateRequestDto(
    @Json(name = "gym_id") val gymId: String,
    @Json(name = "payment_id") val paymentId: String? = null,
    @Json(name = "membership_id") val membershipId: String? = null,
)

data class PaymentInitiateResponseDto(
    @FlexString @Json(name = "payment_id") val paymentId: String? = null,
    @Json(name = "checkout_url") val checkoutUrl: String? = null,
    val status: String? = null,
    val message: String? = null,
)

data class PaymentVerificationDto(
    @FlexString @Json(name = "payment_id") val paymentId: String? = null,
    val status: String? = null,
    val verified: Boolean? = null,
    val message: String? = null,
    @Json(name = "receipt_number") val receiptNumber: String? = null,
)

@JsonClass(generateAdapter = true)
data class EmergencyContactDto(
    val name: String? = null,
    val phone: String? = null,
    val relation: String? = null,
)

data class MemberProfileDto(
    @FlexString val id: String? = null,
    @Json(name = "member_code") val memberCode: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    val name: String? = null,
    val phone: String? = null,
    val mobile: String? = null,
    val email: String? = null,
    @Json(name = "photo_url") val photoUrl: String? = null,
    @Json(name = "joining_date") val joiningDate: String? = null,
    @Json(name = "date_of_joining") val dateOfJoining: String? = null,
    @Json(name = "membership_start_date") val membershipStartDate: String? = null,
    @Json(name = "emergency_contact") val emergencyContact: EmergencyContactDto? = null,
    @Json(name = "emergency_contact_authorized") val emergencyContactAuthorized: Boolean? = null,
    @Json(name = "editable_fields") val editableFields: List<String>? = null,
    @Json(name = "gyms_count") val gymsCount: Int? = null,
    val gyms: List<GymMembershipDto>? = null,
    @Json(name = "notification_preferences") val notificationPreferences: NotificationPreferencesDto? = null,
    val data: MemberProfileDto? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateProfileRequestDto(
    @Json(name = "full_name") val fullName: String? = null,
    val phone: String? = null,
    @Json(name = "emergency_contact_name") val emergencyContactName: String? = null,
    @Json(name = "emergency_contact_phone") val emergencyContactPhone: String? = null,
    @Json(name = "emergency_contact_relation") val emergencyContactRelation: String? = null,
)

@JsonClass(generateAdapter = true)
data class ChangePasswordRequestDto(
    @Json(name = "current_password") val currentPassword: String,
    @Json(name = "new_password") val newPassword: String,
    @Json(name = "confirm_password") val confirmPassword: String,
)

data class NotificationItemDto(
    @FlexString val id: String,
    val type: String? = null,
    val title: String? = null,
    val message: String? = null,
    val body: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "is_read") val isRead: Boolean? = null,
    @FlexString @Json(name = "gym_id") val gymId: String? = null,
    @Json(name = "gym_name") val gymName: String? = null,
)

@JsonClass(generateAdapter = true)
data class NotificationsResponseDto(
    val notifications: List<NotificationItemDto>? = null,
    val items: List<NotificationItemDto>? = null,
    @Json(name = "unread_count") val unreadCount: Int? = null,
    val page: Int? = null,
    @Json(name = "has_more") val hasMore: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class NotificationPreferencesDto(
    @Json(name = "push_enabled") val pushEnabled: Boolean = true,
    @Json(name = "membership_alerts") val membershipAlerts: Boolean = true,
    @Json(name = "payment_alerts") val paymentAlerts: Boolean = true,
    @Json(name = "gym_announcements") val gymAnnouncements: Boolean = true,
)

@JsonClass(generateAdapter = true)
data class DeviceTokenRequestDto(
    val token: String,
    val platform: String = "android",
    @Json(name = "device_name") val deviceName: String = "Android",
)
