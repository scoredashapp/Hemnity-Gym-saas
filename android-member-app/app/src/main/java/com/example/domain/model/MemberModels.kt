package com.example.domain.model

enum class MembershipStatus(val label: String) {
    ACTIVE("Active"),
    EXPIRING_SOON("Expiring Soon"),
    EXPIRED("Expired"),
    SUSPENDED("Suspended"),
    UNKNOWN("Unknown");

    companion object {
        fun fromRaw(raw: String?, remainingDays: Int? = null): MembershipStatus {
            val normalized = raw?.trim()?.lowercase()?.replace('-', '_')?.replace(' ', '_')
            return when (normalized) {
                "active" -> if (remainingDays != null && remainingDays in 1..7) EXPIRING_SOON else ACTIVE
                "expiring_soon", "expiring" -> EXPIRING_SOON
                "expired", "inactive" -> EXPIRED
                "suspended", "paused", "frozen" -> SUSPENDED
                else -> when {
                    remainingDays != null && remainingDays <= 0 -> EXPIRED
                    remainingDays != null && remainingDays in 1..7 -> EXPIRING_SOON
                    else -> UNKNOWN
                }
            }
        }
    }
}

data class GymMembershipSummary(
    val gymId: String,
    val gymName: String,
    val gymLogoUrl: String?,
    val membershipId: String,
    val planName: String,
    val status: MembershipStatus,
    val expiryDate: String,
    val city: String?,
    val isCurrent: Boolean,
)

data class DashboardSummary(
    val memberName: String,
    val memberPhotoUrl: String?,
    val gymId: String,
    val gymName: String,
    val gymLogoUrl: String?,
    val membershipId: String,
    val planName: String,
    val status: MembershipStatus,
    val startDate: String?,
    val expiryDate: String,
    val remainingDays: Int,
    val totalVisits: Int,
    val monthAttendance: Int,
    val pendingFees: Double,
    val currencySymbol: String,
    val unreadNotifications: Int,
    val gymsCount: Int,
    val todayCheckedIn: Boolean,
    val todayCheckinTime: String?,
)

data class RenewalRecord(
    val id: String,
    val planName: String,
    val startDate: String,
    val expiryDate: String,
    val amount: Double,
    val paymentStatus: String,
    val renewedAt: String,
)

data class MembershipDetails(
    val gymId: String,
    val gymName: String,
    val membershipId: String,
    val planName: String,
    val planDuration: String,
    val startDate: String,
    val expiryDate: String,
    val remainingDays: Int,
    val status: MembershipStatus,
    val membershipFee: Double,
    val currencySymbol: String,
    val paymentStatus: String,
    val renewalSupported: Boolean,
    val onlinePaymentEnabled: Boolean,
    val renewalHistory: List<RenewalRecord>,
)

enum class CalendarDayState {
    ATTENDED,
    ABSENT,
    NO_RECORD,
    GYM_HOLIDAY,
    FUTURE,
}

data class CalendarDayInfo(
    val date: String,
    val dayOfMonth: Int,
    val state: CalendarDayState,
    val checkinTime: String? = null,
    val label: String? = null,
)

data class AttendanceRecord(
    val id: String,
    val date: String,
    val checkinTime: String,
    val checkoutTime: String?,
    val method: String?,
    val status: String,
)

data class AttendanceMonthSummary(
    val monthKey: String,
    val todayStatus: String,
    val todayCheckinTime: String?,
    val totalVisits: Int,
    val monthVisits: Int,
    val attendanceStreak: Int,
    val calendarDays: Map<Int, CalendarDayInfo>,
    val history: List<AttendanceRecord>,
)

data class DigitalIdCard(
    val gymId: String,
    val gymName: String,
    val gymLogoUrl: String?,
    val memberName: String,
    val memberPhotoUrl: String?,
    val membershipId: String,
    val planName: String,
    val expiryDate: String,
    val status: MembershipStatus,
    val qrPayload: String?,
    val qrExpiresAt: String?,
    val downloadPermitted: Boolean,
)

data class PaymentRecord(
    val id: String,
    val paymentDate: String,
    val amount: Double,
    val currencySymbol: String,
    val method: String,
    val status: String,
    val receiptNumber: String,
    val planName: String?,
    val receiptPdfUrl: String?,
    val receiptSupported: Boolean,
)

data class PaymentsOverview(
    val totalPaid: Double,
    val pendingFees: Double,
    val currencySymbol: String,
    val onlinePaymentEnabled: Boolean,
    val gatewayName: String?,
    val payments: List<PaymentRecord>,
    val page: Int,
    val hasMore: Boolean,
)

data class MemberProfile(
    val id: String,
    val fullName: String,
    val phone: String,
    val email: String,
    val photoUrl: String?,
    val joiningDate: String,
    val emergencyContactName: String?,
    val emergencyContactPhone: String?,
    val emergencyContactRelation: String?,
    val emergencyContactAuthorized: Boolean,
    val editableFields: Set<String>,
    val gyms: List<GymMembershipSummary>,
    val notificationPreferences: NotificationPreferences,
)

data class NotificationPreferences(
    val pushEnabled: Boolean = true,
    val membershipAlerts: Boolean = true,
    val paymentAlerts: Boolean = true,
    val gymAnnouncements: Boolean = true,
)

enum class NotificationType(val label: String) {
    EXPIRING_SOON("Expiring Soon"),
    EXPIRED("Expired"),
    PAYMENT_RECEIVED("Payment Received"),
    PAYMENT_DUE("Payment Due"),
    MEMBERSHIP_RENEWED("Renewed"),
    GYM_ANNOUNCEMENT("Announcement"),
    GYM_HOLIDAY("Holiday Notice"),
    GENERAL("Notice");

    companion object {
        fun fromRaw(raw: String?): NotificationType {
            return when (raw?.trim()?.lowercase()?.replace('-', '_')?.replace(' ', '_')) {
                "membership_expiring_soon", "expiring_soon" -> EXPIRING_SOON
                "membership_expired", "expired" -> EXPIRED
                "payment_received", "payment_success" -> PAYMENT_RECEIVED
                "payment_due", "fee_due" -> PAYMENT_DUE
                "membership_renewed", "renewed" -> MEMBERSHIP_RENEWED
                "gym_announcement", "announcement" -> GYM_ANNOUNCEMENT
                "gym_holiday", "gym_closure", "holiday" -> GYM_HOLIDAY
                else -> GENERAL
            }
        }
    }
}

data class MemberNotification(
    val id: String,
    val type: NotificationType,
    val title: String,
    val message: String,
    val createdAt: String,
    val isRead: Boolean,
    val gymName: String?,
)

data class NotificationsFeed(
    val items: List<MemberNotification>,
    val unreadCount: Int,
    val page: Int,
    val hasMore: Boolean,
)

data class PlatformInfo(
    val softwareName: String,
    val supportEmail: String,
    val supportPhone: String,
    val supportAddress: String,
    val legalPrivacySummary: String,
    val legalTermsSummary: String,
    val announcementBanner: String?,
    val maintenanceMode: Boolean,
)
