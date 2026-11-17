package com.example.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CardMembership
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.core.util.DateUtils
import com.example.domain.model.DashboardSummary
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnityGymAvatar
import com.example.ui.components.HemnityMemberAvatar
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.components.MembershipStatusBadge
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.ElevatedSurface
import com.example.ui.theme.OrangeContainerDark
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusActive
import com.example.ui.theme.StatusExpired
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onOpenMyGyms: () -> Unit,
    onOpenMembership: () -> Unit,
    onOpenAttendance: () -> Unit,
    onOpenIdCard: () -> Unit,
    onOpenPayments: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.loadDashboard()
    }

    val isRefreshing = uiState is DashboardUiState.Loading

    PullToRefreshBox(
        isRefreshing = false,
        onRefresh = { viewModel.loadDashboard() },
        modifier = Modifier
            .fillMaxSize()
            .testTag("dashboard_screen"),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 720.dp)
                .align(Alignment.TopCenter),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (val state = uiState) {
                is DashboardUiState.Loading -> {
                    item { HemnitySkeletonBox(height = 84.dp) }
                    item { HemnitySkeletonBox(height = 210.dp, cornerRadius = 24.dp) }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            HemnitySkeletonBox(modifier = Modifier.weight(1f), height = 104.dp)
                            HemnitySkeletonBox(modifier = Modifier.weight(1f), height = 104.dp)
                        }
                    }
                    item { HemnitySkeletonBox(height = 140.dp) }
                }

                is DashboardUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadDashboard() },
                        )
                    }
                }

                is DashboardUiState.Success -> {
                    val data = state.data
                    item {
                        DashboardWelcomeHeader(
                            data = data,
                            onSwitchGym = onOpenMyGyms,
                        )
                    }
                    item {
                        ActiveMembershipHeroCard(
                            data = data,
                            onClick = onOpenMembership,
                        )
                    }
                    item {
                        DashboardKpiGrid(
                            data = data,
                            onAttendanceClick = onOpenAttendance,
                            onPaymentsClick = onOpenPayments,
                        )
                    }
                    item {
                        QuickActionsSection(
                            onMembership = onOpenMembership,
                            onAttendance = onOpenAttendance,
                            onIdCard = onOpenIdCard,
                            onPayments = onOpenPayments,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardWelcomeHeader(
    data: DashboardSummary,
    onSwitchGym: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.weight(1f),
        ) {
            HemnityMemberAvatar(
                photoUrl = data.memberPhotoUrl,
                memberName = data.memberName,
                size = 54.dp,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Welcome Back!",
                    style = MaterialTheme.typography.labelLarge,
                    color = AccentOrange,
                )
                Text(
                    text = data.memberName,
                    style = MaterialTheme.typography.headlineMedium,
                    color = PrimaryText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    HemnityGymAvatar(
                        logoUrl = data.gymLogoUrl,
                        gymName = data.gymName,
                        size = 18.dp,
                    )
                    Text(
                        text = "Gym: ${data.gymName}",
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Surface(
            onClick = onSwitchGym,
            shape = RoundedCornerShape(14.dp),
            color = ElevatedSurface,
            border = BorderStroke(1.dp, CardBorderSubtle),
            modifier = Modifier
                .padding(start = 8.dp)
                .testTag("switch_gym_button"),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.SwapHoriz,
                    contentDescription = "Switch gym",
                    tint = PrimaryOrange,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = if (data.gymsCount > 1) "${data.gymsCount} Gyms" else "My Gyms",
                    style = MaterialTheme.typography.labelMedium,
                    color = PrimaryText,
                )
            }
        }
    }
}

@Composable
private fun ActiveMembershipHeroCard(
    data: DashboardSummary,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .clickable(onClick = onClick)
            .testTag("active_membership_hero_card"),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        border = BorderStroke(1.dp, PrimaryOrange.copy(alpha = 0.55f)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color(0xFF1E140E),
                            SecondaryBackground,
                            Color(0xFF14141A),
                        )
                    )
                )
                .padding(20.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            text = "ACTIVE MEMBERSHIP",
                            style = MaterialTheme.typography.labelSmall,
                            color = AccentOrange,
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = data.planName,
                            style = MaterialTheme.typography.headlineLarge,
                            color = PrimaryText,
                        )
                    }
                    MembershipStatusBadge(status = data.status)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            text = "Membership ID",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                        )
                        Text(
                            text = data.membershipId,
                            style = MaterialTheme.typography.labelSmall,
                            color = PrimaryText,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "Expires",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                        )
                        Text(
                            text = DateUtils.formatDisplayDate(data.expiryDate),
                            style = MaterialTheme.typography.titleSmall,
                            color = PrimaryText,
                        )
                    }
                }

                val progress = (data.remainingDays / 30f).coerceIn(0.04f, 1f)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Days Remaining",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                        )
                        Text(
                            text = "${data.remainingDays} days left",
                            style = MaterialTheme.typography.titleSmall,
                            color = PrimaryOrange,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(7.dp)
                            .clip(RoundedCornerShape(50)),
                        color = PrimaryOrange,
                        trackColor = ElevatedSurface,
                    )
                }

                if (data.todayCheckedIn) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(StatusActive.copy(alpha = 0.14f))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = "Checked in today",
                            tint = StatusActive,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            text = "Checked in today${data.todayCheckinTime?.let { " at $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = StatusActive,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DashboardKpiGrid(
    data: DashboardSummary,
    onAttendanceClick: () -> Unit,
    onPaymentsClick: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            KpiCard(
                title = "Total Gym Visits",
                value = data.totalVisits.toString(),
                subtitle = "All-time check-ins",
                icon = Icons.Rounded.FitnessCenter,
                accentColor = PrimaryOrange,
                onClick = onAttendanceClick,
                modifier = Modifier.weight(1f),
            )
            KpiCard(
                title = "This Month",
                value = data.monthAttendance.toString(),
                subtitle = "Monthly attendance",
                icon = Icons.Rounded.CalendarMonth,
                accentColor = AccentOrange,
                onClick = onAttendanceClick,
                modifier = Modifier.weight(1f),
            )
        }

        val hasPending = data.pendingFees > 0.0
        val formattedPending = String.format(Locale.US, "%s%.2f", data.currencySymbol, data.pendingFees)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .clickable(onClick = onPaymentsClick)
                .testTag("pending_fees_card"),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
            border = BorderStroke(
                1.dp,
                if (hasPending) StatusExpired.copy(alpha = 0.55f) else CardBorderSubtle,
            ),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (hasPending) StatusExpired.copy(alpha = 0.16f)
                                else StatusActive.copy(alpha = 0.14f)
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.AccountBalanceWallet,
                            contentDescription = "Pending membership fees",
                            tint = if (hasPending) StatusExpired else StatusActive,
                        )
                    }
                    Column {
                        Text(
                            text = "Pending Membership Fees",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                        )
                        Text(
                            text = formattedPending,
                            style = MaterialTheme.typography.headlineMedium,
                            color = if (hasPending) StatusExpired else PrimaryText,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = "View payments",
                    tint = SecondaryText,
                )
            }
        }
    }
}

@Composable
private fun KpiCard(
    title: String,
    value: String,
    subtitle: String,
    icon: ImageVector,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = accentColor,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(
                text = value,
                style = MaterialTheme.typography.displaySmall,
                color = PrimaryText,
            )
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = PrimaryText,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
            }
        }
    }
}

@Composable
private fun QuickActionsSection(
    onMembership: () -> Unit,
    onAttendance: () -> Unit,
    onIdCard: () -> Unit,
    onPayments: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "Quick Actions",
            style = MaterialTheme.typography.titleMedium,
            color = PrimaryText,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            QuickActionButton(
                label = "My Membership",
                icon = Icons.Rounded.CardMembership,
                onClick = onMembership,
                tag = "qa_membership",
                modifier = Modifier.weight(1f),
            )
            QuickActionButton(
                label = "My Attendance",
                icon = Icons.Rounded.CalendarMonth,
                onClick = onAttendance,
                tag = "qa_attendance",
                modifier = Modifier.weight(1f),
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            QuickActionButton(
                label = "Digital ID Card",
                icon = Icons.Rounded.QrCode2,
                onClick = onIdCard,
                tag = "qa_id_card",
                modifier = Modifier.weight(1f),
            )
            QuickActionButton(
                label = "My Payments",
                icon = Icons.Rounded.AccountBalanceWallet,
                onClick = onPayments,
                tag = "qa_payments",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun QuickActionButton(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    tag: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = SecondaryBackground,
        border = BorderStroke(1.dp, CardBorderSubtle),
        modifier = modifier.testTag(tag),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(OrangeContainerDark),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = label,
                    tint = PrimaryOrange,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                color = PrimaryText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
