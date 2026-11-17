package com.example.data.repository

import com.example.core.network.HemnityApiService
import com.example.core.network.JsonParserHelpers
import com.example.domain.model.ApiResult
import com.example.domain.model.AttendanceLogItem
import com.example.domain.model.CheckInOutcome
import com.example.domain.model.ExpiryAlert
import com.example.domain.model.ManualPaymentRequest
import com.example.domain.model.MemberRecord
import com.example.domain.model.MembershipFeeCalculator
import com.example.domain.model.NewMemberRequest
import com.example.domain.model.OwnerDashboardData
import com.example.domain.model.OwnerNotificationItem
import com.example.domain.model.OwnerPlan
import com.example.domain.model.OwnerReportSummary
import com.example.domain.model.OwnerSettingsData
import com.example.domain.model.OwnerSubscriptionData
import com.example.domain.model.PaymentRecord
import com.example.domain.model.QrCheckInResult
import com.example.domain.model.UpdateMemberRequest
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI

class OwnerRepository(
    private val api: HemnityApiService
) {
    suspend fun getDashboard(): ApiResult<OwnerDashboardData> {
        return RepositoryHelpers.safeApiCall("owner/dashboard", { api.getOwnerDashboard() }) { raw ->
            parseDashboardJson(raw)
        }
    }

    internal fun parseDashboardJson(raw: String): OwnerDashboardData {
        val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
        val data = JsonParserHelpers.firstObject(root, "data") ?: root
        val gym = JsonParserHelpers.firstObject(data, "gym", "tenant") ?: JsonParserHelpers.firstObject(root, "gym")
        val stats = JsonParserHelpers.firstObject(data, "kpis", "stats", "metrics", "summary") ?: data
        val subscription = JsonParserHelpers.firstObject(data, "subscription", "saas_subscription", "plan")

        val alertsArray = JsonParserHelpers.firstArray(
            data,
            "expiry_alerts", "expiring_members", "expiring_memberships", "alerts", "upcoming_expiries"
        ) ?: JSONArray()

        val alerts = buildList {
            for (i in 0 until alertsArray.length()) {
                val item = alertsArray.optJSONObject(i) ?: continue
                add(
                    ExpiryAlert(
                        memberId = JsonParserHelpers.firstNonBlankString(item, "id", "member_id") ?: "$i",
                        memberName = JsonParserHelpers.firstNonBlankString(item, "name", "full_name", "member_name")
                            ?: "Member #${i + 1}",
                        expiryDate = JsonParserHelpers.firstNonBlankString(
                            item,
                            "membership_expiry_date", "expiry_date", "expires_at", "end_date"
                        ),
                        daysRemaining = JsonParserHelpers.firstNonBlankString(item, "days_remaining", "remaining_days"),
                        phone = JsonParserHelpers.firstNonBlankString(item, "phone", "mobile"),
                        status = JsonParserHelpers.firstNonBlankString(item, "status")
                    )
                )
            }
        }

        val recentPaymentsArr = JsonParserHelpers.firstArray(data, "recent_payments", "payments") ?: JSONArray()
        val recentPayments = parsePaymentsArray(recentPaymentsArr)

        val enabledFeatures = parseSubscriptionFeatures(subscription)

        return OwnerDashboardData(
            gymId = JsonParserHelpers.firstNonBlankString(gym, "id", "gym_id")
                ?: JsonParserHelpers.firstNonBlankString(data, "gym_id"),
            gymName = JsonParserHelpers.firstNonBlankString(gym, "name", "gym_name")
                ?: JsonParserHelpers.firstNonBlankString(data, "gym_name"),
            gymLogoUrl = JsonParserHelpers.resolveAbsoluteAssetUrl(
                JsonParserHelpers.firstNonBlankString(gym, "logo", "logo_url", "gym_logo")
                    ?: JsonParserHelpers.firstNonBlankString(data, "gym_logo", "logo_url")
            ),
            totalMembers = JsonParserHelpers.firstNonBlankString(stats, "total_members", "totalMembers", "members_count"),
            activeMembers = JsonParserHelpers.firstNonBlankString(stats, "active_members", "activeMembers"),
            expiredMembers = JsonParserHelpers.firstNonBlankString(stats, "expired_members", "expiredMembers"),
            todayAttendance = JsonParserHelpers.firstNonBlankString(
                stats,
                "today_attendance", "todays_attendance", "attendance_today", "today_checkins"
            ),
            monthlyRevenue = JsonParserHelpers.firstNonBlankString(
                stats,
                "monthly_revenue", "revenue_this_month", "month_revenue", "revenue"
            ),
            pendingFees = JsonParserHelpers.firstNonBlankString(
                stats,
                "pending_fees", "pending_amount", "dues", "pending_dues"
            ),
            subscriptionStatus = JsonParserHelpers.firstNonBlankString(
                subscription,
                "effective_status", "status", "subscription_status"
            ) ?: JsonParserHelpers.firstNonBlankString(data, "subscription_status", "saas_status"),
            subscriptionPlan = JsonParserHelpers.firstNonBlankString(
                subscription,
                "plan_name", "name", "plan_slug", "slug"
            ) ?: JsonParserHelpers.firstNonBlankString(data, "subscription_plan"),
            subscriptionExpiry = JsonParserHelpers.firstNonBlankString(
                subscription,
                "current_period_end", "expires_at", "expiry_date"
            ),
            billingCycle = JsonParserHelpers.firstNonBlankString(subscription, "billing_cycle"),
            currentMembersCount = JsonParserHelpers.firstNonBlankString(subscription, "current_members"),
            maxMembers = JsonParserHelpers.firstNonBlankString(subscription, "max_members"),
            maxBranches = JsonParserHelpers.firstNonBlankString(subscription, "max_branches"),
            canWriteOperations = JsonParserHelpers.firstBoolean(subscription, "can_write_operations"),
            canAddMoreMembers = JsonParserHelpers.firstBoolean(subscription, "can_add_more_members"),
            restrictionReason = JsonParserHelpers.firstNonBlankString(subscription, "restriction_reason"),
            enabledFeatures = enabledFeatures,
            expiryAlerts = alerts,
            recentPayments = recentPayments
        )
    }

    private fun parseSubscriptionFeatures(subscription: JSONObject?): List<String> {
        if (subscription == null) return emptyList()
        val arr = JsonParserHelpers.firstArray(subscription, "enabled_features", "features")
            ?: JsonParserHelpers.parseArrayOrNull(
                JsonParserHelpers.firstNonBlankString(subscription, "enabled_features_json")
            )
            ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val raw = arr.optString(i).trim()
                if (raw.isNotBlank()) {
                    add(
                        raw.split("_").joinToString(" ") { part ->
                            part.replaceFirstChar { ch -> ch.uppercase() }
                        }
                    )
                }
            }
        }
    }

    suspend fun getMembers(search: String? = null): ApiResult<List<MemberRecord>> {
        val cleanSearch = search?.trim()?.takeIf { it.isNotBlank() }
        return RepositoryHelpers.safeApiCall("owner/members", { api.getOwnerMembers(cleanSearch) }) { raw ->
            parseMembersJson(raw)
        }
    }

    internal fun parseMembersJson(raw: String): List<MemberRecord> {
        val root = JsonParserHelpers.parseObjectOrNull(raw)
        val arr = when {
            root != null -> JsonParserHelpers.firstArray(root, "members", "data", "items", "records")
                ?: JsonParserHelpers.firstObject(root, "data")?.let {
                    JsonParserHelpers.firstArray(it, "members", "items", "records")
                }
                ?: JSONArray()
            else -> JsonParserHelpers.parseArrayOrNull(raw) ?: JSONArray()
        }

        return buildList {
            for (i in 0 until arr.length()) {
                val m = arr.optJSONObject(i) ?: continue
                add(parseMemberObject(m, i))
            }
        }
    }

    suspend fun createMember(request: NewMemberRequest): ApiResult<MemberRecord> {
        val body = RepositoryHelpers.jsonBody {
            put("name", request.fullName.trim())
            put("full_name", request.fullName.trim())
            put("email", request.email.trim())
            put("phone", request.phone.trim())
            if (!request.planId.isNullOrBlank()) put("plan_id", request.planId.trim())
            if (!request.startDate.isNullOrBlank()) put("start_date", request.startDate.trim())
            if (!request.expiryDate.isNullOrBlank()) put("expiry_date", request.expiryDate.trim())
            if (!request.planPrice.isNullOrBlank()) put("plan_price", request.planPrice.trim())
            if (!request.discountAmount.isNullOrBlank()) put("discount_amount", request.discountAmount.trim())
            if (!request.finalFee.isNullOrBlank()) put("final_fee", request.finalFee.trim())
            if (!request.amountPaid.isNullOrBlank()) put("amount_paid", request.amountPaid.trim())
            if (!request.remainingDue.isNullOrBlank()) put("remaining_due", request.remainingDue.trim())
            if (request.paymentMethod.isNotBlank()) put("payment_method", request.paymentMethod.trim().lowercase())
            if (!request.paymentStatus.isNullOrBlank()) put("payment_status", request.paymentStatus.trim().lowercase())
            if (!request.adjustmentReason.isNullOrBlank()) put("adjustment_reason", request.adjustmentReason.trim())
            if (!request.idempotencyKey.isNullOrBlank()) put("idempotency_key", request.idempotencyKey.trim())
        }
        return RepositoryHelpers.safeApiCall("owner/members", { api.createOwnerMember(body) }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val m = JsonParserHelpers.firstObject(root, "member", "data") ?: root
            parseMemberObject(m, 0)
        }
    }

    suspend fun updateMember(request: UpdateMemberRequest): ApiResult<MemberRecord> {
        val body = RepositoryHelpers.jsonBody {
            put("name", request.fullName.trim())
            put("full_name", request.fullName.trim())
            put("email", request.email.trim())
            put("phone", request.phone.trim())
        }
        return RepositoryHelpers.safeApiCall("owner/members/${request.memberId}", {
            api.updateOwnerMember(request.memberId, body)
        }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val m = JsonParserHelpers.firstObject(root, "member", "data") ?: root
            parseMemberObject(m, 0)
        }
    }

    suspend fun setMemberStatus(memberId: String, active: Boolean): ApiResult<String> {
        val body = RepositoryHelpers.jsonBody {
            put("status", if (active) "active" else "suspended")
        }
        return RepositoryHelpers.safeApiCall("owner/members/$memberId/status", {
            api.updateMemberStatus(memberId, body)
        }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            JsonParserHelpers.firstNonBlankString(obj, "message", "status")
                ?: if (active) "Member reactivated." else "Member suspended."
        }
    }

    suspend fun renewMemberPlan(
        memberId: String,
        planId: String,
        amountPaid: String?,
        startDate: String? = null,
        expiryDate: String? = null,
        planPrice: String? = null,
        discountAmount: String? = null,
        finalFee: String? = null,
        remainingDue: String? = null,
        paymentMethod: String = "CASH",
        paymentStatus: String? = null,
        adjustmentReason: String? = null,
        idempotencyKey: String? = null
    ): ApiResult<String> {
        val body = RepositoryHelpers.jsonBody {
            put("plan_id", planId.trim())
            if (!startDate.isNullOrBlank()) put("start_date", startDate.trim())
            if (!expiryDate.isNullOrBlank()) put("expiry_date", expiryDate.trim())
            if (!planPrice.isNullOrBlank()) put("plan_price", planPrice.trim())
            if (!discountAmount.isNullOrBlank()) put("discount_amount", discountAmount.trim())
            if (!finalFee.isNullOrBlank()) put("final_fee", finalFee.trim())
            if (!amountPaid.isNullOrBlank()) put("amount_paid", amountPaid.trim())
            if (!remainingDue.isNullOrBlank()) put("remaining_due", remainingDue.trim())
            if (paymentMethod.isNotBlank()) put("payment_method", paymentMethod.trim().lowercase())
            if (!paymentStatus.isNullOrBlank()) put("payment_status", paymentStatus.trim().lowercase())
            if (!adjustmentReason.isNullOrBlank()) put("adjustment_reason", adjustmentReason.trim())
            if (!idempotencyKey.isNullOrBlank()) put("idempotency_key", idempotencyKey.trim())
        }
        return RepositoryHelpers.safeApiCall("owner/members/$memberId/renew", {
            api.renewMemberPlan(memberId, body)
        }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            JsonParserHelpers.firstNonBlankString(obj, "message", "status") ?: "Membership plan assigned."
        }
    }

    suspend fun reissueMemberQr(memberId: String): ApiResult<String> {
        return RepositoryHelpers.safeApiCall("owner/members/$memberId/reissue-qr", {
            api.reissueMemberQr(memberId)
        }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            val data = JsonParserHelpers.firstObject(obj, "data") ?: obj
            JsonParserHelpers.firstNonBlankString(data, "qr_token", "qr_credential", "qr_code")
                ?: error("Server did not return a new QR token.")
        }
    }

    suspend fun getMemberPayments(memberId: String): ApiResult<List<PaymentRecord>> {
        return RepositoryHelpers.safeApiCall("owner/members/$memberId/payments", {
            api.getMemberPayments(memberId)
        }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw)
            val arr = root?.let { JsonParserHelpers.firstArray(it, "payments", "data", "items") }
                ?: JsonParserHelpers.parseArrayOrNull(raw)
                ?: JSONArray()
            parsePaymentsArray(arr)
        }
    }

    suspend fun getMemberAttendance(memberId: String): ApiResult<List<AttendanceLogItem>> {
        return RepositoryHelpers.safeApiCall("owner/members/$memberId/attendance", {
            api.getMemberAttendance(memberId)
        }) { raw ->
            parseAttendanceLogs(raw)
        }
    }

    suspend fun getTodayAttendanceHistory(date: String? = null): ApiResult<List<AttendanceLogItem>> {
        return RepositoryHelpers.safeApiCall("owner/attendance", {
            api.getOwnerAttendanceHistory(date)
        }) { raw ->
            parseAttendanceLogs(raw)
        }
    }

    internal fun extractQrCredentialFromScan(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return ""

        if (trimmed.startsWith("{")) {
            val obj = JsonParserHelpers.parseObjectOrNull(trimmed)
            val jsonToken = JsonParserHelpers.firstNonBlankString(
                obj,
                "credential_token", "qr_token", "active_qr_token", "token", "member_code", "code"
            )
            if (!jsonToken.isNullOrBlank()) return jsonToken
        }

        if (trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true) ||
            trimmed.contains("://")
        ) {
            runCatching {
                val uri = URI(trimmed)
                val query = uri.rawQuery.orEmpty()
                if (query.isNotBlank()) {
                    val params = query.split("&").mapNotNull { pair ->
                        val idx = pair.indexOf('=')
                        if (idx <= 0) null else pair.substring(0, idx).lowercase() to pair.substring(idx + 1)
                    }.toMap()
                    val candidate = params["credential_token"]
                        ?: params["qr_token"]
                        ?: params["token"]
                        ?: params["member_code"]
                        ?: params["code"]
                    if (!candidate.isNullOrBlank()) return candidate.trim()
                }
                val lastSeg = uri.path?.trimEnd('/')?.substringAfterLast('/')?.trim()
                if (!lastSeg.isNullOrBlank() && lastSeg.length >= 6 && !lastSeg.equals("qr-checkin", ignoreCase = true)) {
                    return lastSeg
                }
            }
        }

        return trimmed
    }

    suspend fun submitQrCheckIn(credentialOrCode: String, isManualCode: Boolean = false): ApiResult<QrCheckInResult> {
        val clean = extractQrCredentialFromScan(credentialOrCode)
        val looksLikeQrToken = clean.startsWith("HQR-", ignoreCase = true) ||
            clean.startsWith("hem_qr_", ignoreCase = true) ||
            (!isManualCode && clean.length >= 12)
        val body = RepositoryHelpers.jsonBody {
            if (looksLikeQrToken) {
                put("credential_token", clean)
                put("qr_token", clean)
            } else {
                put("member_code", clean)
            }
        }
        val result = RepositoryHelpers.safeApiCall("owner/attendance/qr-checkin", { api.qrCheckIn(body) }) { raw ->
            parseQrCheckInSuccess(raw)
        }
        return when (result) {
            is ApiResult.Success -> result
            is ApiResult.HttpError -> {
                val isMissingEndpoint = result.isNotFound &&
                    (result.message.contains("endpoint not found", ignoreCase = true) ||
                        result.message.contains("API endpoint not available", ignoreCase = true))
                if (result.isUnauthorized || result.isForbidden || isMissingEndpoint) {
                    result
                } else {
                    ApiResult.Success(
                        QrCheckInResult(
                            outcome = classifyCheckInError(result.code, result.message),
                            message = result.message
                        )
                    )
                }
            }
            is ApiResult.NetworkError -> result
        }
    }

    suspend fun getPlans(): ApiResult<List<OwnerPlan>> {
        return RepositoryHelpers.safeApiCall("owner/plans", { api.getOwnerPlans() }) { raw ->
            parsePlansJson(raw)
        }
    }

    internal fun parsePlansJson(raw: String): List<OwnerPlan> {
        val root = JsonParserHelpers.parseObjectOrNull(raw)
        val arr = root?.let { JsonParserHelpers.firstArray(it, "plans", "data", "items") }
            ?: JsonParserHelpers.parseArrayOrNull(raw)
            ?: JSONArray()
        return buildList {
            for (i in 0 until arr.length()) {
                val p = arr.optJSONObject(i) ?: continue
                val rawPrice = JsonParserHelpers.firstNonBlankString(p, "price", "amount")
                val priceAmount = MembershipFeeCalculator.parseNumericAmount(rawPrice)
                val durationDaysRaw = JsonParserHelpers.firstNonBlankString(p, "duration_days", "days")
                val durationDays = durationDaysRaw?.filter { it.isDigit() }?.toIntOrNull()
                    ?: JsonParserHelpers.firstNonBlankString(p, "duration")?.filter { it.isDigit() }?.toIntOrNull()
                val durationLabel = durationDays?.let { "$it days" }
                    ?: JsonParserHelpers.firstNonBlankString(p, "duration", "duration_label", "billing_cycle")
                val statusStr = JsonParserHelpers.firstNonBlankString(p, "status")
                val activeFlag = JsonParserHelpers.firstBoolean(p, "is_active", "active")
                    ?: statusStr?.let {
                        !it.equals("inactive", ignoreCase = true) &&
                            !it.equals("deactivated", ignoreCase = true) &&
                            !it.equals("disabled", ignoreCase = true)
                    }
                    ?: true
                add(
                    OwnerPlan(
                        id = JsonParserHelpers.firstNonBlankString(p, "id") ?: "$i",
                        name = JsonParserHelpers.firstNonBlankString(p, "plan_name", "name") ?: "Plan",
                        price = rawPrice,
                        priceAmount = priceAmount,
                        durationDays = durationDays,
                        durationLabel = durationLabel,
                        planType = JsonParserHelpers.firstNonBlankString(p, "plan_type", "category"),
                        activeMemberCount = JsonParserHelpers.firstNonBlankString(p, "active_members", "members_count"),
                        description = JsonParserHelpers.firstNonBlankString(p, "description"),
                        isActive = activeFlag
                    )
                )
            }
        }
    }

    suspend fun createPlan(
        name: String,
        price: String,
        durationDays: String,
        planType: String,
        description: String
    ): ApiResult<OwnerPlan> {
        val body = RepositoryHelpers.jsonBody {
            put("name", name.trim())
            put("plan_name", name.trim())
            put("price", price.trim())
            put("duration_days", durationDays.trim())
            put("plan_type", planType.trim())
            put("description", description.trim())
        }
        return RepositoryHelpers.safeApiCall("owner/plans", { api.createOwnerPlan(body) }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val p = JsonParserHelpers.firstObject(obj, "plan", "data") ?: obj
            OwnerPlan(
                id = JsonParserHelpers.firstNonBlankString(p, "id") ?: "",
                name = JsonParserHelpers.firstNonBlankString(p, "plan_name", "name") ?: name,
                price = JsonParserHelpers.firstNonBlankString(p, "price", "amount") ?: price,
                durationLabel = JsonParserHelpers.firstNonBlankString(p, "duration_days", "duration") ?: "$durationDays days",
                planType = planType,
                activeMemberCount = JsonParserHelpers.firstNonBlankString(p, "active_members"),
                description = JsonParserHelpers.firstNonBlankString(p, "description") ?: description
            )
        }
    }

    suspend fun togglePlanActive(planId: String, active: Boolean): ApiResult<String> {
        val body = RepositoryHelpers.jsonBody {
            put("is_active", active)
        }
        return RepositoryHelpers.safeApiCall("owner/plans/$planId", { api.updateOwnerPlan(planId, body) }) { raw ->
            val obj = JsonParserHelpers.parseObjectOrNull(raw)
            JsonParserHelpers.firstNonBlankString(obj, "message") ?: "Plan updated."
        }
    }

    suspend fun getPayments(status: String? = null, search: String? = null): ApiResult<List<PaymentRecord>> {
        return RepositoryHelpers.safeApiCall("owner/payments", { api.getOwnerPayments(status, search) }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw)
            val arr = root?.let { JsonParserHelpers.firstArray(it, "payments", "data", "items", "transactions") }
                ?: JsonParserHelpers.parseArrayOrNull(raw)
                ?: JSONArray()
            parsePaymentsArray(arr)
        }
    }

    suspend fun recordManualPayment(request: ManualPaymentRequest): ApiResult<PaymentRecord> {
        val body = RepositoryHelpers.jsonBody {
            put("member_id", request.memberIdOrCode.trim())
            put("amount", request.amount.trim())
            put("payment_method", request.method.trim().lowercase())
            if (!request.planId.isNullOrBlank()) put("plan_id", request.planId.trim())
            if (!request.notes.isNullOrBlank()) put("notes", request.notes.trim())
        }
        return RepositoryHelpers.safeApiCall("owner/payments", { api.createManualPayment(body) }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val p = JsonParserHelpers.firstObject(root, "payment", "data") ?: root
            PaymentRecord(
                id = JsonParserHelpers.firstNonBlankString(p, "id") ?: "${System.currentTimeMillis()}",
                receiptNumber = JsonParserHelpers.firstNonBlankString(p, "receipt_number", "invoice_no"),
                memberName = JsonParserHelpers.firstNonBlankString(p, "member_name"),
                planName = JsonParserHelpers.firstNonBlankString(p, "plan_name"),
                amount = JsonParserHelpers.firstNonBlankString(p, "amount") ?: request.amount,
                status = JsonParserHelpers.firstNonBlankString(p, "status") ?: "Paid",
                method = JsonParserHelpers.firstNonBlankString(p, "payment_method", "method") ?: request.method,
                paidAt = JsonParserHelpers.firstNonBlankString(p, "paid_at", "created_at")
            )
        }
    }

    suspend fun getReports(from: String? = null, to: String? = null): ApiResult<OwnerReportSummary> {
        return RepositoryHelpers.safeApiCall("owner/reports", { api.getOwnerReports(from, to) }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val data = JsonParserHelpers.firstObject(root, "data", "summary", "report") ?: root
            val chartArr = JsonParserHelpers.firstArray(data, "monthly_revenue", "revenue_series", "chart")
            val chartSeries = buildList {
                if (chartArr != null) {
                    for (i in 0 until chartArr.length()) {
                        val pt = chartArr.optJSONObject(i) ?: continue
                        val label = JsonParserHelpers.firstNonBlankString(pt, "label", "month", "date") ?: continue
                        val value = JsonParserHelpers.firstNonBlankString(pt, "value", "amount", "total")?.toFloatOrNull() ?: 0f
                        add(label to value)
                    }
                }
            }
            OwnerReportSummary(
                periodLabel = JsonParserHelpers.firstNonBlankString(data, "period", "date_range"),
                totalMembers = JsonParserHelpers.firstNonBlankString(data, "total_members"),
                activeMembers = JsonParserHelpers.firstNonBlankString(data, "active_members"),
                totalAttendance = JsonParserHelpers.firstNonBlankString(data, "total_attendance", "attendance_count"),
                expiringSoonCount = JsonParserHelpers.firstNonBlankString(data, "expiring_soon", "expiring_count"),
                totalCollected = JsonParserHelpers.firstNonBlankString(data, "total_collected", "revenue"),
                totalPending = JsonParserHelpers.firstNonBlankString(data, "total_pending", "pending_fees"),
                monthlyRevenueBreakdown = chartSeries
            )
        }
    }

    suspend fun getSettings(): ApiResult<OwnerSettingsData> {
        return RepositoryHelpers.safeApiCall("owner/settings", { api.getOwnerSettings() }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val data = JsonParserHelpers.firstObject(root, "settings", "data", "gym") ?: root
            OwnerSettingsData(
                gymName = JsonParserHelpers.firstNonBlankString(data, "gym_name", "name"),
                gymLogoUrl = JsonParserHelpers.resolveAbsoluteAssetUrl(
                    JsonParserHelpers.firstNonBlankString(data, "logo_url", "gym_logo")
                ),
                ownerEmail = JsonParserHelpers.firstNonBlankString(data, "email", "owner_email"),
                phone = JsonParserHelpers.firstNonBlankString(data, "phone", "contact_phone"),
                address = JsonParserHelpers.firstNonBlankString(data, "address"),
                operatingHours = JsonParserHelpers.firstNonBlankString(data, "operating_hours", "hours"),
                attendanceRule = JsonParserHelpers.firstNonBlankString(data, "attendance_rule", "checkin_rule"),
                subscriptionPlan = JsonParserHelpers.firstNonBlankString(data, "subscription_plan", "plan_name"),
                subscriptionStatus = JsonParserHelpers.firstNonBlankString(data, "subscription_status", "status"),
                gatewayConfigured = JsonParserHelpers.firstBoolean(data, "gateway_configured"),
                gatewayProvider = JsonParserHelpers.firstNonBlankString(data, "gateway_provider", "provider")
            )
        }
    }

    suspend fun getSubscription(): ApiResult<OwnerSubscriptionData> {
        return RepositoryHelpers.safeApiCall("owner/subscription", { api.getOwnerSubscription() }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
            val data = JsonParserHelpers.firstObject(root, "subscription", "data") ?: root
            val featuresArr = JsonParserHelpers.firstArray(data, "features", "enabled_features") ?: JSONArray()
            val features = buildList {
                for (i in 0 until featuresArr.length()) {
                    val f = featuresArr.optString(i).trim()
                    if (f.isNotBlank()) add(f)
                }
            }
            OwnerSubscriptionData(
                planName = JsonParserHelpers.firstNonBlankString(data, "plan_name", "name"),
                status = JsonParserHelpers.firstNonBlankString(data, "status", "subscription_status"),
                renewalDate = JsonParserHelpers.firstNonBlankString(data, "renewal_date", "expires_at", "current_period_end"),
                daysRemaining = JsonParserHelpers.firstNonBlankString(data, "days_remaining", "remaining_days"),
                maxMembers = JsonParserHelpers.firstNonBlankString(data, "max_members"),
                maxBranches = JsonParserHelpers.firstNonBlankString(data, "max_branches"),
                features = features
            )
        }
    }

    suspend fun getNotifications(): ApiResult<List<OwnerNotificationItem>> {
        return RepositoryHelpers.safeApiCall("owner/notifications", { api.getOwnerNotifications() }) { raw ->
            val root = JsonParserHelpers.parseObjectOrNull(raw)
            val arr = root?.let { JsonParserHelpers.firstArray(it, "notifications", "data", "items") }
                ?: JsonParserHelpers.parseArrayOrNull(raw)
                ?: JSONArray()
            buildList {
                for (i in 0 until arr.length()) {
                    val n = arr.optJSONObject(i) ?: continue
                    add(
                        OwnerNotificationItem(
                            id = JsonParserHelpers.firstNonBlankString(n, "id") ?: "$i",
                            title = JsonParserHelpers.firstNonBlankString(n, "title") ?: "Gym Alert",
                            message = JsonParserHelpers.firstNonBlankString(n, "message", "body").orEmpty(),
                            category = JsonParserHelpers.firstNonBlankString(n, "category", "type") ?: "General",
                            createdAt = JsonParserHelpers.firstNonBlankString(n, "created_at", "timestamp"),
                            isRead = JsonParserHelpers.firstBoolean(n, "is_read", "read") ?: false
                        )
                    )
                }
            }
        }
    }

    private fun parseMemberObject(m: JSONObject, index: Int): MemberRecord {
        val planObj = JsonParserHelpers.firstObject(m, "plan", "membership_plan")
        return MemberRecord(
            id = JsonParserHelpers.firstNonBlankString(m, "id", "member_id") ?: "$index",
            memberCode = JsonParserHelpers.firstNonBlankString(
                m,
                "member_code", "membership_code", "membership_id", "code"
            ),
            name = JsonParserHelpers.firstNonBlankString(m, "full_name", "name", "member_name")
                ?: "Unnamed Member",
            email = JsonParserHelpers.firstNonBlankString(m, "email"),
            phone = JsonParserHelpers.firstNonBlankString(m, "phone", "mobile", "contact_number"),
            photoUrl = JsonParserHelpers.resolveAbsoluteAssetUrl(
                JsonParserHelpers.firstNonBlankString(m, "photo_url", "photo", "avatar", "profile_photo")
            ),
            planName = JsonParserHelpers.firstNonBlankString(planObj, "name", "plan_name")
                ?: JsonParserHelpers.firstNonBlankString(m, "plan_name", "membership_plan"),
            membershipStatus = JsonParserHelpers.firstNonBlankString(m, "membership_status", "status")
                ?: "Unknown",
            joiningDate = JsonParserHelpers.firstNonBlankString(m, "joining_date", "joined_at", "created_at"),
            startDate = JsonParserHelpers.firstNonBlankString(
                m,
                "membership_start_date", "start_date", "membership_start"
            ),
            expiryDate = JsonParserHelpers.firstNonBlankString(
                m,
                "membership_expiry_date", "expiry_date", "expires_at", "end_date"
            ),
            qrCredential = JsonParserHelpers.firstNonBlankString(
                m,
                "active_qr_token", "qr_token", "qr_credential", "qr_code", "attendance_token"
            ),
            pendingAmount = JsonParserHelpers.firstNonBlankString(
                m,
                "remaining_due", "pending_fees", "due_amount", "balance_due"
            ),
            assignedFee = JsonParserHelpers.firstNonBlankString(
                m,
                "assigned_fee", "plan_price", "membership_fee", "total_fee"
            ),
            planCurrentPrice = JsonParserHelpers.firstNonBlankString(planObj, "price", "amount")
                ?: JsonParserHelpers.firstNonBlankString(m, "plan_current_price", "catalog_plan_price"),
            discountAmount = JsonParserHelpers.firstNonBlankString(m, "discount_amount", "discount"),
            finalFee = JsonParserHelpers.firstNonBlankString(m, "final_fee", "net_fee", "payable_amount"),
            amountPaid = JsonParserHelpers.firstNonBlankString(m, "amount_paid", "paid_amount"),
            paymentStatus = JsonParserHelpers.firstNonBlankString(m, "payment_status", "fee_status"),
            feeSource = JsonParserHelpers.firstNonBlankString(m, "fee_source", "price_source"),
            adjustmentReason = JsonParserHelpers.firstNonBlankString(m, "adjustment_reason", "override_reason")
        )
    }

    private fun parsePaymentsArray(arr: JSONArray): List<PaymentRecord> = buildList {
        for (i in 0 until arr.length()) {
            val p = arr.optJSONObject(i) ?: continue
            add(
                PaymentRecord(
                    id = JsonParserHelpers.firstNonBlankString(p, "id") ?: "$i",
                    receiptNumber = JsonParserHelpers.firstNonBlankString(p, "receipt_number", "invoice_no"),
                    memberName = JsonParserHelpers.firstNonBlankString(p, "member_name", "full_name"),
                    planName = JsonParserHelpers.firstNonBlankString(p, "plan_name"),
                    amount = JsonParserHelpers.firstNonBlankString(p, "amount", "total_amount"),
                    status = JsonParserHelpers.firstNonBlankString(p, "status") ?: "Unknown",
                    method = JsonParserHelpers.firstNonBlankString(p, "payment_method", "method", "gateway"),
                    paidAt = JsonParserHelpers.firstNonBlankString(p, "paid_at", "created_at", "date")
                )
            )
        }
    }

    private fun parseAttendanceLogs(raw: String): List<AttendanceLogItem> {
        val root = JsonParserHelpers.parseObjectOrNull(raw)
        val arr = root?.let { JsonParserHelpers.firstArray(it, "records", "attendance", "checkins", "data") }
            ?: JsonParserHelpers.parseArrayOrNull(raw)
            ?: JSONArray()
        return buildList {
            for (i in 0 until arr.length()) {
                val r = arr.optJSONObject(i) ?: continue
                add(
                    AttendanceLogItem(
                        id = JsonParserHelpers.firstNonBlankString(r, "id") ?: "$i",
                        memberName = JsonParserHelpers.firstNonBlankString(r, "member_name", "full_name", "name") ?: "Member",
                        memberCode = JsonParserHelpers.firstNonBlankString(r, "member_code", "code"),
                        checkedInAt = JsonParserHelpers.firstNonBlankString(r, "checked_in_at", "timestamp", "time") ?: "-",
                        method = JsonParserHelpers.firstNonBlankString(r, "method", "source"),
                        status = JsonParserHelpers.firstNonBlankString(r, "status")
                    )
                )
            }
        }
    }

    private fun parseQrCheckInSuccess(raw: String): QrCheckInResult {
        val root = JsonParserHelpers.parseObjectOrNull(raw) ?: JSONObject()
        val data = JsonParserHelpers.firstObject(root, "data") ?: root
        val member = JsonParserHelpers.firstObject(data, "member") ?: JsonParserHelpers.firstObject(root, "member")
        val statusStr = JsonParserHelpers.firstNonBlankString(data, "status", "result", "outcome").orEmpty()
        val message = JsonParserHelpers.firstNonBlankString(root, "message", "detail")
            ?: JsonParserHelpers.firstNonBlankString(data, "message")
            ?: "Check-in processed."

        val duplicate = JsonParserHelpers.firstBoolean(data, "duplicate", "already_checked_in") == true ||
            statusStr.contains("duplicate", ignoreCase = true) ||
            message.contains("already checked", ignoreCase = true)
        val expired = statusStr.contains("expired", ignoreCase = true) ||
            message.contains("expired", ignoreCase = true)
        val invalid = statusStr.contains("invalid", ignoreCase = true) ||
            JsonParserHelpers.firstBoolean(root, "success") == false

        val outcome = when {
            duplicate -> CheckInOutcome.DUPLICATE
            expired -> CheckInOutcome.EXPIRED
            invalid -> CheckInOutcome.INVALID_QR
            else -> CheckInOutcome.SUCCESS
        }

        return QrCheckInResult(
            outcome = outcome,
            message = message,
            memberName = JsonParserHelpers.firstNonBlankString(member, "full_name", "name")
                ?: JsonParserHelpers.firstNonBlankString(data, "member_name"),
            memberCode = JsonParserHelpers.firstNonBlankString(member, "member_code", "membership_id", "code"),
            memberPhotoUrl = JsonParserHelpers.resolveAbsoluteAssetUrl(
                JsonParserHelpers.firstNonBlankString(member, "photo_url", "photo", "avatar")
            ),
            membershipStatus = JsonParserHelpers.firstNonBlankString(member, "membership_status", "status"),
            planName = JsonParserHelpers.firstNonBlankString(member, "plan_name")
                ?: JsonParserHelpers.firstNonBlankString(data, "plan_name"),
            expiryDate = JsonParserHelpers.firstNonBlankString(
                member,
                "membership_expiry_date", "expiry_date", "expires_at"
            ),
            checkedInAt = JsonParserHelpers.firstNonBlankString(data, "checked_in_at", "timestamp", "time")
        )
    }

    internal fun classifyCheckInError(code: Int, message: String): CheckInOutcome {
        val lower = message.lowercase()
        return when {
            code == 409 || "already" in lower || "duplicate" in lower -> CheckInOutcome.DUPLICATE
            "expired" in lower || "inactive" in lower || "suspend" in lower -> CheckInOutcome.EXPIRED
            code == 404 || code == 400 || code == 422 ||
                "invalid" in lower || "not found" in lower || "revoked" in lower -> CheckInOutcome.INVALID_QR
            else -> CheckInOutcome.ERROR
        }
    }
}
