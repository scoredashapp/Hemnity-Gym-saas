package com.example.ui.screens.owner

import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.R
import com.example.core.qr.MediaStoreSaver
import com.example.domain.model.AppThemeMode
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
import com.example.ui.theme.OrangePrimary
import kotlinx.coroutines.launch

@Composable
fun OwnerReportsScreen(
    uiState: OwnerUiState,
    onRefresh: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) { onRefresh(uiState.reportFromDate, uiState.reportToDate) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var fromDate by remember { mutableStateOf(uiState.reportFromDate) }
    var toDate by remember { mutableStateOf(uiState.reportToDate) }

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "Reports & Analytics",
            subtitle = "Server-authorized financial & attendance totals",
            onRefresh = { onRefresh(fromDate, toDate) },
            isRefreshing = uiState.isRefreshingReports
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingReports,
            onRefresh = { onRefresh(fromDate, toDate) },
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val repErr = uiState.reportsRefreshError
                if (!repErr.isNullOrBlank()) {
                    RefreshErrorBanner(message = repErr, onRetry = { onRefresh(fromDate, toDate) })
                }
                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Text("Date Filter (YYYY-MM-DD)", style = MaterialTheme.typography.titleSmall)
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = fromDate, onValueChange = { fromDate = it }, label = { Text("From") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = toDate, onValueChange = { toDate = it }, label = { Text("To") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedButton(
                    onClick = { onRefresh(fromDate, toDate) },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text("Apply Date Filter")
                }
            }

            when (val state = uiState.reports) {
                is SectionState.Loading -> LoadingStatePanel("Fetching server reports...")
                is SectionState.Error -> OfflineRetryState(message = state.message, onRetry = { onRefresh(fromDate, toDate) })
                is SectionState.ExtensionRequired -> {
                    BackendExtensionRequiredCard(
                        featureTitle = "Owner Reports",
                        endpointRoute = state.route,
                        explanation = "Reports (Member, Attendance, Payment, Revenue, Expiring, Pending Fees) are calculated on the backend to preserve multi-tenant accuracy.",
                        onRetry = { onRefresh(fromDate, toDate) }
                    )
                }
                is SectionState.Success -> {
                    val r = state.data
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatMetricCard("Revenue Collected", r.totalCollected, Icons.Filled.Payments, modifier = Modifier.weight(1f))
                        StatMetricCard("Pending Fees", r.totalPending, Icons.Filled.Payments, modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatMetricCard("Attendance", r.totalAttendance, Icons.Filled.Assessment, modifier = Modifier.weight(1f))
                        StatMetricCard("Expiring Soon", r.expiringSoonCount, Icons.Filled.Assessment, modifier = Modifier.weight(1f))
                    }
                    if (r.monthlyRevenueBreakdown.isNotEmpty()) {
                        RevenueBarChart(series = r.monthlyRevenueBreakdown)
                    }
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                val res = MediaStoreSaver.saveTextPdfToDownloads(
                                    context = context,
                                    title = "Hemnity Gym Report (${r.periodLabel ?: "Current"})",
                                    lines = listOf(
                                        "Total Members: ${r.totalMembers ?: "Unavailable"}",
                                        "Active Members: ${r.activeMembers ?: "Unavailable"}",
                                        "Total Attendance: ${r.totalAttendance ?: "Unavailable"}",
                                        "Expiring Soon: ${r.expiringSoonCount ?: "Unavailable"}",
                                        "Revenue Collected: ${r.totalCollected ?: "Unavailable"}",
                                        "Pending Fees: ${r.totalPending ?: "Unavailable"}"
                                    ),
                                    fileNamePrefix = "hemnity_report"
                                )
                                Toast.makeText(
                                    context,
                                    res.fold({ "Exported PDF: $it" }, { "Export failed: ${it.message}" }),
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Icon(Icons.Filled.Download, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Export PDF Summary")
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun RevenueBarChart(series: List<Pair<String, Float>>) {
    val maxVal = (series.maxOfOrNull { it.second } ?: 1f).coerceAtLeast(1f)
    HemnityCard(modifier = Modifier.fillMaxWidth()) {
        Text("Revenue Trend", style = MaterialTheme.typography.titleSmall)
        Spacer(modifier = Modifier.height(12.dp))
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
        ) {
            val barWidth = size.width / (series.size * 2f)
            series.forEachIndexed { idx, (_, value) ->
                val barHeight = (value / maxVal) * size.height
                val x = idx * (barWidth * 2f) + (barWidth / 2f)
                drawRoundRect(
                    color = OrangePrimary,
                    topLeft = Offset(x, size.height - barHeight),
                    size = Size(barWidth, barHeight),
                    cornerRadius = CornerRadius(10f, 10f)
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            series.forEach { (label, _) ->
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun OwnerNotificationsScreen(
    uiState: OwnerUiState,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) { onRefresh() }

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "Notification Center",
            subtitle = "Expiries, payments, registrations & announcements",
            onRefresh = onRefresh,
            isRefreshing = uiState.isRefreshingNotifications
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingNotifications,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize()
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                val notifErr = uiState.notificationsRefreshError
                if (!notifErr.isNullOrBlank()) {
                    item { RefreshErrorBanner(message = notifErr, onRetry = onRefresh) }
                }
                when (val state = uiState.notifications) {
                is SectionState.Loading -> item { LoadingStatePanel("Loading gym alerts...") }
                is SectionState.Error -> item { OfflineRetryState(state.message, onRefresh) }
                is SectionState.ExtensionRequired -> item {
                    BackendExtensionRequiredCard(
                        featureTitle = "Notifications Center",
                        endpointRoute = state.route,
                        explanation = "Expiring membership alerts, payment receipts, and optional FCM push delivery are powered by /api/v1/owner/notifications.",
                        onRetry = onRefresh
                    )
                }
                is SectionState.Success -> {
                    if (state.data.isEmpty()) {
                        item {
                            EmptyStateCard(
                                title = "All Caught Up",
                                description = "No unread gym notifications at the moment.",
                                icon = Icons.Filled.Notifications
                            )
                        }
                    } else {
                        items(state.data, key = { it.id }) { n ->
                            HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = !n.isRead) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(n.title, style = MaterialTheme.typography.titleSmall)
                                    StatusBadge(text = n.category)
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(n.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
fun OwnerSubscriptionScreen(
    uiState: OwnerUiState,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) { onRefresh() }
    val dashSub = (uiState.dashboard as? SectionState.Success)?.data

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "SaaS Subscription",
            subtitle = "Your Hemnity Gym Owner plan & limits",
            onRefresh = onRefresh,
            isRefreshing = uiState.isRefreshingSubscription
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingSubscription,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val subErr = uiState.subscriptionRefreshError
                if (!subErr.isNullOrBlank()) {
                    RefreshErrorBanner(message = subErr, onRetry = onRefresh)
                }
                when (val state = uiState.subscription) {
                is SectionState.Loading -> LoadingStatePanel("Loading SaaS subscription...")
                is SectionState.Error -> OfflineRetryState(state.message, onRefresh)
                is SectionState.ExtensionRequired -> {
                    if (dashSub?.subscriptionPlan != null || dashSub?.subscriptionStatus != null) {
                        HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.WorkspacePremium, contentDescription = null, tint = OrangePrimary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(dashSub.subscriptionPlan ?: "Active Plan", style = MaterialTheme.typography.titleLarge)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            StatusBadge(text = dashSub.subscriptionStatus ?: "Unavailable")
                            if (!dashSub.subscriptionExpiry.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(6.dp))
                                Text("Renewal Date: ${dashSub.subscriptionExpiry}")
                            }
                        }
                    }
                    BackendExtensionRequiredCard(
                        featureTitle = "Detailed SaaS Limits",
                        endpointRoute = state.route,
                        explanation = "Extended plan limits and enabled feature flags require GET /api/v1/owner/subscription.",
                        onRetry = onRefresh
                    )
                }
                is SectionState.Success -> {
                    val s = state.data
                    HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(s.planName ?: "SaaS Plan", style = MaterialTheme.typography.titleLarge)
                            StatusBadge(text = s.status ?: "Unavailable")
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Renewal Date: ${s.renewalDate ?: "Unavailable"}")
                        Text("Days Remaining: ${s.daysRemaining ?: "Unavailable"}")
                        Text("Member Limit: ${s.maxMembers ?: "Unavailable"} • Branches: ${s.maxBranches ?: "Unavailable"}")
                        if (s.features.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Text("Enabled Features:", style = MaterialTheme.typography.titleSmall)
                            s.features.forEach { feat ->
                                Text("• $feat", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerSettingsScreen(
    uiState: OwnerUiState,
    currentThemeMode: AppThemeMode,
    onSelectThemeMode: (AppThemeMode) -> Unit,
    onRefreshSettings: () -> Unit,
    onFetchOpenApiSpec: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) { onRefreshSettings() }
    var showSpecSheet by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "Gym Settings",
            subtitle = "Gym profile, gateway status, security & API spec",
            onRefresh = onRefreshSettings,
            isRefreshing = uiState.isRefreshingSettings
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingSettings,
            onRefresh = onRefreshSettings,
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val setErr = uiState.settingsRefreshError
                if (!setErr.isNullOrBlank()) {
                    RefreshErrorBanner(message = setErr, onRetry = onRefreshSettings)
                }
                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Text("Appearance", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppThemeMode.entries.forEach { mode ->
                        FilterChip(
                            selected = currentThemeMode == mode,
                            onClick = { onSelectThemeMode(mode) },
                            label = { Text(mode.label) }
                        )
                    }
                }
            }

            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Security, contentDescription = null, tint = LocalHemnityColors.current.success)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Account Security", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text("Owner: ${uiState.session?.userEmail ?: "Unknown"}", style = MaterialTheme.typography.bodySmall)
                Text("Role: ${uiState.session?.rawRole?.ifBlank { "OWNER" } ?: "OWNER"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = "Tokens are encrypted with Android Keystore AES-256-GCM. Payment gateway secrets are never returned or shown in plaintext.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Code, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Live OpenAPI Specification", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Fetch GET /api/v1/docs/spec using your authenticated Gym Owner session.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedButton(
                    onClick = {
                        onFetchOpenApiSpec()
                        showSpecSheet = true
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text("Inspect OpenAPI Spec")
                }
            }

            when (val settings = uiState.settings) {
                is SectionState.Loading -> LoadingStatePanel("Loading gym settings...")
                is SectionState.Error -> OfflineRetryState(settings.message, onRefreshSettings)
                is SectionState.ExtensionRequired -> {
                    BackendExtensionRequiredCard(
                        featureTitle = "Gym Settings",
                        endpointRoute = settings.route,
                        explanation = settings.message,
                        onRetry = onRefreshSettings
                    )
                }
                is SectionState.Success -> {
                    val s = settings.data
                    HemnityCard(modifier = Modifier.fillMaxWidth()) {
                        Text("Gym Profile & Operations", style = MaterialTheme.typography.titleMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Gym Name: ${s.gymName ?: "Unavailable"}")
                        Text("Email: ${s.ownerEmail ?: "Unavailable"}")
                        Text("Phone: ${s.phone ?: "Unavailable"}")
                        Text("Address: ${s.address ?: "Unavailable"}")
                        Text("Operating Hours: ${s.operatingHours ?: "Unavailable"}")
                        Text("Attendance Rule: ${s.attendanceRule ?: "Unavailable"}")
                        Text("Gateway: ${s.gatewayProvider ?: "Unavailable"} (${if (s.gatewayConfigured == true) "Configured" else "Not configured"})")
                    }
                }
            }

            Button(
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().height(50.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out")
            }
        }
        }
    }

    if (showSpecSheet) {
        ModalBottomSheet(onDismissRequest = { showSpecSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp)
            ) {
                Text("GET /api/v1/docs/spec", style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(10.dp))
                when (val spec = uiState.openApiSpecState) {
                    null, is SectionState.Loading -> LoadingStatePanel("Fetching OpenAPI specification...")
                    is SectionState.Error -> Text(spec.message, color = MaterialTheme.colorScheme.error)
                    is SectionState.ExtensionRequired -> Text(spec.message)
                    is SectionState.Success -> {
                        Text(spec.data, style = MaterialTheme.typography.labelSmall.copy(fontFamily = JetBrainsMonoFamily))
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun OwnerProfileScreen(
    uiState: OwnerUiState,
    currentThemeMode: AppThemeMode,
    onSelectThemeMode: (AppThemeMode) -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "Owner Profile",
            subtitle = uiState.session?.userEmail ?: "Gym Owner Account"
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Text("Account Details", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Text("Name: ${uiState.session?.userName?.ifBlank { null } ?: "Unavailable"}")
                Text("Email: ${uiState.session?.userEmail ?: "Unavailable"}")
                Text("Gym: ${uiState.session?.gymName?.ifBlank { null } ?: "Authorized Gym Tenant"}")
                Text("Role: ${uiState.session?.rawRole?.ifBlank { "OWNER" } ?: "OWNER"}")
            }
            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Text("Theme", style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppThemeMode.entries.forEach { mode ->
                        FilterChip(
                            selected = currentThemeMode == mode,
                            onClick = { onSelectThemeMode(mode) },
                            label = { Text(mode.label) }
                        )
                    }
                }
            }
            Button(
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().height(50.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out")
            }
        }
    }
}
