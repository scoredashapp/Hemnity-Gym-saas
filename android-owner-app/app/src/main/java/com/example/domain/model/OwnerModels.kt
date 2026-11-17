package com.example.domain.model

data class OwnerDashboardData(
    val gymId: String? = null,
    val gymName: String?,
    val gymLogoUrl: String?,
    val totalMembers: String?,
    val activeMembers: String?,
    val expiredMembers: String?,
    val todayAttendance: String?,
    val monthlyRevenue: String?,
    val pendingFees: String?,
    val subscriptionStatus: String?,
    val subscriptionPlan: String?,
    val subscriptionExpiry: String?,
    val billingCycle: String? = null,
    val currentMembersCount: String? = null,
    val maxMembers: String? = null,
    val maxBranches: String? = null,
    val canWriteOperations: Boolean? = null,
    val canAddMoreMembers: Boolean? = null,
    val restrictionReason: String? = null,
    val enabledFeatures: List<String> = emptyList(),
    val expiryAlerts: List<ExpiryAlert>,
    val recentPayments: List<PaymentRecord> = emptyList()
)

data class ExpiryAlert(
    val memberId: String,
    val memberName: String,
    val expiryDate: String?,
    val daysRemaining: String?,
    val phone: String?,
    val status: String?
)

data class MemberRecord(
    val id: String,
    val memberCode: String?,
    val name: String,
    val email: String?,
    val phone: String?,
    val photoUrl: String?,
    val planName: String?,
    val membershipStatus: String,
    val joiningDate: String?,
    val startDate: String?,
    val expiryDate: String?,
    val qrCredential: String?,
    val pendingAmount: String?,
    val assignedFee: String? = null,
    val planCurrentPrice: String? = null,
    val discountAmount: String? = null,
    val finalFee: String? = null,
    val amountPaid: String? = null,
    val paymentStatus: String? = null,
    val feeSource: String? = null,
    val adjustmentReason: String? = null
)

data class NewMemberRequest(
    val fullName: String,
    val email: String,
    val phone: String,
    val planId: String?,
    val startDate: String? = null,
    val expiryDate: String? = null,
    val planPrice: String? = null,
    val discountAmount: String? = null,
    val finalFee: String? = null,
    val amountPaid: String? = null,
    val remainingDue: String? = null,
    val paymentMethod: String = "CASH",
    val paymentStatus: String? = null,
    val adjustmentReason: String? = null,
    val idempotencyKey: String? = null
)

data class UpdateMemberRequest(
    val memberId: String,
    val fullName: String,
    val email: String,
    val phone: String
)

enum class CheckInOutcome {
    SUCCESS,
    DUPLICATE,
    EXPIRED,
    INVALID_QR,
    ERROR
}

data class QrCheckInResult(
    val outcome: CheckInOutcome,
    val message: String,
    val memberName: String? = null,
    val memberCode: String? = null,
    val memberPhotoUrl: String? = null,
    val membershipStatus: String? = null,
    val planName: String? = null,
    val expiryDate: String? = null,
    val checkedInAt: String? = null
)

data class AttendanceLogItem(
    val id: String,
    val memberName: String,
    val memberCode: String?,
    val checkedInAt: String,
    val method: String?,
    val status: String?
)

data class OwnerPlan(
    val id: String,
    val name: String,
    val price: String?,
    val priceAmount: Double? = null,
    val durationDays: Int? = null,
    val durationLabel: String?,
    val planType: String?,
    val activeMemberCount: String?,
    val description: String?,
    val isActive: Boolean = true
)

data class PaymentRecord(
    val id: String,
    val receiptNumber: String?,
    val memberName: String?,
    val planName: String?,
    val amount: String?,
    val status: String,
    val method: String?,
    val paidAt: String?
)

data class ManualPaymentRequest(
    val memberIdOrCode: String,
    val amount: String,
    val method: String,
    val planId: String?,
    val notes: String?
)

data class OwnerReportSummary(
    val periodLabel: String?,
    val totalMembers: String?,
    val activeMembers: String?,
    val totalAttendance: String?,
    val expiringSoonCount: String?,
    val totalCollected: String?,
    val totalPending: String?,
    val monthlyRevenueBreakdown: List<Pair<String, Float>> = emptyList()
)

data class OwnerSettingsData(
    val gymName: String?,
    val gymLogoUrl: String?,
    val ownerEmail: String?,
    val phone: String?,
    val address: String?,
    val operatingHours: String?,
    val attendanceRule: String?,
    val subscriptionPlan: String?,
    val subscriptionStatus: String?,
    val gatewayConfigured: Boolean?,
    val gatewayProvider: String?
)

data class OwnerSubscriptionData(
    val planName: String?,
    val status: String?,
    val renewalDate: String?,
    val daysRemaining: String?,
    val maxMembers: String?,
    val maxBranches: String?,
    val features: List<String> = emptyList()
)

data class OwnerNotificationItem(
    val id: String,
    val title: String,
    val message: String,
    val category: String,
    val createdAt: String?,
    val isRead: Boolean = false
)
