package com.example.ui.screens.owner

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CurrencyRupee
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.domain.model.OwnerDashboardData
import com.example.ui.components.BackendExtensionRequiredCard
import com.example.ui.components.EmptyStateCard
import com.example.ui.components.HemnityCard
import com.example.ui.components.HemnityPullToRefreshBox
import com.example.ui.components.HemnityTopHeader
import com.example.ui.components.LoadingStatePanel
import com.example.ui.components.OfflineRetryState
import com.example.ui.components.RefreshErrorBanner
import com.example.ui.components.StatMetricCard
import com.example.ui.components.StatusBadge
import com.example.ui.theme.JetBrainsMonoFamily
import com.example.ui.theme.LocalHemnityColors
import com.example.ui.theme.OrangeAccent
import com.example.ui.theme.OrangePrimary

@Composable
fun OwnerDashboardScreen(
    uiState: OwnerUiState,
    onRefresh: () -> Unit,
    onOpenQrAttendance: () -> Unit,
    onOpenAddMember: () -> Unit,
    onOpenNotifications: () -> Unit,
    modifier: Modifier = Modifier
) {
    val dashState = uiState.dashboard
    val loadedData = (dashState as? SectionState.Success)?.data
    val gymTitle = loadedData?.gymName
        ?: uiState.session?.gymName?.takeIf { it.isNotBlank() }
        ?: "Hemnity Gym Owner"

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = gymTitle,
            subtitle = uiState.session?.userEmail?.takeIf { it.isNotBlank() } ?: "Gym Owner Workspace",
            logoUrl = loadedData?.gymLogoUrl,
            onRefresh = onRefresh,
            isRefreshing = uiState.isRefreshingDashboard,
            trailingAction = {
                IconButton(
                    onClick = onOpenNotifications,
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("dashboard_notifications_button")
                ) {
                    Icon(
                        imageVector = Icons.Filled.Notifications,
                        contentDescription = "Notifications",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingDashboard,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize()
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val refreshErr = uiState.dashboardRefreshError
                if (!refreshErr.isNullOrBlank()) {
                    item {
                        RefreshErrorBanner(message = refreshErr, onRetry = onRefresh)
                    }
                }
                when (dashState) {
                is SectionState.Loading -> {
                    item { LoadingStatePanel("Loading live gym metrics...") }
                }
                is SectionState.Error -> {
                    item {
                        OfflineRetryState(
                            message = dashState.message,
                            onRetry = onRefresh
                        )
                    }
                }
                is SectionState.ExtensionRequired -> {
                    item {
                        BackendExtensionRequiredCard(
                            featureTitle = "Owner Dashboard",
                            endpointRoute = dashState.route,
                            explanation = dashState.message,
                            onRetry = onRefresh
                        )
                    }
                }
                is SectionState.Success -> {
                    val data = dashState.data
                    item {
                        SaaSStatusBanner(data = data)
                    }

                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Button(
                                onClick = onOpenQrAttendance,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(50.dp)
                                    .testTag("quick_qr_checkin_button"),
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = OrangePrimary)
                            ) {
                                Icon(Icons.Filled.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Scan QR")
                            }
                            OutlinedButton(
                                onClick = onOpenAddMember,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(50.dp)
                                    .testTag("quick_add_member_button"),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Add Member")
                            }
                        }
                    }

                    item {
                        OwnerStatsGrid(data = data)
                    }

                    val activeInt = data.activeMembers?.filter { it.isDigit() }?.toIntOrNull()
                    val expiredInt = data.expiredMembers?.filter { it.isDigit() }?.toIntOrNull()
                    if (activeInt != null && expiredInt != null && (activeInt + expiredInt) > 0) {
                        item {
                            MemberHealthRatioChart(activeCount = activeInt, expiredCount = expiredInt)
                        }
                    }

                    item {
                        Text(
                            text = "Expiring Memberships",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onBackground,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }

                    if (data.expiryAlerts.isEmpty()) {
                        item {
                            EmptyStateCard(
                                title = "No Expiring Memberships",
                                description = "No upcoming expiry alerts were returned for this gym.",
                                icon = Icons.Filled.VerifiedUser
                            )
                        }
                    } else {
                        items(data.expiryAlerts, key = { it.memberId + (it.expiryDate ?: "") }) { alert ->
                            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = alert.memberName,
                                            style = MaterialTheme.typography.titleSmall,
                                            color = MaterialTheme.colorScheme.onSurface
                                        )
                                        val details = listOfNotNull(
                                            alert.expiryDate?.let { "Expires: $it" },
                                            alert.phone
                                        ).joinToString(" • ")
                                        if (details.isNotBlank()) {
                                            Text(
                                                text = details,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                    StatusBadge(
                                        text = alert.daysRemaining?.let { "$it days left" }
                                            ?: alert.status
                                            ?: "Expiring"
                                    )
                                }
                            }
                        }
                    }

                    if (data.recentPayments.isNotEmpty()) {
                        item {
                            Text(
                                text = "Recent Payments",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onBackground,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                        items(data.recentPayments, key = { it.id }) { p ->
                            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(p.memberName ?: "Payment", style = MaterialTheme.typography.titleSmall)
                                        Text(
                                            text = listOfNotNull(p.receiptNumber, p.paidAt).joinToString(" • "),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = p.amount ?: "Unavailable",
                                            style = MaterialTheme.typography.titleSmall.copy(fontFamily = JetBrainsMonoFamily)
                                        )
                                        StatusBadge(text = p.status)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun MemberHealthRatioChart(activeCount: Int, expiredCount: Int) {
    val total = (activeCount + expiredCount).coerceAtLeast(1)
    val activeFraction = activeCount.toFloat() / total.toFloat()
    val successColor = LocalHemnityColors.current.success
    val errorColor = MaterialTheme.colorScheme.error

    HemnityCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Membership Health", style = MaterialTheme.typography.titleSmall)
            Text(
                text = "${(activeFraction * 100).toInt()}% Active",
                style = MaterialTheme.typography.labelSmall.copy(fontFamily = JetBrainsMonoFamily),
                color = successColor
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(12.dp)
        ) {
            drawRoundRect(
                color = errorColor.copy(alpha = 0.7f),
                size = Size(size.width, size.height),
                cornerRadius = CornerRadius(12f, 12f)
            )
            drawRoundRect(
                color = successColor,
                size = Size(size.width * activeFraction, size.height),
                cornerRadius = CornerRadius(12f, 12f)
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Active: $activeCount", style = MaterialTheme.typography.bodySmall, color = successColor)
            Text("Expired: $expiredCount", style = MaterialTheme.typography.bodySmall, color = errorColor)
        }
    }
}

@Composable
private fun SaaSStatusBanner(data: OwnerDashboardData) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(MaterialTheme.shapes.medium)
            .background(
                Brush.linearGradient(
                    colors = listOf(
                        OrangePrimary.copy(alpha = 0.24f),
                        OrangeAccent.copy(alpha = 0.08f)
                    )
                )
            )
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Hemnity SaaS Subscription",
                    style = MaterialTheme.typography.labelMedium,
                    color = OrangeAccent,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = buildString {
                        append(data.subscriptionPlan ?: "Subscription Plan: Unavailable")
                        if (!data.billingCycle.isNullOrBlank()) {
                            append(" (${data.billingCycle.replaceFirstChar { it.uppercase() }})")
                        }
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground
                )
                val subDetails = listOfNotNull(
                    data.subscriptionExpiry?.let { "Renews: $it" },
                    if (!data.currentMembersCount.isNullOrBlank() && !data.maxMembers.isNullOrBlank()) {
                        "${data.currentMembersCount}/${data.maxMembers} members"
                    } else null
                ).joinToString(" • ")
                if (subDetails.isNotBlank()) {
                    Text(
                        text = subDetails,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            StatusBadge(text = data.subscriptionStatus ?: "Unavailable")
        }
    }
}

@Composable
private fun OwnerStatsGrid(data: OwnerDashboardData) {
    val semantic = LocalHemnityColors.current
    val formattedRevenue = data.monthlyRevenue?.let { rev ->
        if (rev.all { it.isDigit() || it == '.' }) "₹$rev" else rev
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StatMetricCard(
                label = "Total Members",
                value = data.totalMembers,
                icon = Icons.Filled.Group,
                accentColor = semantic.info,
                modifier = Modifier.weight(1f)
            )
            StatMetricCard(
                label = "Active Members",
                value = data.activeMembers,
                icon = Icons.Filled.CheckCircle,
                accentColor = semantic.success,
                modifier = Modifier.weight(1f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StatMetricCard(
                label = "Expired Members",
                value = data.expiredMembers,
                icon = Icons.Filled.ErrorOutline,
                accentColor = MaterialTheme.colorScheme.error,
                modifier = Modifier.weight(1f)
            )
            StatMetricCard(
                label = "Today's Attendance",
                value = data.todayAttendance,
                icon = Icons.Filled.QrCodeScanner,
                accentColor = OrangePrimary,
                modifier = Modifier.weight(1f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            StatMetricCard(
                label = "Monthly Revenue",
                value = formattedRevenue,
                icon = Icons.Filled.CurrencyRupee,
                accentColor = semantic.success,
                modifier = Modifier.weight(1f)
            )
            StatMetricCard(
                label = "Pending Fees",
                value = data.pendingFees,
                icon = Icons.Filled.AccountBalanceWallet,
                accentColor = semantic.warning,
                modifier = Modifier.weight(1f)
            )
        }
    }
}
