package com.example.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.core.network.SessionEventBus
import com.example.di.AppContainer
import com.example.domain.model.AppThemeMode
import com.example.ui.components.HemnityAdaptiveScaffold
import com.example.ui.components.HemnityNavItem
import com.example.ui.screens.login.LoginScreen
import com.example.ui.screens.login.LoginViewModel
import com.example.ui.screens.owner.OwnerAttendanceScreen
import com.example.ui.screens.owner.OwnerDashboardScreen
import com.example.ui.screens.owner.OwnerIdCardsScreen
import com.example.ui.screens.owner.OwnerMembersScreen
import com.example.ui.screens.owner.OwnerMoreScreen
import com.example.ui.screens.owner.OwnerNotificationsScreen
import com.example.ui.screens.owner.OwnerPaymentsScreen
import com.example.ui.screens.owner.OwnerPlansScreen
import com.example.ui.screens.owner.OwnerProfileScreen
import com.example.ui.screens.owner.OwnerReportsScreen
import com.example.ui.screens.owner.OwnerSettingsScreen
import com.example.ui.screens.owner.OwnerSubscriptionScreen
import com.example.ui.screens.owner.OwnerViewModel
import com.example.ui.screens.splash.SplashScreen
import com.example.ui.screens.splash.SplashViewModel
import kotlinx.serialization.Serializable

@Serializable
object SplashRoute

@Serializable
object LoginRoute

@Serializable
object OwnerRootRoute

private enum class OwnerTab(val routeKey: String) {
    DASHBOARD("dashboard"),
    MEMBERS("members"),
    ATTENDANCE("attendance"),
    PAYMENTS("payments"),
    MORE("more")
}

private enum class OwnerMoreSubScreen {
    MENU,
    PLANS,
    REPORTS,
    ID_CARDS,
    NOTIFICATIONS,
    SUBSCRIPTION,
    SETTINGS,
    PROFILE
}

@Composable
fun HemnityAppNavHost(
    container: AppContainer,
    themeMode: AppThemeMode
) {
    val navController = rememberNavController()
    var sessionRevokedMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        SessionEventBus.sessionRevoked.collect { reason ->
            sessionRevokedMessage = reason
            navController.navigate(LoginRoute) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = SplashRoute
    ) {
        composable<SplashRoute> {
            val splashVm = remember { SplashViewModel(container.authRepository) }
            val destination by splashVm.destination.collectAsStateWithLifecycle()
            SplashScreen(
                destination = destination,
                onNavigateToLogin = {
                    navController.navigate(LoginRoute) {
                        popUpTo<SplashRoute> { inclusive = true }
                    }
                },
                onNavigateToOwner = {
                    navController.navigate(OwnerRootRoute) {
                        popUpTo<SplashRoute> { inclusive = true }
                    }
                }
            )
        }

        composable<LoginRoute> {
            val loginVm = remember { LoginViewModel(container.authRepository) }
            val uiState by loginVm.uiState.collectAsStateWithLifecycle()
            LoginScreen(
                uiState = uiState,
                sessionRevokedBanner = sessionRevokedMessage,
                onAuthModeSelected = loginVm::onAuthModeSelected,
                onEmailChanged = loginVm::onEmailChanged,
                onPasswordChanged = loginVm::onPasswordChanged,
                onBearerTokenChanged = loginVm::onBearerTokenChanged,
                onTogglePasswordVisibility = loginVm::togglePasswordVisibility,
                onOpenForgotPassword = loginVm::openForgotPassword,
                onCloseForgotPassword = loginVm::closeForgotPassword,
                onForgotEmailChanged = loginVm::onForgotEmailChanged,
                onSubmitForgotPassword = loginVm::submitForgotPassword,
                onSubmitLogin = {
                    sessionRevokedMessage = null
                    loginVm.submitLogin {
                        navController.navigate(OwnerRootRoute) {
                            popUpTo<LoginRoute> { inclusive = true }
                        }
                    }
                }
            )
        }

        composable<OwnerRootRoute> {
            val savedRole = container.tokenStorage.getSession()?.role
            if (savedRole?.isAuthorizedOwner != true) {
                LaunchedEffect(Unit) {
                    container.authRepository.clearLocalSession()
                    navController.navigate(LoginRoute) {
                        popUpTo(0) { inclusive = true }
                    }
                }
                return@composable
            }

            val ownerVm = remember {
                OwnerViewModel(
                    authRepository = container.authRepository,
                    ownerRepository = container.ownerRepository,
                    themePreferences = container.themePreferences
                )
            }
            val uiState by ownerVm.uiState.collectAsStateWithLifecycle()
            var currentTab by rememberSaveable { mutableStateOf(OwnerTab.DASHBOARD) }
            var moreSubScreen by rememberSaveable { mutableStateOf(OwnerMoreSubScreen.MENU) }
            var selectedIdCardMemberId by rememberSaveable { mutableStateOf<String?>(null) }

            val navItems = remember {
                listOf(
                    HemnityNavItem(
                        route = OwnerTab.DASHBOARD.routeKey,
                        label = "Dashboard",
                        selectedIcon = Icons.Filled.Dashboard,
                        unselectedIcon = Icons.Outlined.Dashboard,
                        testTag = "owner_nav_dashboard"
                    ),
                    HemnityNavItem(
                        route = OwnerTab.MEMBERS.routeKey,
                        label = "Members",
                        selectedIcon = Icons.Filled.Group,
                        unselectedIcon = Icons.Outlined.Group,
                        testTag = "owner_nav_members"
                    ),
                    HemnityNavItem(
                        route = OwnerTab.ATTENDANCE.routeKey,
                        label = "Attendance",
                        selectedIcon = Icons.Filled.QrCodeScanner,
                        unselectedIcon = Icons.Outlined.QrCodeScanner,
                        testTag = "owner_nav_attendance"
                    ),
                    HemnityNavItem(
                        route = OwnerTab.PAYMENTS.routeKey,
                        label = "Payments",
                        selectedIcon = Icons.Filled.Payments,
                        unselectedIcon = Icons.Outlined.Payments,
                        testTag = "owner_nav_payments"
                    ),
                    HemnityNavItem(
                        route = OwnerTab.MORE.routeKey,
                        label = "More",
                        selectedIcon = Icons.Filled.Menu,
                        unselectedIcon = Icons.Outlined.Menu,
                        testTag = "owner_nav_more"
                    )
                )
            }

            if (currentTab == OwnerTab.MORE && moreSubScreen != OwnerMoreSubScreen.MENU) {
                BackHandler {
                    moreSubScreen = OwnerMoreSubScreen.MENU
                }
            } else if (currentTab != OwnerTab.DASHBOARD) {
                BackHandler {
                    currentTab = OwnerTab.DASHBOARD
                }
            }

            HemnityAdaptiveScaffold(
                navItems = navItems,
                currentRoute = currentTab.routeKey,
                onNavigate = { routeKey ->
                    val next = OwnerTab.entries.firstOrNull { it.routeKey == routeKey } ?: OwnerTab.DASHBOARD
                    currentTab = next
                    if (next == OwnerTab.MORE) {
                        moreSubScreen = OwnerMoreSubScreen.MENU
                    }
                }
            ) { contentModifier ->
                when (currentTab) {
                    OwnerTab.DASHBOARD -> OwnerDashboardScreen(
                        uiState = uiState,
                        onRefresh = ownerVm::loadDashboard,
                        onOpenQrAttendance = { currentTab = OwnerTab.ATTENDANCE },
                        onOpenAddMember = {
                            currentTab = OwnerTab.MEMBERS
                            ownerVm.setAddMemberOpen(true)
                        },
                        onOpenNotifications = {
                            currentTab = OwnerTab.MORE
                            moreSubScreen = OwnerMoreSubScreen.NOTIFICATIONS
                        },
                        modifier = contentModifier
                    )
                    OwnerTab.MEMBERS -> OwnerMembersScreen(
                        uiState = uiState,
                        onSearchChanged = ownerVm::onMemberSearchChanged,
                        onExecuteSearch = { ownerVm.loadMembers() },
                        onFilterSelected = ownerVm::onMemberFilterSelected,
                        onSortSelected = ownerVm::onMemberSortSelected,
                        onSelectMember = ownerVm::selectMember,
                        onRefreshSelectedMember = ownerVm::refreshSelectedMember,
                        onOpenAddMember = ownerVm::setAddMemberOpen,
                        onRetryLoadPlans = ownerVm::loadPlans,
                        onCreateMember = ownerVm::createMember,
                        onUpdateMember = ownerVm::updateMember,
                        onToggleSuspendMember = ownerVm::toggleMemberSuspension,
                        onRenewMember = { memberId, planId, paid, start, expiry, price, disc, finalFee, due, method, status, reason, idemKey ->
                            ownerVm.renewMemberPlan(
                                memberId = memberId,
                                planId = planId,
                                amountPaid = paid,
                                startDate = start,
                                expiryDate = expiry,
                                planPrice = price,
                                discountAmount = disc,
                                finalFee = finalFee,
                                remainingDue = due,
                                paymentMethod = method,
                                paymentStatus = status,
                                adjustmentReason = reason,
                                idempotencyKey = idemKey
                            )
                        },
                        onReissueQr = ownerVm::reissueMemberQr,
                        onViewIdCard = { member ->
                            selectedIdCardMemberId = member.id
                            ownerVm.selectMember(null)
                            currentTab = OwnerTab.MORE
                            moreSubScreen = OwnerMoreSubScreen.ID_CARDS
                        },
                        onRefresh = { ownerVm.loadMembers() },
                        modifier = contentModifier
                    )
                    OwnerTab.ATTENDANCE -> OwnerAttendanceScreen(
                        uiState = uiState,
                        onQrDetected = ownerVm::onQrCodeDetected,
                        onManualCheckIn = ownerVm::submitManualCheckIn,
                        onResumeScanner = ownerVm::resumeScanner,
                        onRefreshHistory = ownerVm::loadTodayAttendanceHistory,
                        modifier = contentModifier
                    )
                    OwnerTab.PAYMENTS -> OwnerPaymentsScreen(
                        uiState = uiState,
                        onFilterStatus = ownerVm::loadPayments,
                        onRecordManualPayment = ownerVm::recordManualPayment,
                        onRefresh = { ownerVm.loadPayments() },
                        modifier = contentModifier
                    )
                    OwnerTab.MORE -> when (moreSubScreen) {
                        OwnerMoreSubScreen.MENU -> OwnerMoreScreen(
                            uiState = uiState,
                            onOpenPlans = { moreSubScreen = OwnerMoreSubScreen.PLANS },
                            onOpenReports = { moreSubScreen = OwnerMoreSubScreen.REPORTS },
                            onOpenIdCards = {
                                selectedIdCardMemberId = null
                                moreSubScreen = OwnerMoreSubScreen.ID_CARDS
                            },
                            onOpenNotifications = { moreSubScreen = OwnerMoreSubScreen.NOTIFICATIONS },
                            onOpenSubscription = { moreSubScreen = OwnerMoreSubScreen.SUBSCRIPTION },
                            onOpenSettings = { moreSubScreen = OwnerMoreSubScreen.SETTINGS },
                            onOpenProfile = { moreSubScreen = OwnerMoreSubScreen.PROFILE },
                            onLogout = {
                                ownerVm.logout {
                                    navController.navigate(LoginRoute) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            },
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.PLANS -> OwnerPlansScreen(
                            uiState = uiState,
                            onRefresh = ownerVm::loadPlans,
                            onCreatePlan = ownerVm::createPlan,
                            onTogglePlanActive = ownerVm::togglePlanActive,
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.REPORTS -> OwnerReportsScreen(
                            uiState = uiState,
                            onRefresh = ownerVm::loadReports,
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.ID_CARDS -> OwnerIdCardsScreen(
                            uiState = uiState,
                            initialSelectedMemberId = selectedIdCardMemberId,
                            onReissueQr = ownerVm::reissueMemberQr,
                            onRefreshMembers = { ownerVm.loadMembers() },
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.NOTIFICATIONS -> OwnerNotificationsScreen(
                            uiState = uiState,
                            onRefresh = ownerVm::loadNotifications,
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.SUBSCRIPTION -> OwnerSubscriptionScreen(
                            uiState = uiState,
                            onRefresh = ownerVm::loadSubscription,
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.SETTINGS -> OwnerSettingsScreen(
                            uiState = uiState,
                            currentThemeMode = themeMode,
                            onSelectThemeMode = ownerVm::setThemeMode,
                            onRefreshSettings = ownerVm::loadSettings,
                            onFetchOpenApiSpec = ownerVm::fetchOpenApiSpec,
                            onLogout = {
                                ownerVm.logout {
                                    navController.navigate(LoginRoute) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            },
                            modifier = contentModifier
                        )
                        OwnerMoreSubScreen.PROFILE -> OwnerProfileScreen(
                            uiState = uiState,
                            currentThemeMode = themeMode,
                            onSelectThemeMode = ownerVm::setThemeMode,
                            onLogout = {
                                ownerVm.logout {
                                    navController.navigate(LoginRoute) {
                                        popUpTo(0) { inclusive = true }
                                    }
                                }
                            },
                            modifier = contentModifier
                        )
                    }
                }
            }
        }
    }
}
