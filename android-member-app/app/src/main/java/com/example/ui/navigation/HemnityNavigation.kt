package com.example.ui.navigation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CardMembership
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.QrCode2
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CardMembership
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.R
import com.example.core.di.AppContainer
import com.example.core.di.HemnityViewModelFactory
import com.example.core.network.SessionEvent
import com.example.ui.attendance.AttendanceScreen
import com.example.ui.attendance.AttendanceViewModel
import com.example.ui.auth.AuthViewModel
import com.example.ui.auth.LoginScreen
import com.example.ui.auth.SplashScreen
import com.example.ui.dashboard.DashboardScreen
import com.example.ui.dashboard.DashboardUiState
import com.example.ui.dashboard.DashboardViewModel
import com.example.ui.gyms.GymsViewModel
import com.example.ui.gyms.MyGymsScreen
import com.example.ui.idcard.IdCardScreen
import com.example.ui.idcard.IdCardViewModel
import com.example.ui.membership.MembershipScreen
import com.example.ui.membership.MembershipViewModel
import com.example.ui.notifications.NotificationsScreen
import com.example.ui.notifications.NotificationsViewModel
import com.example.ui.payments.PaymentsScreen
import com.example.ui.payments.PaymentsViewModel
import com.example.ui.profile.ProfileScreen
import com.example.ui.profile.ProfileViewModel
import com.example.ui.theme.OrangeContainerDark
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText

object HemnityRoutes {
    const val ROUTE_SPLASH = "splash"
    const val ROUTE_LOGIN = "login"
    const val ROUTE_MAIN = "main"
    const val ROUTE_MY_GYMS = "my_gyms"
    const val ROUTE_PAYMENTS = "payments"
    const val ROUTE_NOTIFICATIONS = "notifications"
}

enum class MemberTab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val testTag: String,
) {
    HOME("tab_home", "Home", Icons.Rounded.Home, Icons.Outlined.Home, "nav_tab_home"),
    MEMBERSHIP(
        "tab_membership",
        "Membership",
        Icons.Rounded.CardMembership,
        Icons.Outlined.CardMembership,
        "nav_tab_membership",
    ),
    ATTENDANCE(
        "tab_attendance",
        "Attendance",
        Icons.Rounded.CalendarMonth,
        Icons.Outlined.CalendarMonth,
        "nav_tab_attendance",
    ),
    ID_CARD("tab_id_card", "ID Card", Icons.Rounded.QrCode2, Icons.Outlined.QrCode2, "nav_tab_id_card"),
    PROFILE("tab_profile", "Profile", Icons.Rounded.Person, Icons.Outlined.Person, "nav_tab_profile"),
}

@Composable
fun HemnityAppNavHost(container: AppContainer) {
    val navController = rememberNavController()
    val factory = HemnityViewModelFactory(container)
    val authViewModel: AuthViewModel = viewModel(factory = factory)

    LaunchedEffect(container.sessionEventBus) {
        container.sessionEventBus.events.collect { event ->
            when (event) {
                is SessionEvent.SessionExpired -> {
                    authViewModel.setExternalSessionMessage(event.reason)
                    navController.navigate(HemnityRoutes.ROUTE_LOGIN) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                }
                is SessionEvent.PrivilegedRoleBlocked -> {
                    authViewModel.setExternalSessionMessage(event.message)
                    navController.navigate(HemnityRoutes.ROUTE_LOGIN) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = HemnityRoutes.ROUTE_SPLASH,
    ) {
        composable(HemnityRoutes.ROUTE_SPLASH) {
            SplashScreen(
                authViewModel = authViewModel,
                onNavigateToDashboard = {
                    navController.navigate(HemnityRoutes.ROUTE_MAIN) {
                        popUpTo(HemnityRoutes.ROUTE_SPLASH) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onNavigateToLogin = {
                    navController.navigate(HemnityRoutes.ROUTE_LOGIN) {
                        popUpTo(HemnityRoutes.ROUTE_SPLASH) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(HemnityRoutes.ROUTE_LOGIN) {
            LoginScreen(
                authViewModel = authViewModel,
                onLoginSuccess = {
                    navController.navigate(HemnityRoutes.ROUTE_MAIN) {
                        popUpTo(HemnityRoutes.ROUTE_LOGIN) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(HemnityRoutes.ROUTE_MAIN) {
            MainMemberShell(
                factory = factory,
                onOpenMyGyms = { navController.navigate(HemnityRoutes.ROUTE_MY_GYMS) },
                onOpenPayments = { navController.navigate(HemnityRoutes.ROUTE_PAYMENTS) },
                onOpenNotifications = { navController.navigate(HemnityRoutes.ROUTE_NOTIFICATIONS) },
                onLoggedOut = {
                    navController.navigate(HemnityRoutes.ROUTE_LOGIN) {
                        popUpTo(0) { inclusive = true }
                        launchSingleTop = true
                    }
                },
            )
        }

        composable(HemnityRoutes.ROUTE_MY_GYMS) {
            val gymsVm: GymsViewModel = viewModel(factory = factory)
            MyGymsScreen(
                viewModel = gymsVm,
                onGymSelected = {
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(HemnityRoutes.ROUTE_PAYMENTS) {
            val paymentsVm: PaymentsViewModel = viewModel(factory = factory)
            PaymentsScreen(
                viewModel = paymentsVm,
                onBack = { navController.popBackStack() },
            )
        }

        composable(HemnityRoutes.ROUTE_NOTIFICATIONS) {
            val notificationsVm: NotificationsViewModel = viewModel(factory = factory)
            NotificationsScreen(
                viewModel = notificationsVm,
                onBack = { navController.popBackStack() },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainMemberShell(
    factory: HemnityViewModelFactory,
    onOpenMyGyms: () -> Unit,
    onOpenPayments: () -> Unit,
    onOpenNotifications: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    var currentTab by rememberSaveable { mutableStateOf(MemberTab.HOME) }
    val dashboardVm: DashboardViewModel = viewModel(factory = factory)
    val membershipVm: MembershipViewModel = viewModel(factory = factory)
    val attendanceVm: AttendanceViewModel = viewModel(factory = factory)
    val idCardVm: IdCardViewModel = viewModel(factory = factory)
    val profileVm: ProfileViewModel = viewModel(factory = factory)

    val dashboardState by dashboardVm.uiState.collectAsStateWithLifecycle()
    val unreadCount = (dashboardState as? DashboardUiState.Success)?.data?.unreadNotifications ?: 0

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(PrimaryBackground),
    ) {
        val useRail = maxWidth >= 600.dp

        Scaffold(
            containerColor = PrimaryBackground,
            contentWindowInsets = WindowInsets.statusBars,
            topBar = {
                TopAppBar(
                    title = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.hemnity_logo),
                                contentDescription = "Hemnity Gym",
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(RoundedCornerShape(8.dp)),
                            )
                            Text(
                                text = when (currentTab) {
                                    MemberTab.HOME -> "Hemnity Member"
                                    MemberTab.MEMBERSHIP -> "My Membership"
                                    MemberTab.ATTENDANCE -> "Attendance"
                                    MemberTab.ID_CARD -> "Digital ID Card"
                                    MemberTab.PROFILE -> "Member Profile"
                                },
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    },
                    actions = {
                        IconButton(
                            onClick = onOpenNotifications,
                            modifier = Modifier.testTag("notifications_button"),
                        ) {
                            BadgedBox(
                                badge = {
                                    if (unreadCount > 0) {
                                        Badge(containerColor = PrimaryOrange) {
                                            Text(
                                                text = if (unreadCount > 9) "9+" else unreadCount.toString(),
                                                color = Color.White,
                                            )
                                        }
                                    }
                                },
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Notifications,
                                    contentDescription = "Notifications",
                                    tint = PrimaryText,
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = PrimaryBackground,
                        titleContentColor = PrimaryText,
                    ),
                )
            },
            bottomBar = {
                if (!useRail) {
                    NavigationBar(
                        containerColor = SecondaryBackground,
                        windowInsets = WindowInsets.navigationBars,
                    ) {
                        MemberTab.entries.forEach { tab ->
                            val selected = currentTab == tab
                            NavigationBarItem(
                                selected = selected,
                                onClick = { currentTab = tab },
                                icon = {
                                    Icon(
                                        imageVector = if (selected) tab.selectedIcon else tab.unselectedIcon,
                                        contentDescription = tab.label,
                                    )
                                },
                                label = {
                                    Text(
                                        text = tab.label,
                                        style = MaterialTheme.typography.labelMedium,
                                        maxLines = 1,
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = PrimaryOrange,
                                    selectedTextColor = PrimaryOrange,
                                    indicatorColor = OrangeContainerDark,
                                    unselectedIconColor = SecondaryText,
                                    unselectedTextColor = SecondaryText,
                                ),
                                modifier = Modifier.testTag(tab.testTag),
                            )
                        }
                    }
                }
            },
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
                if (useRail) {
                    NavigationRail(
                        containerColor = SecondaryBackground,
                    ) {
                        MemberTab.entries.forEach { tab ->
                            val selected = currentTab == tab
                            NavigationRailItem(
                                selected = selected,
                                onClick = { currentTab = tab },
                                icon = {
                                    Icon(
                                        imageVector = if (selected) tab.selectedIcon else tab.unselectedIcon,
                                        contentDescription = tab.label,
                                    )
                                },
                                label = { Text(tab.label) },
                                colors = NavigationRailItemDefaults.colors(
                                    selectedIconColor = PrimaryOrange,
                                    selectedTextColor = PrimaryOrange,
                                    indicatorColor = OrangeContainerDark,
                                    unselectedIconColor = SecondaryText,
                                    unselectedTextColor = SecondaryText,
                                ),
                                modifier = Modifier.testTag(tab.testTag),
                            )
                        }
                    }
                }

                Box(modifier = Modifier.weight(1f).fillMaxSize()) {
                    when (currentTab) {
                        MemberTab.HOME -> DashboardScreen(
                            viewModel = dashboardVm,
                            onOpenMyGyms = onOpenMyGyms,
                            onOpenMembership = { currentTab = MemberTab.MEMBERSHIP },
                            onOpenAttendance = { currentTab = MemberTab.ATTENDANCE },
                            onOpenIdCard = { currentTab = MemberTab.ID_CARD },
                            onOpenPayments = onOpenPayments,
                        )
                        MemberTab.MEMBERSHIP -> MembershipScreen(
                            viewModel = membershipVm,
                            onOpenPayments = onOpenPayments,
                        )
                        MemberTab.ATTENDANCE -> AttendanceScreen(
                            viewModel = attendanceVm,
                        )
                        MemberTab.ID_CARD -> IdCardScreen(
                            viewModel = idCardVm,
                        )
                        MemberTab.PROFILE -> ProfileScreen(
                            viewModel = profileVm,
                            onOpenMyGyms = onOpenMyGyms,
                            onOpenPayments = onOpenPayments,
                            onLoggedOut = onLoggedOut,
                        )
                    }
                }
            }
        }
    }
}
