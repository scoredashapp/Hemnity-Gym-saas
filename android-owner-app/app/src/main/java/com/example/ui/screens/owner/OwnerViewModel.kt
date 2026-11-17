package com.example.ui.screens.owner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.core.security.ThemePreferenceStorage
import com.example.data.repository.AuthRepository
import com.example.data.repository.OwnerRepository
import com.example.domain.model.ApiResult
import com.example.domain.model.AppThemeMode
import com.example.domain.model.AttendanceLogItem
import com.example.domain.model.AuthSession
import com.example.domain.model.CheckInOutcome
import com.example.domain.model.ExpiryAlert
import com.example.domain.model.ManualPaymentRequest
import com.example.domain.model.MemberRecord
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

sealed interface SectionState<out T> {
    data object Loading : SectionState<Nothing>
    data class Success<T>(val data: T) : SectionState<T>
    data class ExtensionRequired(val route: String, val message: String) : SectionState<Nothing>
    data class Error(val message: String) : SectionState<Nothing>
}

enum class MemberSortOption(val label: String) {
    NAME_ASC("Name"),
    EXPIRY_SOONEST("Expiry"),
    ID_NEWEST("Newest"),
    PENDING_DUE("Dues")
}

data class OwnerUiState(
    val session: AuthSession? = null,
    val dashboard: SectionState<OwnerDashboardData> = SectionState.Loading,
    val isRefreshingDashboard: Boolean = false,
    val dashboardRefreshError: String? = null,
    val members: SectionState<List<MemberRecord>> = SectionState.Loading,
    val isRefreshingMembers: Boolean = false,
    val membersRefreshError: String? = null,
    val memberSearchQuery: String = "",
    val memberFilter: String = "ALL",
    val memberSort: MemberSortOption = MemberSortOption.NAME_ASC,
    val selectedMember: MemberRecord? = null,
    val isRefreshingMemberDetail: Boolean = false,
    val memberDetailRefreshError: String? = null,
    val selectedMemberPayments: SectionState<List<PaymentRecord>>? = null,
    val selectedMemberAttendance: SectionState<List<AttendanceLogItem>>? = null,
    val memberActionFeedback: String? = null,
    val isAssigningPlan: Boolean = false,
    val isAddMemberOpen: Boolean = false,
    val isCreatingMember: Boolean = false,
    val createMemberError: String? = null,
    val isCheckingIn: Boolean = false,
    val lastScannedPayload: String? = null,
    val checkInResult: QrCheckInResult? = null,
    val checkInNetworkError: String? = null,
    val scannerPaused: Boolean = false,
    val todayAttendanceHistory: SectionState<List<AttendanceLogItem>> = SectionState.Loading,
    val isRefreshingAttendance: Boolean = false,
    val attendanceRefreshError: String? = null,
    val plans: SectionState<List<OwnerPlan>> = SectionState.Loading,
    val isRefreshingPlans: Boolean = false,
    val plansRefreshError: String? = null,
    val isCreatingPlan: Boolean = false,
    val planActionFeedback: String? = null,
    val payments: SectionState<List<PaymentRecord>> = SectionState.Loading,
    val isRefreshingPayments: Boolean = false,
    val paymentsRefreshError: String? = null,
    val paymentStatusFilter: String = "ALL",
    val paymentSearchQuery: String = "",
    val isRecordingPayment: Boolean = false,
    val paymentFeedback: String? = null,
    val reports: SectionState<OwnerReportSummary> = SectionState.Loading,
    val isRefreshingReports: Boolean = false,
    val reportsRefreshError: String? = null,
    val reportFromDate: String = "",
    val reportToDate: String = "",
    val notifications: SectionState<List<OwnerNotificationItem>> = SectionState.Loading,
    val isRefreshingNotifications: Boolean = false,
    val notificationsRefreshError: String? = null,
    val subscription: SectionState<OwnerSubscriptionData> = SectionState.Loading,
    val isRefreshingSubscription: Boolean = false,
    val subscriptionRefreshError: String? = null,
    val settings: SectionState<OwnerSettingsData> = SectionState.Loading,
    val isRefreshingSettings: Boolean = false,
    val settingsRefreshError: String? = null,
    val openApiSpecState: SectionState<String>? = null,
    val sessionCheckIns: List<AttendanceLogItem> = emptyList()
)

class OwnerViewModel(
    private val authRepository: AuthRepository,
    private val ownerRepository: OwnerRepository,
    private val themePreferences: ThemePreferenceStorage
) : ViewModel() {

    private val _uiState = MutableStateFlow(OwnerUiState(session = authRepository.getSavedSession()))
    val uiState: StateFlow<OwnerUiState> = _uiState.asStateFlow()

    private var lastQrProcessedAtMs: Long = 0L
    private var lastQrRawPayload: String? = null

    init {
        loadDashboard()
        loadMembers()
        loadPlans()
    }

    fun loadDashboard() {
        if (_uiState.value.isRefreshingDashboard) return
        val hasLoaded = _uiState.value.dashboard is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingDashboard = true,
                    dashboardRefreshError = null,
                    dashboard = if (hasLoaded) it.dashboard else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getDashboard()) {
                is ApiResult.Success -> {
                    val currentMembers = (_uiState.value.members as? SectionState.Success)?.data.orEmpty()
                    val enriched = enrichDashboardExpiryAlerts(res.data, currentMembers)
                    _uiState.update { current ->
                        val updatedSession = if (!enriched.gymName.isNullOrBlank()) {
                            current.session?.copy(
                                gymName = enriched.gymName,
                                gymId = enriched.gymId ?: current.session.gymId
                            )
                        } else {
                            current.session
                        }
                        current.copy(
                            dashboard = SectionState.Success(enriched),
                            session = updatedSession,
                            isRefreshingDashboard = false,
                            dashboardRefreshError = null
                        )
                    }
                }
                is ApiResult.HttpError -> {
                    _uiState.update { current ->
                        if (hasLoaded) {
                            current.copy(
                                isRefreshingDashboard = false,
                                dashboardRefreshError = res.message
                            )
                        } else {
                            current.copy(
                                dashboard = if (res.isNotFound) SectionState.ExtensionRequired("owner/dashboard", res.message)
                                else SectionState.Error(res.message),
                                isRefreshingDashboard = false
                            )
                        }
                    }
                }
                is ApiResult.NetworkError -> {
                    _uiState.update { current ->
                        if (hasLoaded) {
                            current.copy(
                                isRefreshingDashboard = false,
                                dashboardRefreshError = res.message
                            )
                        } else {
                            current.copy(
                                dashboard = SectionState.Error(res.message),
                                isRefreshingDashboard = false
                            )
                        }
                    }
                }
            }
        }
    }

    fun loadMembers(query: String = _uiState.value.memberSearchQuery) {
        if (_uiState.value.isRefreshingMembers) return
        val hasLoaded = _uiState.value.members is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingMembers = true,
                    membersRefreshError = null,
                    members = if (hasLoaded) it.members else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getMembers(query)) {
                is ApiResult.Success -> {
                    _uiState.update { current ->
                        val updatedDash = if (current.dashboard is SectionState.Success) {
                            SectionState.Success(enrichDashboardExpiryAlerts(current.dashboard.data, res.data))
                        } else {
                            current.dashboard
                        }
                        val refreshedSelected = current.selectedMember?.let { sel ->
                            res.data.firstOrNull { it.id == sel.id } ?: sel
                        }
                        current.copy(
                            members = SectionState.Success(res.data),
                            dashboard = updatedDash,
                            selectedMember = refreshedSelected,
                            isRefreshingMembers = false,
                            membersRefreshError = null
                        )
                    }
                }
                is ApiResult.HttpError -> {
                    _uiState.update { current ->
                        if (hasLoaded) {
                            current.copy(isRefreshingMembers = false, membersRefreshError = res.message)
                        } else {
                            current.copy(
                                members = if (res.isNotFound) SectionState.ExtensionRequired("owner/members", res.message)
                                else SectionState.Error(res.message),
                                isRefreshingMembers = false
                            )
                        }
                    }
                }
                is ApiResult.NetworkError -> {
                    _uiState.update { current ->
                        if (hasLoaded) {
                            current.copy(isRefreshingMembers = false, membersRefreshError = res.message)
                        } else {
                            current.copy(
                                members = SectionState.Error(res.message),
                                isRefreshingMembers = false
                            )
                        }
                    }
                }
            }
        }
    }

    fun onMemberSearchChanged(query: String) {
        _uiState.update { it.copy(memberSearchQuery = query) }
    }

    fun onMemberFilterSelected(filter: String) {
        _uiState.update { it.copy(memberFilter = filter) }
    }

    fun onMemberSortSelected(sort: MemberSortOption) {
        _uiState.update { it.copy(memberSort = sort) }
    }

    fun selectMember(member: MemberRecord?) {
        _uiState.update {
            it.copy(
                selectedMember = member,
                selectedMemberPayments = null,
                selectedMemberAttendance = null,
                memberActionFeedback = null,
                memberDetailRefreshError = null
            )
        }
        if (member != null) {
            loadMemberHistory(member.id)
            if (_uiState.value.plans !is SectionState.Success) {
                loadPlans()
            }
        }
    }

    fun refreshSelectedMember(memberId: String) {
        if (_uiState.value.isRefreshingMemberDetail) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshingMemberDetail = true, memberDetailRefreshError = null) }
            when (val membersRes = ownerRepository.getMembers()) {
                is ApiResult.Success -> {
                    _uiState.update { current ->
                        val updatedMember = membersRes.data.firstOrNull { it.id == memberId } ?: current.selectedMember
                        current.copy(
                            members = SectionState.Success(membersRes.data),
                            selectedMember = updatedMember
                        )
                    }
                }
                is ApiResult.HttpError -> {
                    _uiState.update { it.copy(memberDetailRefreshError = membersRes.message) }
                }
                is ApiResult.NetworkError -> {
                    _uiState.update { it.copy(memberDetailRefreshError = membersRes.message) }
                }
            }
            loadMemberHistory(memberId, preserveExisting = true)
            _uiState.update { it.copy(isRefreshingMemberDetail = false) }
        }
    }

    private fun loadMemberHistory(memberId: String, preserveExisting: Boolean = false) {
        viewModelScope.launch {
            if (!preserveExisting) {
                _uiState.update {
                    it.copy(
                        selectedMemberPayments = SectionState.Loading,
                        selectedMemberAttendance = SectionState.Loading
                    )
                }
            }
            val paymentsRes = ownerRepository.getMemberPayments(memberId)
            val attendanceRes = ownerRepository.getMemberAttendance(memberId)
            _uiState.update { current ->
                val paymentsState = when (paymentsRes) {
                    is ApiResult.Success -> SectionState.Success(paymentsRes.data)
                    is ApiResult.HttpError -> if (preserveExisting && current.selectedMemberPayments is SectionState.Success) {
                        current.selectedMemberPayments
                    } else if (paymentsRes.isNotFound) {
                        SectionState.ExtensionRequired("owner/members/$memberId/payments", paymentsRes.message)
                    } else {
                        SectionState.Error(paymentsRes.message)
                    }
                    is ApiResult.NetworkError -> if (preserveExisting && current.selectedMemberPayments is SectionState.Success) {
                        current.selectedMemberPayments
                    } else {
                        SectionState.Error(paymentsRes.message)
                    }
                }
                val attendanceState = when (attendanceRes) {
                    is ApiResult.Success -> SectionState.Success(attendanceRes.data)
                    is ApiResult.HttpError -> if (preserveExisting && current.selectedMemberAttendance is SectionState.Success) {
                        current.selectedMemberAttendance
                    } else if (attendanceRes.isNotFound) {
                        SectionState.ExtensionRequired("owner/members/$memberId/attendance", attendanceRes.message)
                    } else {
                        SectionState.Error(attendanceRes.message)
                    }
                    is ApiResult.NetworkError -> if (preserveExisting && current.selectedMemberAttendance is SectionState.Success) {
                        current.selectedMemberAttendance
                    } else {
                        SectionState.Error(attendanceRes.message)
                    }
                }
                current.copy(
                    selectedMemberPayments = paymentsState,
                    selectedMemberAttendance = attendanceState
                )
            }
        }
    }

    fun setAddMemberOpen(open: Boolean) {
        _uiState.update { it.copy(isAddMemberOpen = open, createMemberError = null) }
        if (open && _uiState.value.plans !is SectionState.Success) {
            loadPlans()
        }
    }

    fun createMember(request: NewMemberRequest) {
        if (_uiState.value.isCreatingMember) return
        if (request.fullName.isBlank() || request.phone.isBlank()) {
            _uiState.update { it.copy(createMemberError = "Full name and mobile phone are required.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isCreatingMember = true, createMemberError = null) }
            when (val res = ownerRepository.createMember(request)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isCreatingMember = false,
                            isAddMemberOpen = false,
                            selectedMember = res.data,
                            memberActionFeedback = "Member created successfully."
                        )
                    }
                    loadMembers()
                    loadDashboard()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(isCreatingMember = false, createMemberError = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(isCreatingMember = false, createMemberError = res.message) }
            }
        }
    }

    fun updateMember(request: UpdateMemberRequest) {
        viewModelScope.launch {
            when (val res = ownerRepository.updateMember(request)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            selectedMember = res.data,
                            memberActionFeedback = "Member details updated."
                        )
                    }
                    loadMembers()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(memberActionFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(memberActionFeedback = res.message) }
            }
        }
    }

    fun toggleMemberSuspension(member: MemberRecord) {
        val currentlyActive = member.membershipStatus.contains("active", ignoreCase = true)
        viewModelScope.launch {
            when (val res = ownerRepository.setMemberStatus(member.id, active = !currentlyActive)) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(memberActionFeedback = res.data) }
                    loadMembers()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(memberActionFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(memberActionFeedback = res.message) }
            }
        }
    }

    fun renewMemberPlan(
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
    ) {
        if (_uiState.value.isAssigningPlan) return
        viewModelScope.launch {
            _uiState.update { it.copy(isAssigningPlan = true, memberActionFeedback = null) }
            when (
                val res = ownerRepository.renewMemberPlan(
                    memberId = memberId,
                    planId = planId,
                    amountPaid = amountPaid,
                    startDate = startDate,
                    expiryDate = expiryDate,
                    planPrice = planPrice,
                    discountAmount = discountAmount,
                    finalFee = finalFee,
                    remainingDue = remainingDue,
                    paymentMethod = paymentMethod,
                    paymentStatus = paymentStatus,
                    adjustmentReason = adjustmentReason,
                    idempotencyKey = idempotencyKey
                )
            ) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(isAssigningPlan = false, memberActionFeedback = res.data) }
                    refreshSelectedMember(memberId)
                    loadDashboard()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(isAssigningPlan = false, memberActionFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(isAssigningPlan = false, memberActionFeedback = res.message) }
            }
        }
    }

    fun reissueMemberQr(memberId: String) {
        viewModelScope.launch {
            when (val res = ownerRepository.reissueMemberQr(memberId)) {
                is ApiResult.Success -> {
                    val updated = _uiState.value.selectedMember?.copy(qrCredential = res.data)
                    _uiState.update { current ->
                        val updatedList = (current.members as? SectionState.Success)?.data?.map { m ->
                            if (m.id == memberId) m.copy(qrCredential = res.data) else m
                        }
                        current.copy(
                            selectedMember = updated,
                            members = updatedList?.let { SectionState.Success(it) } ?: current.members,
                            memberActionFeedback = "New revocable QR credential issued."
                        )
                    }
                    loadMembers()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(memberActionFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(memberActionFeedback = res.message) }
            }
        }
    }

    fun onQrCodeDetected(rawPayload: String) {
        val clean = rawPayload.trim()
        val state = _uiState.value
        if (state.isCheckingIn || state.scannerPaused || clean.isBlank()) return
        val now = System.currentTimeMillis()
        if (clean == lastQrRawPayload && (now - lastQrProcessedAtMs) < 2500L) return
        lastQrRawPayload = clean
        lastQrProcessedAtMs = now
        submitCheckIn(clean, isManualCode = false)
    }

    fun submitManualCheckIn(code: String) {
        if (_uiState.value.isCheckingIn || code.isBlank()) return
        submitCheckIn(code.trim(), isManualCode = true)
    }

    private fun submitCheckIn(payload: String, isManualCode: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isCheckingIn = true,
                    scannerPaused = true,
                    lastScannedPayload = payload,
                    checkInResult = null,
                    checkInNetworkError = null
                )
            }
            when (val res = ownerRepository.submitQrCheckIn(payload, isManualCode)) {
                is ApiResult.Success -> {
                    val result = res.data
                    val timeLabel = result.checkedInAt ?: SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
                    val logEntry = AttendanceLogItem(
                        id = "session_${System.currentTimeMillis()}",
                        memberName = result.memberName ?: payload,
                        memberCode = result.memberCode,
                        checkedInAt = timeLabel,
                        method = if (isManualCode) "Manual Code" else "QR Scan",
                        status = when (result.outcome) {
                            CheckInOutcome.SUCCESS -> "Checked In"
                            CheckInOutcome.DUPLICATE -> "Duplicate"
                            CheckInOutcome.EXPIRED -> "Expired"
                            CheckInOutcome.INVALID_QR -> "Invalid QR"
                            CheckInOutcome.ERROR -> "Rejected"
                        }
                    )
                    _uiState.update {
                        it.copy(
                            isCheckingIn = false,
                            checkInResult = result,
                            sessionCheckIns = listOf(logEntry) + it.sessionCheckIns
                        )
                    }
                    loadTodayAttendanceHistory()
                    loadDashboard()
                }
                is ApiResult.HttpError -> {
                    val outcome = if (res.isForbidden) CheckInOutcome.ERROR else null
                    if (res.isForbidden) {
                        _uiState.update {
                            it.copy(
                                isCheckingIn = false,
                                checkInResult = QrCheckInResult(
                                    outcome = outcome ?: CheckInOutcome.ERROR,
                                    message = res.message
                                )
                            )
                        }
                    } else {
                        _uiState.update { it.copy(isCheckingIn = false, checkInNetworkError = res.message) }
                    }
                }
                is ApiResult.NetworkError -> _uiState.update { it.copy(isCheckingIn = false, checkInNetworkError = res.message) }
            }
        }
    }

    fun resumeScanner() {
        lastQrRawPayload = null
        _uiState.update {
            it.copy(
                scannerPaused = false,
                checkInResult = null,
                checkInNetworkError = null,
                lastScannedPayload = null
            )
        }
    }

    fun loadTodayAttendanceHistory() {
        if (_uiState.value.isRefreshingAttendance) return
        val hasLoaded = _uiState.value.todayAttendanceHistory is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingAttendance = true,
                    attendanceRefreshError = null,
                    todayAttendanceHistory = if (hasLoaded) it.todayAttendanceHistory else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getTodayAttendanceHistory()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        todayAttendanceHistory = SectionState.Success(res.data),
                        isRefreshingAttendance = false,
                        attendanceRefreshError = null
                    )
                }
                is ApiResult.HttpError -> _uiState.update {
                    if (hasLoaded) {
                        it.copy(isRefreshingAttendance = false, attendanceRefreshError = res.message)
                    } else {
                        it.copy(
                            todayAttendanceHistory = if (res.isNotFound) SectionState.ExtensionRequired("owner/attendance", res.message)
                            else SectionState.Error(res.message),
                            isRefreshingAttendance = false
                        )
                    }
                }
                is ApiResult.NetworkError -> _uiState.update {
                    if (hasLoaded) {
                        it.copy(isRefreshingAttendance = false, attendanceRefreshError = res.message)
                    } else {
                        it.copy(
                            todayAttendanceHistory = SectionState.Error(res.message),
                            isRefreshingAttendance = false
                        )
                    }
                }
            }
        }
    }

    fun loadPlans() {
        if (_uiState.value.isRefreshingPlans) return
        val hasLoaded = _uiState.value.plans is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingPlans = true,
                    plansRefreshError = null,
                    plans = if (hasLoaded) it.plans else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getPlans()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        plans = SectionState.Success(res.data),
                        isRefreshingPlans = false,
                        plansRefreshError = null
                    )
                }
                is ApiResult.HttpError -> _uiState.update {
                    if (hasLoaded) {
                        it.copy(isRefreshingPlans = false, plansRefreshError = res.message)
                    } else {
                        it.copy(
                            plans = if (res.isNotFound) SectionState.ExtensionRequired("owner/plans", res.message)
                            else SectionState.Error(res.message),
                            isRefreshingPlans = false
                        )
                    }
                }
                is ApiResult.NetworkError -> _uiState.update {
                    if (hasLoaded) {
                        it.copy(isRefreshingPlans = false, plansRefreshError = res.message)
                    } else {
                        it.copy(
                            plans = SectionState.Error(res.message),
                            isRefreshingPlans = false
                        )
                    }
                }
            }
        }
    }

    fun createPlan(name: String, price: String, durationDays: String, planType: String, description: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreatingPlan = true, planActionFeedback = null) }
            when (val res = ownerRepository.createPlan(name, price, durationDays, planType, description)) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(isCreatingPlan = false, planActionFeedback = "Membership plan created.") }
                    loadPlans()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(isCreatingPlan = false, planActionFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(isCreatingPlan = false, planActionFeedback = res.message) }
            }
        }
    }

    fun togglePlanActive(planId: String, active: Boolean) {
        viewModelScope.launch {
            when (val res = ownerRepository.togglePlanActive(planId, active)) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(planActionFeedback = res.data) }
                    loadPlans()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(planActionFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(planActionFeedback = res.message) }
            }
        }
    }

    fun loadPayments(
        status: String = _uiState.value.paymentStatusFilter,
        search: String = _uiState.value.paymentSearchQuery
    ) {
        if (_uiState.value.isRefreshingPayments) return
        val hasLoaded = _uiState.value.payments is SectionState.Success
        viewModelScope.launch {
            val queryStatus = status.takeIf { it != "ALL" }?.lowercase()
            val querySearch = search.trim().takeIf { it.isNotBlank() }
            _uiState.update {
                it.copy(
                    isRefreshingPayments = true,
                    paymentsRefreshError = null,
                    payments = if (hasLoaded) it.payments else SectionState.Loading,
                    paymentStatusFilter = status,
                    paymentSearchQuery = search
                )
            }
            when (val res = ownerRepository.getPayments(queryStatus, querySearch)) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(
                        payments = SectionState.Success(res.data),
                        isRefreshingPayments = false,
                        paymentsRefreshError = null
                    )
                }
                is ApiResult.HttpError -> _uiState.update {
                    if (hasLoaded) {
                        it.copy(isRefreshingPayments = false, paymentsRefreshError = res.message)
                    } else {
                        it.copy(
                            payments = if (res.isNotFound) SectionState.ExtensionRequired("owner/payments", res.message)
                            else SectionState.Error(res.message),
                            isRefreshingPayments = false
                        )
                    }
                }
                is ApiResult.NetworkError -> _uiState.update {
                    if (hasLoaded) {
                        it.copy(isRefreshingPayments = false, paymentsRefreshError = res.message)
                    } else {
                        it.copy(
                            payments = SectionState.Error(res.message),
                            isRefreshingPayments = false
                        )
                    }
                }
            }
        }
    }

    fun recordManualPayment(request: ManualPaymentRequest) {
        if (_uiState.value.isRecordingPayment) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRecordingPayment = true, paymentFeedback = null) }
            when (val res = ownerRepository.recordManualPayment(request)) {
                is ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            isRecordingPayment = false,
                            paymentFeedback = "Manual payment recorded (${res.data.receiptNumber ?: res.data.amount})."
                        )
                    }
                    loadPayments()
                    loadDashboard()
                    loadMembers()
                }
                is ApiResult.HttpError -> _uiState.update { it.copy(isRecordingPayment = false, paymentFeedback = res.message) }
                is ApiResult.NetworkError -> _uiState.update { it.copy(isRecordingPayment = false, paymentFeedback = res.message) }
            }
        }
    }

    fun loadReports(from: String = _uiState.value.reportFromDate, to: String = _uiState.value.reportToDate) {
        if (_uiState.value.isRefreshingReports) return
        val hasLoaded = _uiState.value.reports is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingReports = true,
                    reportsRefreshError = null,
                    reports = if (hasLoaded) it.reports else SectionState.Loading,
                    reportFromDate = from,
                    reportToDate = to
                )
            }
            when (val res = ownerRepository.getReports(from.ifBlank { null }, to.ifBlank { null })) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(reports = SectionState.Success(res.data), isRefreshingReports = false)
                }
                is ApiResult.HttpError -> _uiState.update { current ->
                    val nextState = if (res.isNotFound) {
                        deriveLiveReportFromDashboardAndMembers()
                            ?: SectionState.ExtensionRequired("owner/reports", res.message)
                    } else if (hasLoaded) {
                        current.reports
                    } else {
                        SectionState.Error(res.message)
                    }
                    current.copy(
                        reports = nextState,
                        isRefreshingReports = false,
                        reportsRefreshError = if (hasLoaded && !res.isNotFound) res.message else null
                    )
                }
                is ApiResult.NetworkError -> _uiState.update { current ->
                    if (hasLoaded) {
                        current.copy(isRefreshingReports = false, reportsRefreshError = res.message)
                    } else {
                        current.copy(reports = SectionState.Error(res.message), isRefreshingReports = false)
                    }
                }
            }
        }
    }

    fun loadNotifications() {
        if (_uiState.value.isRefreshingNotifications) return
        val hasLoaded = _uiState.value.notifications is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingNotifications = true,
                    notificationsRefreshError = null,
                    notifications = if (hasLoaded) it.notifications else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getNotifications()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(notifications = SectionState.Success(res.data), isRefreshingNotifications = false)
                }
                is ApiResult.HttpError -> _uiState.update { current ->
                    val nextState = if (res.isNotFound) {
                        deriveLiveNotifications()
                            ?: SectionState.ExtensionRequired("owner/notifications", res.message)
                    } else if (hasLoaded) {
                        current.notifications
                    } else {
                        SectionState.Error(res.message)
                    }
                    current.copy(
                        notifications = nextState,
                        isRefreshingNotifications = false,
                        notificationsRefreshError = if (hasLoaded && !res.isNotFound) res.message else null
                    )
                }
                is ApiResult.NetworkError -> _uiState.update { current ->
                    if (hasLoaded) {
                        current.copy(isRefreshingNotifications = false, notificationsRefreshError = res.message)
                    } else {
                        current.copy(notifications = SectionState.Error(res.message), isRefreshingNotifications = false)
                    }
                }
            }
        }
    }

    fun loadSubscription() {
        if (_uiState.value.isRefreshingSubscription) return
        val hasLoaded = _uiState.value.subscription is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingSubscription = true,
                    subscriptionRefreshError = null,
                    subscription = if (hasLoaded) it.subscription else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getSubscription()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(subscription = SectionState.Success(res.data), isRefreshingSubscription = false)
                }
                is ApiResult.HttpError -> _uiState.update { current ->
                    val nextState = if (res.isNotFound) {
                        deriveLiveSubscriptionFromDashboard()
                            ?: SectionState.ExtensionRequired("owner/subscription", res.message)
                    } else if (hasLoaded) {
                        current.subscription
                    } else {
                        SectionState.Error(res.message)
                    }
                    current.copy(
                        subscription = nextState,
                        isRefreshingSubscription = false,
                        subscriptionRefreshError = if (hasLoaded && !res.isNotFound) res.message else null
                    )
                }
                is ApiResult.NetworkError -> _uiState.update { current ->
                    if (hasLoaded) {
                        current.copy(isRefreshingSubscription = false, subscriptionRefreshError = res.message)
                    } else {
                        current.copy(subscription = SectionState.Error(res.message), isRefreshingSubscription = false)
                    }
                }
            }
        }
    }

    fun loadSettings() {
        if (_uiState.value.isRefreshingSettings) return
        val hasLoaded = _uiState.value.settings is SectionState.Success
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isRefreshingSettings = true,
                    settingsRefreshError = null,
                    settings = if (hasLoaded) it.settings else SectionState.Loading
                )
            }
            when (val res = ownerRepository.getSettings()) {
                is ApiResult.Success -> _uiState.update {
                    it.copy(settings = SectionState.Success(res.data), isRefreshingSettings = false)
                }
                is ApiResult.HttpError -> _uiState.update { current ->
                    val nextState = if (res.isNotFound) {
                        deriveLiveSettingsFromDashboard()
                            ?: SectionState.ExtensionRequired("owner/settings", res.message)
                    } else if (hasLoaded) {
                        current.settings
                    } else {
                        SectionState.Error(res.message)
                    }
                    current.copy(
                        settings = nextState,
                        isRefreshingSettings = false,
                        settingsRefreshError = if (hasLoaded && !res.isNotFound) res.message else null
                    )
                }
                is ApiResult.NetworkError -> _uiState.update { current ->
                    if (hasLoaded) {
                        current.copy(isRefreshingSettings = false, settingsRefreshError = res.message)
                    } else {
                        current.copy(settings = SectionState.Error(res.message), isRefreshingSettings = false)
                    }
                }
            }
        }
    }

    fun fetchOpenApiSpec() {
        viewModelScope.launch {
            _uiState.update { it.copy(openApiSpecState = SectionState.Loading) }
            val state = when (val res = authRepository.fetchOpenApiSpec()) {
                is ApiResult.Success -> SectionState.Success(res.data)
                is ApiResult.HttpError -> SectionState.Error(res.message)
                is ApiResult.NetworkError -> SectionState.Error(res.message)
            }
            _uiState.update { it.copy(openApiSpecState = state) }
        }
    }

    fun setThemeMode(mode: AppThemeMode) {
        viewModelScope.launch {
            themePreferences.setThemeMode(mode)
        }
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onLoggedOut()
        }
    }

    private fun enrichDashboardExpiryAlerts(
        dash: OwnerDashboardData,
        members: List<MemberRecord>
    ): OwnerDashboardData {
        if (dash.expiryAlerts.isNotEmpty() || members.isEmpty()) return dash
        val derived = members.mapNotNull { member ->
            val daysLeft = computeDaysUntilDate(member.expiryDate) ?: return@mapNotNull null
            if (daysLeft <= 35L) {
                ExpiryAlert(
                    memberId = member.id,
                    memberName = member.name,
                    expiryDate = member.expiryDate,
                    daysRemaining = daysLeft.toString(),
                    phone = member.phone,
                    status = if (daysLeft < 0L) "Expired" else member.membershipStatus
                )
            } else {
                null
            }
        }.sortedBy { it.daysRemaining?.toLongOrNull() ?: Long.MAX_VALUE }
        return dash.copy(expiryAlerts = derived)
    }

    private fun deriveLiveSubscriptionFromDashboard(): SectionState.Success<OwnerSubscriptionData>? {
        val dash = (_uiState.value.dashboard as? SectionState.Success)?.data ?: return null
        if (dash.subscriptionPlan == null && dash.subscriptionStatus == null) return null
        val daysLeft = computeDaysUntilDate(dash.subscriptionExpiry)?.toString()
        return SectionState.Success(
            OwnerSubscriptionData(
                planName = buildString {
                    append(dash.subscriptionPlan ?: "Subscription")
                    if (!dash.billingCycle.isNullOrBlank()) {
                        append(" (${dash.billingCycle.replaceFirstChar { it.uppercase() }})")
                    }
                },
                status = dash.subscriptionStatus,
                renewalDate = dash.subscriptionExpiry,
                daysRemaining = daysLeft,
                maxMembers = if (!dash.currentMembersCount.isNullOrBlank() && !dash.maxMembers.isNullOrBlank()) {
                    "${dash.currentMembersCount} / ${dash.maxMembers}"
                } else {
                    dash.maxMembers
                },
                maxBranches = dash.maxBranches,
                features = dash.enabledFeatures
            )
        )
    }

    private fun deriveLiveSettingsFromDashboard(): SectionState.Success<OwnerSettingsData>? {
        val dash = (_uiState.value.dashboard as? SectionState.Success)?.data ?: return null
        val session = _uiState.value.session
        return SectionState.Success(
            OwnerSettingsData(
                gymName = dash.gymName ?: session?.gymName,
                gymLogoUrl = dash.gymLogoUrl,
                ownerEmail = session?.userEmail,
                phone = null,
                address = dash.gymId?.let { "Tenant Gym ID #$it" },
                operatingHours = if (dash.canWriteOperations == false) {
                    "Read-only (${dash.restrictionReason ?: "Restricted"})"
                } else {
                    "Write Operations Active"
                },
                attendanceRule = if (dash.enabledFeatures.any { it.contains("Qr", ignoreCase = true) }) {
                    "QR Attendance Enabled"
                } else {
                    "Standard Check-In"
                },
                subscriptionPlan = dash.subscriptionPlan,
                subscriptionStatus = dash.subscriptionStatus,
                gatewayConfigured = dash.enabledFeatures.any { it.contains("Payment", ignoreCase = true) },
                gatewayProvider = "Server Webhook (HMAC-SHA256)"
            )
        )
    }

    private fun deriveLiveReportFromDashboardAndMembers(): SectionState.Success<OwnerReportSummary>? {
        val dash = (_uiState.value.dashboard as? SectionState.Success)?.data ?: return null
        val members = (_uiState.value.members as? SectionState.Success)?.data.orEmpty()
        val expiringSoon = members.count {
            val d = computeDaysUntilDate(it.expiryDate)
            d != null && d in 0L..30L
        }
        val planGroups = members
            .groupBy { it.planName?.ifBlank { null } ?: "Unassigned" }
            .map { (plan, list) -> plan to list.size.toFloat() }
        return SectionState.Success(
            OwnerReportSummary(
                periodLabel = "Live KPIs (${dash.gymName ?: "Gym"})",
                totalMembers = dash.totalMembers,
                activeMembers = dash.activeMembers,
                totalAttendance = dash.todayAttendance,
                expiringSoonCount = expiringSoon.toString(),
                totalCollected = dash.monthlyRevenue,
                totalPending = dash.pendingFees ?: "0",
                monthlyRevenueBreakdown = planGroups
            )
        )
    }

    private fun deriveLiveNotifications(): SectionState.Success<List<OwnerNotificationItem>>? {
        val dash = (_uiState.value.dashboard as? SectionState.Success)?.data ?: return null
        val members = (_uiState.value.members as? SectionState.Success)?.data.orEmpty()
        val alerts = buildList {
            if (!dash.restrictionReason.isNullOrBlank()) {
                add(
                    OwnerNotificationItem(
                        id = "sub_restriction",
                        title = "Subscription Notice",
                        message = dash.restrictionReason,
                        category = "Subscription",
                        createdAt = dash.subscriptionExpiry
                    )
                )
            }
            if (!dash.subscriptionPlan.isNullOrBlank()) {
                add(
                    OwnerNotificationItem(
                        id = "sub_status",
                        title = "${dash.subscriptionPlan} Plan (${dash.subscriptionStatus ?: "Active"})",
                        message = "Capacity: ${dash.currentMembersCount ?: dash.totalMembers ?: "0"} / ${dash.maxMembers ?: "-"} members. Period ends ${dash.subscriptionExpiry ?: "N/A"}.",
                        category = "SaaS Plan",
                        createdAt = dash.subscriptionExpiry
                    )
                )
            }
            members.forEach { m ->
                val days = computeDaysUntilDate(m.expiryDate)
                if (days != null && days <= 30L) {
                    add(
                        OwnerNotificationItem(
                            id = "exp_${m.id}",
                            title = if (days < 0L) "Membership Expired: ${m.name}" else "Expiring Soon: ${m.name}",
                            message = "${m.memberCode ?: m.id} • Plan: ${m.planName ?: "Unassigned"} • Expiry: ${m.expiryDate} ($days days)",
                            category = "Expiry",
                            createdAt = m.expiryDate
                        )
                    )
                } else if (m.planName.isNullOrBlank()) {
                    add(
                        OwnerNotificationItem(
                            id = "no_plan_${m.id}",
                            title = "Unassigned Plan: ${m.name}",
                            message = "${m.memberCode ?: m.id} currently has no membership plan or expiry date assigned.",
                            category = "Member",
                            createdAt = null
                        )
                    )
                }
            }
        }
        return SectionState.Success(alerts)
    }

    private fun computeDaysUntilDate(dateStr: String?): Long? {
        val clean = dateStr?.trim()?.take(10) ?: return null
        if (clean.length < 10) return null
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
        val target = runCatching { fmt.parse(clean) }.getOrNull() ?: return null
        val today = runCatching { fmt.parse(fmt.format(Date())) }.getOrNull() ?: return null
        val diffMs = target.time - today.time
        return TimeUnit.MILLISECONDS.toDays(diffMs)
    }
}
