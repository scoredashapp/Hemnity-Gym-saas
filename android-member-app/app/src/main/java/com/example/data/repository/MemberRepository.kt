package com.example.data.repository

import android.os.Build
import com.example.core.network.ApiErrorMapper
import com.example.core.network.AppError
import com.example.core.network.NetworkResult
import com.example.core.security.RoleGuard
import com.example.core.security.TokenStorage
import com.example.core.util.DateUtils
import com.example.data.remote.ChangePasswordRequestDto
import com.example.data.remote.DeviceTokenRequestDto
import com.example.data.remote.HemnityApiService
import com.example.data.remote.NotificationPreferencesDto
import com.example.data.remote.PaymentInitiateRequestDto
import com.example.data.remote.PaymentInitiateResponseDto
import com.example.data.remote.PaymentVerificationDto
import com.example.data.remote.RenewalRequestDto
import com.example.data.remote.RenewalResponseDto
import com.example.data.remote.UpdateProfileRequestDto
import com.example.domain.model.AttendanceMonthSummary
import com.example.domain.model.AttendanceRecord
import com.example.domain.model.CalendarDayInfo
import com.example.domain.model.CalendarDayState
import com.example.domain.model.DashboardSummary
import com.example.domain.model.DigitalIdCard
import com.example.domain.model.GymMembershipSummary
import com.example.domain.model.MemberNotification
import com.example.domain.model.MemberProfile
import com.example.domain.model.MembershipDetails
import com.example.domain.model.MembershipStatus
import com.example.domain.model.NotificationPreferences
import com.example.domain.model.NotificationType
import com.example.domain.model.NotificationsFeed
import com.example.domain.model.PaymentRecord
import com.example.domain.model.PaymentsOverview
import com.example.domain.model.PlatformInfo
import com.example.domain.model.RenewalRecord
import com.squareup.moshi.Moshi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MemberRepository(
    private val apiService: HemnityApiService,
    private val tokenStorage: TokenStorage,
    private val moshi: Moshi,
) {

    private fun activeGymId(): String? = tokenStorage.currentSession()?.selectedGymId

    private fun verifySessionIsMember(): AppError? {
        val session = tokenStorage.currentSession() ?: return AppError.Unauthorized()
        if (!RoleGuard.isAllowedMemberRole(session.role)) {
            return AppError.ForbiddenRole(RoleGuard.rejectionMessageFor(session.role))
        }
        return null
    }

    private suspend inline fun <T> safeMemberCall(crossinline block: suspend () -> T): NetworkResult<T> =
        withContext(Dispatchers.IO) {
            verifySessionIsMember()?.let { return@withContext NetworkResult.Failure(it) }
            runCatching { block() }.fold(
                onSuccess = { NetworkResult.Success(it) },
                onFailure = { NetworkResult.Failure(ApiErrorMapper.mapThrowable(it, moshi)) },
            )
        }

    suspend fun getPlatformInfo(): NetworkResult<PlatformInfo> = withContext(Dispatchers.IO) {
        runCatching {
            val p = apiService.getPublicLanding().platform
                ?: throw IllegalStateException("Platform settings unavailable.")
            PlatformInfo(
                softwareName = p.softwareName ?: "Hemnity Gym Management Software",
                supportEmail = p.supportEmail ?: "support@hemnity.in",
                supportPhone = p.supportPhone.orEmpty(),
                supportAddress = p.supportAddress.orEmpty(),
                legalPrivacySummary = p.legalPrivacySummary.orEmpty(),
                legalTermsSummary = p.legalTermsSummary.orEmpty(),
                announcementBanner = p.announcementBanner?.takeIf { it.isNotBlank() },
                maintenanceMode = p.maintenanceMode == "1" || p.maintenanceMode.equals("true", ignoreCase = true),
            )
        }.fold(
            onSuccess = { NetworkResult.Success(it) },
            onFailure = { NetworkResult.Failure(ApiErrorMapper.mapThrowable(it, moshi)) },
        )
    }

    suspend fun getDashboard(): NetworkResult<DashboardSummary> = safeMemberCall {
        val raw = apiService.getDashboard(activeGymId())
        val dto = raw.data ?: raw
        val expiry = dto.membershipExpiryDate ?: dto.expiryDate.orEmpty()
        val remaining = dto.remainingDays ?: DateUtils.calculateRemainingDays(expiry) ?: 0
        val status = MembershipStatus.fromRaw(dto.membershipStatus ?: dto.status, remaining)
        val gymId = dto.gymId ?: activeGymId().orEmpty()
        if (gymId.isNotBlank() && activeGymId().isNullOrBlank()) {
            tokenStorage.updateSelectedGymId(gymId)
        }
        DashboardSummary(
            memberName = dto.fullName ?: dto.memberName ?: tokenStorage.currentSession()?.memberName ?: "Member",
            memberPhotoUrl = dto.memberPhotoUrl ?: dto.photoUrl,
            gymId = gymId,
            gymName = dto.gymName ?: "Registered Gym",
            gymLogoUrl = dto.gymLogoUrl,
            membershipId = dto.memberCode ?: dto.membershipCode ?: dto.membershipId ?: "—",
            planName = dto.planName ?: "No Active Plan",
            status = status,
            startDate = dto.membershipStartDate ?: dto.startDate,
            expiryDate = expiry,
            remainingDays = remaining.coerceAtLeast(0),
            totalVisits = dto.totalVisits ?: 0,
            monthAttendance = dto.monthAttendance ?: 0,
            pendingFees = dto.pendingFees ?: 0.0,
            currencySymbol = dto.currencySymbol ?: "₹",
            unreadNotifications = dto.unreadNotifications ?: 0,
            gymsCount = dto.gymsCount ?: 1,
            todayCheckedIn = dto.todayCheckedIn ?: false,
            todayCheckinTime = dto.todayCheckinTime,
        )
    }

    suspend fun getMyGyms(): NetworkResult<List<GymMembershipSummary>> = safeMemberCall {
        val resp = apiService.getMyGyms()
        val list = resp.gyms ?: resp.items ?: resp.data ?: emptyList()
        val selectedId = resp.selectedGymId ?: activeGymId()
        list.map { item ->
            val gid = item.gymId ?: item.id.orEmpty()
            val expiry = item.membershipExpiryDate ?: item.expiryDate ?: item.expiresAt.orEmpty()
            val remaining = DateUtils.calculateRemainingDays(expiry)
            GymMembershipSummary(
                gymId = gid,
                gymName = item.gymName ?: item.name ?: "Gym",
                gymLogoUrl = item.gymLogoUrl ?: item.logoUrl,
                membershipId = item.memberCode ?: item.membershipCode ?: item.membershipId ?: "—",
                planName = item.planName ?: "Standard",
                status = MembershipStatus.fromRaw(item.status, remaining),
                expiryDate = expiry,
                city = item.city,
                isCurrent = item.isCurrent ?: (gid.isNotBlank() && gid == selectedId),
            )
        }
    }

    suspend fun switchActiveGym(gymId: String) {
        tokenStorage.updateSelectedGymId(gymId)
    }

    suspend fun getMembershipDetails(): NetworkResult<MembershipDetails> = safeMemberCall {
        val resp = apiService.getMemberships(activeGymId())
        val dto = resp.current ?: resp.membership ?: resp.data ?: resp.memberships?.firstOrNull()
            ?: throw IllegalStateException("No membership record found for the selected gym.")
        val expiry = dto.membershipExpiryDate ?: dto.expiryDate.orEmpty()
        val remaining = dto.remainingDays ?: DateUtils.calculateRemainingDays(expiry) ?: 0
        MembershipDetails(
            gymId = dto.gymId ?: activeGymId().orEmpty(),
            gymName = dto.gymName ?: "Registered Gym",
            membershipId = dto.memberCode ?: dto.membershipCode ?: dto.membershipId ?: "—",
            planName = dto.planName ?: "—",
            planDuration = dto.planDuration ?: dto.durationDays?.let { "$it days" } ?: "—",
            startDate = dto.membershipStartDate ?: dto.startDate.orEmpty(),
            expiryDate = expiry,
            remainingDays = remaining.coerceAtLeast(0),
            status = MembershipStatus.fromRaw(dto.status, remaining),
            membershipFee = dto.membershipFee ?: 0.0,
            currencySymbol = dto.currencySymbol ?: "₹",
            paymentStatus = dto.paymentStatus ?: "Unknown",
            renewalSupported = dto.renewalSupported ?: false,
            onlinePaymentEnabled = dto.onlinePaymentEnabled ?: false,
            renewalHistory = dto.renewalHistory.orEmpty().mapIndexed { idx, r ->
                RenewalRecord(
                    id = r.id ?: "ren_$idx",
                    planName = r.planName ?: "Renewal",
                    startDate = r.startDate.orEmpty(),
                    expiryDate = r.expiryDate.orEmpty(),
                    amount = r.amount ?: 0.0,
                    paymentStatus = r.paymentStatus ?: "Completed",
                    renewedAt = r.renewedAt ?: r.startDate.orEmpty(),
                )
            },
        )
    }

    suspend fun requestMembershipRenewal(membershipId: String): NetworkResult<RenewalResponseDto> = safeMemberCall {
        val gymId = activeGymId().orEmpty()
        apiService.requestRenewal(RenewalRequestDto(gymId = gymId, membershipId = membershipId))
    }

    suspend fun getAttendance(monthKey: String): NetworkResult<AttendanceMonthSummary> = safeMemberCall {
        val dto = apiService.getAttendance(activeGymId(), monthKey)
        val meta = DateUtils.monthGridInfo(monthKey)
        val dayMap = mutableMapOf<Int, CalendarDayInfo>()

        // Populate holidays first
        dto.holidays.orEmpty().forEach { h ->
            val dom = DateUtils.extractDayOfMonth(h.date) ?: return@forEach
            dayMap[dom] = CalendarDayInfo(
                date = h.date,
                dayOfMonth = dom,
                state = CalendarDayState.GYM_HOLIDAY,
                label = h.holidayName ?: h.label ?: "Gym Holiday",
            )
        }

        // Populate server calendar days
        dto.calendarDays.orEmpty().forEach { d ->
            val dom = DateUtils.extractDayOfMonth(d.date) ?: return@forEach
            val state = when (d.status?.trim()?.lowercase()) {
                "attended", "present", "checked_in" -> CalendarDayState.ATTENDED
                "holiday", "closed" -> CalendarDayState.GYM_HOLIDAY
                "absent" -> CalendarDayState.ABSENT
                "future" -> CalendarDayState.FUTURE
                else -> CalendarDayState.NO_RECORD
            }
            dayMap[dom] = CalendarDayInfo(
                date = d.date,
                dayOfMonth = dom,
                state = state,
                checkinTime = d.checkinTime,
                label = d.holidayName ?: d.label,
            )
        }

        // Merge attendance records if calendarDays didn't already mark them
        val records = (dto.history ?: dto.records).orEmpty().mapIndexed { idx, item ->
            val date = item.date.orEmpty()
            DateUtils.extractDayOfMonth(date)?.let { dom ->
                if (!dayMap.containsKey(dom) && date.startsWith(monthKey)) {
                    dayMap[dom] = CalendarDayInfo(
                        date = date,
                        dayOfMonth = dom,
                        state = CalendarDayState.ATTENDED,
                        checkinTime = item.checkinTime,
                    )
                }
            }
            AttendanceRecord(
                id = item.id ?: "att_$idx",
                date = date,
                checkinTime = item.checkinTime ?: "—",
                checkoutTime = item.checkoutTime,
                method = item.method,
                status = item.status ?: "Checked In",
            )
        }

        // Fill remaining days as FUTURE or NO_RECORD (never auto-mark absent!)
        for (day in 1..meta.daysInMonth) {
            if (!dayMap.containsKey(day)) {
                val millis = DateUtils.dayMillis(meta.year, meta.monthZeroBased, day)
                val state = if (millis > meta.todayMillis) CalendarDayState.FUTURE else CalendarDayState.NO_RECORD
                dayMap[day] = CalendarDayInfo(
                    date = DateUtils.isoDate(meta.year, meta.monthZeroBased, day),
                    dayOfMonth = day,
                    state = state,
                )
            }
        }

        AttendanceMonthSummary(
            monthKey = dto.month ?: monthKey,
            todayStatus = dto.todayStatus ?: "No Check-in Today",
            todayCheckinTime = dto.todayCheckinTime,
            totalVisits = dto.totalVisits ?: records.size,
            monthVisits = dto.monthVisits ?: dayMap.values.count { it.state == CalendarDayState.ATTENDED },
            attendanceStreak = dto.attendanceStreak ?: 0,
            calendarDays = dayMap,
            history = records,
        )
    }

    suspend fun getDigitalIdCard(): NetworkResult<DigitalIdCard> = safeMemberCall {
        val raw = apiService.getDigitalIdCard(activeGymId())
        val dto = raw.data ?: raw
        val expiry = dto.membershipExpiryDate ?: dto.expiryDate.orEmpty()
        val remaining = DateUtils.calculateRemainingDays(expiry)
        DigitalIdCard(
            gymId = dto.gymId ?: activeGymId().orEmpty(),
            gymName = dto.gymName ?: "Registered Gym",
            gymLogoUrl = dto.gymLogoUrl,
            memberName = dto.fullName ?: dto.memberName ?: tokenStorage.currentSession()?.memberName ?: "Member",
            memberPhotoUrl = dto.memberPhotoUrl,
            membershipId = dto.memberCode ?: dto.membershipCode ?: dto.membershipId ?: "—",
            planName = dto.planName ?: "—",
            expiryDate = expiry,
            status = MembershipStatus.fromRaw(dto.status, remaining),
            qrPayload = (dto.activeQrToken ?: dto.qrPayload ?: dto.qrToken)?.takeIf { it.isNotBlank() },
            qrExpiresAt = dto.qrExpiresAt,
            downloadPermitted = dto.downloadPermitted ?: true,
        )
    }

    suspend fun getPayments(page: Int = 1): NetworkResult<PaymentsOverview> = safeMemberCall {
        val dto = apiService.getPayments(activeGymId(), page)
        val currency = dto.currencySymbol ?: "₹"
        val items = (dto.payments ?: dto.items).orEmpty().mapIndexed { idx, p ->
            PaymentRecord(
                id = p.id ?: "pay_$idx",
                paymentDate = p.paymentDate.orEmpty(),
                amount = p.amount ?: 0.0,
                currencySymbol = p.currencySymbol ?: currency,
                method = p.paymentMethod ?: p.method ?: "—",
                status = p.status ?: "Pending",
                receiptNumber = p.receiptNumber ?: "—",
                planName = p.planName,
                receiptPdfUrl = p.receiptPdfUrl,
                receiptSupported = p.receiptSupported ?: !p.receiptNumber.isNullOrBlank(),
            )
        }
        PaymentsOverview(
            totalPaid = dto.totalPaid ?: 0.0,
            pendingFees = dto.pendingFees ?: 0.0,
            currencySymbol = currency,
            onlinePaymentEnabled = dto.onlinePaymentEnabled ?: false,
            gatewayName = dto.gatewayName,
            payments = items,
            page = dto.page ?: page,
            hasMore = dto.hasMore ?: false,
        )
    }

    suspend fun initiateOnlinePayment(
        paymentId: String? = null,
        membershipId: String? = null,
    ): NetworkResult<PaymentInitiateResponseDto> = safeMemberCall {
        apiService.initiatePayment(
            PaymentInitiateRequestDto(
                gymId = activeGymId().orEmpty(),
                paymentId = paymentId,
                membershipId = membershipId,
            )
        )
    }

    suspend fun verifyServerPaymentStatus(paymentId: String): NetworkResult<PaymentVerificationDto> = safeMemberCall {
        apiService.verifyPayment(paymentId = paymentId, gymId = activeGymId())
    }

    suspend fun downloadReceiptBytes(paymentId: String): NetworkResult<ByteArray> = safeMemberCall {
        val response = apiService.downloadReceiptPdf(paymentId, activeGymId())
        if (!response.isSuccessful) {
            throw retrofit2.HttpException(response)
        }
        response.body()?.bytes() ?: throw IllegalStateException("Receipt PDF body is empty.")
    }

    suspend fun getProfile(): NetworkResult<MemberProfile> = safeMemberCall {
        val raw = apiService.getProfile(activeGymId())
        val dto = raw.data ?: raw
        mapProfile(dto)
    }

    suspend fun updateProfile(
        fullName: String?,
        phone: String?,
        emergencyName: String?,
        emergencyPhone: String?,
        emergencyRelation: String?,
    ): NetworkResult<MemberProfile> = safeMemberCall {
        val raw = apiService.updateProfile(
            gymId = activeGymId(),
            request = UpdateProfileRequestDto(
                fullName = fullName,
                phone = phone,
                emergencyContactName = emergencyName,
                emergencyContactPhone = emergencyPhone,
                emergencyContactRelation = emergencyRelation,
            ),
        )
        mapProfile(raw.data ?: raw)
    }

    suspend fun changePassword(
        currentPassword: String,
        newPassword: String,
        confirmPassword: String,
    ): NetworkResult<String> = safeMemberCall {
        val resp = apiService.changePassword(
            ChangePasswordRequestDto(
                currentPassword = currentPassword,
                newPassword = newPassword,
                confirmPassword = confirmPassword,
            )
        )
        resp.message ?: "Password updated successfully."
    }

    suspend fun getNotifications(page: Int = 1): NetworkResult<NotificationsFeed> = safeMemberCall {
        val dto = apiService.getNotifications(activeGymId(), page)
        val list = (dto.notifications ?: dto.items).orEmpty().map { item ->
            MemberNotification(
                id = item.id,
                type = NotificationType.fromRaw(item.type),
                title = item.title ?: "Notification",
                message = item.message ?: item.body ?: "",
                createdAt = item.createdAt.orEmpty(),
                isRead = item.isRead ?: false,
                gymName = item.gymName,
            )
        }
        NotificationsFeed(
            items = list,
            unreadCount = dto.unreadCount ?: list.count { !it.isRead },
            page = dto.page ?: page,
            hasMore = dto.hasMore ?: false,
        )
    }

    suspend fun markNotificationRead(id: String): NetworkResult<Unit> = safeMemberCall {
        apiService.markNotificationRead(id)
        Unit
    }

    suspend fun markAllNotificationsRead(): NetworkResult<Unit> = safeMemberCall {
        apiService.markAllNotificationsRead(activeGymId())
        Unit
    }

    suspend fun updateNotificationPreferences(
        prefs: NotificationPreferences,
    ): NetworkResult<NotificationPreferences> = safeMemberCall {
        val res = apiService.updateNotificationPreferences(
            NotificationPreferencesDto(
                pushEnabled = prefs.pushEnabled,
                membershipAlerts = prefs.membershipAlerts,
                paymentAlerts = prefs.paymentAlerts,
                gymAnnouncements = prefs.gymAnnouncements,
            )
        )
        NotificationPreferences(
            pushEnabled = res.pushEnabled,
            membershipAlerts = res.membershipAlerts,
            paymentAlerts = res.paymentAlerts,
            gymAnnouncements = res.gymAnnouncements,
        )
    }

    suspend fun registerDeviceToken(token: String): NetworkResult<Unit> = safeMemberCall {
        apiService.registerDeviceToken(
            DeviceTokenRequestDto(
                token = token,
                platform = "android",
                deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            )
        )
        Unit
    }

    private fun mapProfile(dto: com.example.data.remote.MemberProfileDto): MemberProfile {
        val gyms = dto.gyms.orEmpty().map { g ->
            val gid = g.gymId ?: g.id.orEmpty()
            val expiry = g.expiryDate ?: g.expiresAt.orEmpty()
            GymMembershipSummary(
                gymId = gid,
                gymName = g.gymName ?: g.name ?: "Gym",
                gymLogoUrl = g.gymLogoUrl ?: g.logoUrl,
                membershipId = g.membershipCode ?: g.membershipId ?: "—",
                planName = g.planName ?: "—",
                status = MembershipStatus.fromRaw(g.status, DateUtils.calculateRemainingDays(expiry)),
                expiryDate = expiry,
                city = g.city,
                isCurrent = g.isCurrent ?: (gid == activeGymId()),
            )
        }
        return MemberProfile(
            id = dto.id ?: tokenStorage.currentSession()?.memberId.orEmpty(),
            fullName = dto.fullName ?: dto.name ?: tokenStorage.currentSession()?.memberName ?: "Member",
            phone = dto.phone ?: dto.mobile ?: "—",
            email = dto.email ?: tokenStorage.currentSession()?.memberEmail ?: "—",
            photoUrl = dto.photoUrl,
            joiningDate = dto.joiningDate ?: dto.dateOfJoining ?: dto.membershipStartDate.orEmpty(),
            emergencyContactName = dto.emergencyContact?.name,
            emergencyContactPhone = dto.emergencyContact?.phone,
            emergencyContactRelation = dto.emergencyContact?.relation,
            emergencyContactAuthorized = dto.emergencyContactAuthorized ?: (dto.emergencyContact != null),
            editableFields = dto.editableFields?.map { it.lowercase() }?.toSet() ?: emptySet(),
            gyms = gyms,
            notificationPreferences = dto.notificationPreferences?.let {
                NotificationPreferences(
                    pushEnabled = it.pushEnabled,
                    membershipAlerts = it.membershipAlerts,
                    paymentAlerts = it.paymentAlerts,
                    gymAnnouncements = it.gymAnnouncements,
                )
            } ?: NotificationPreferences(),
        )
    }
}
