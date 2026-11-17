package com.example.ui.screens.owner

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.CardMembership
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.core.qr.MediaStoreSaver
import com.example.domain.model.ManualPaymentRequest
import com.example.domain.model.PaymentRecord
import com.example.ui.components.BackendExtensionRequiredCard
import com.example.ui.components.EmptyStateCard
import com.example.ui.components.HemnityCard
import com.example.ui.components.HemnityPullToRefreshBox
import com.example.ui.components.HemnityTopHeader
import com.example.ui.components.LoadingStatePanel
import com.example.ui.components.OfflineRetryState
import com.example.ui.components.RefreshErrorBanner
import com.example.ui.components.StatusBadge
import com.example.ui.theme.JetBrainsMonoFamily
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerPaymentsScreen(
    uiState: OwnerUiState,
    onFilterStatus: (String, String) -> Unit,
    onRecordManualPayment: (ManualPaymentRequest) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) {
        if (uiState.payments is SectionState.Loading) onRefresh()
    }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedPayment by remember { mutableStateOf<PaymentRecord?>(null) }
    var showAddPaymentSheet by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf(uiState.paymentSearchQuery) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAddPaymentSheet = true },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = Color.White,
                modifier = Modifier.testTag("add_manual_payment_fab")
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Record manual payment")
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            HemnityTopHeader(
                title = "Payments & Receipts",
                subtitle = "Cash ledger & server-verified online payments",
                onRefresh = onRefresh,
                isRefreshing = uiState.isRefreshingPayments
            )

            OutlinedTextField(
                value = searchQuery,
                onValueChange = {
                    searchQuery = it
                    onFilterStatus(uiState.paymentStatusFilter, it)
                },
                placeholder = { Text("Filter by member or receipt #...") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf("ALL" to "All", "PAID" to "Collected", "PENDING" to "Pending").forEach { (key, label) ->
                    FilterChip(
                        selected = uiState.paymentStatusFilter == key,
                        onClick = { onFilterStatus(key, searchQuery) },
                        label = { Text(label) }
                    )
                }
            }

            if (!uiState.paymentFeedback.isNullOrBlank()) {
                Text(
                    text = uiState.paymentFeedback,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            HemnityPullToRefreshBox(
                isRefreshing = uiState.isRefreshingPayments,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize()
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    val payErr = uiState.paymentsRefreshError
                    if (!payErr.isNullOrBlank()) {
                        item { RefreshErrorBanner(message = payErr, onRetry = onRefresh) }
                    }
                    when (val state = uiState.payments) {
                    is SectionState.Loading -> item { LoadingStatePanel("Loading verified payments...") }
                    is SectionState.Error -> item { OfflineRetryState(state.message, onRefresh) }
                    is SectionState.ExtensionRequired -> {
                        val dashRev = (uiState.dashboard as? SectionState.Success)?.data?.monthlyRevenue
                        if (!dashRev.isNullOrBlank()) {
                            item {
                                HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                                    Text("Live Monthly Revenue (from /owner/dashboard)", style = MaterialTheme.typography.titleSmall)
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = if (dashRev.all { it.isDigit() || it == '.' }) "₹$dashRev" else dashRev,
                                        style = MaterialTheme.typography.headlineSmall.copy(fontFamily = JetBrainsMonoFamily),
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                        item {
                            BackendExtensionRequiredCard(
                                featureTitle = "Owner Payments",
                                endpointRoute = state.route,
                                explanation = "Live audit confirmed /api/v1/owner/payments is not yet exposed on gym.hemnity.in. Online payment webhooks (/webhooks/payment) remain strictly server-to-server.",
                                onRetry = onRefresh
                            )
                        }
                    }
                    is SectionState.Success -> {
                        if (state.data.isEmpty()) {
                            item {
                                EmptyStateCard(
                                    title = "No Payment Records",
                                    description = "No verified payments match the selected filter.",
                                    icon = Icons.Filled.Payments
                                )
                            }
                        } else {
                            items(state.data, key = { it.id }) { p ->
                                HemnityCard(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { selectedPayment = p }
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(p.memberName ?: "Member Payment", style = MaterialTheme.typography.titleMedium)
                                            Text(
                                                text = listOfNotNull(p.receiptNumber, p.planName, p.paidAt, p.method).joinToString(" • "),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        Column(horizontalAlignment = Alignment.End) {
                                            Text(
                                                text = p.amount ?: "Unavailable",
                                                style = MaterialTheme.typography.titleMedium.copy(fontFamily = JetBrainsMonoFamily)
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

    val receipt = selectedPayment
    if (receipt != null) {
        ModalBottomSheet(onDismissRequest = { selectedPayment = null }) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Payment Receipt", style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(10.dp))
                Text("Receipt #: ${receipt.receiptNumber ?: "Unavailable"}")
                Text("Member: ${receipt.memberName ?: "Unavailable"}")
                Text("Plan: ${receipt.planName ?: "Unavailable"}")
                Text("Amount: ${receipt.amount ?: "Unavailable"}")
                Text("Method: ${receipt.method ?: "Unavailable"}")
                Text("Status: ${receipt.status}")
                Text("Paid At: ${receipt.paidAt ?: "Unavailable"}")
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            val res = MediaStoreSaver.saveTextPdfToDownloads(
                                context = context,
                                title = "Hemnity Gym Payment Receipt",
                                lines = listOf(
                                    "Receipt #: ${receipt.receiptNumber ?: "N/A"}",
                                    "Member: ${receipt.memberName ?: "N/A"}",
                                    "Plan: ${receipt.planName ?: "N/A"}",
                                    "Amount: ${receipt.amount ?: "N/A"}",
                                    "Method: ${receipt.method ?: "N/A"}",
                                    "Status: ${receipt.status}",
                                    "Date: ${receipt.paidAt ?: "N/A"}"
                                ),
                                fileNamePrefix = "hemnity_receipt"
                            )
                            val msg = res.fold(
                                onSuccess = { "Saved PDF receipt: $it" },
                                onFailure = { "PDF save failed: ${it.message}" }
                            )
                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Icon(Icons.Filled.Download, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Download PDF Receipt")
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    if (showAddPaymentSheet) {
        var memberId by remember { mutableStateOf("") }
        var amount by remember { mutableStateOf("") }
        var method by remember { mutableStateOf("CASH") }
        var planId by remember { mutableStateOf("") }
        var notes by remember { mutableStateOf("") }

        ModalBottomSheet(onDismissRequest = { showAddPaymentSheet = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp)
            ) {
                Text("Record Manual Payment", style = MaterialTheme.typography.titleLarge)
                Text(
                    text = "For Cash / UPI desk payments. Online gateway webhooks remain server-verified.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(value = memberId, onValueChange = { memberId = it }, label = { Text("Member ID or Code *") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text("Amount *") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("CASH", "UPI_MANUAL", "CARD_POS").forEach { m ->
                        FilterChip(
                            selected = method == m,
                            onClick = { method = m },
                            label = { Text(m.replace("_", " ")) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = planId, onValueChange = { planId = it }, label = { Text("Plan ID (optional)") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes (optional)") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = {
                        onRecordManualPayment(
                            ManualPaymentRequest(
                                memberIdOrCode = memberId,
                                amount = amount,
                                method = method,
                                planId = planId.ifBlank { null },
                                notes = notes.ifBlank { null }
                            )
                        )
                        showAddPaymentSheet = false
                    },
                    enabled = !uiState.isRecordingPayment && memberId.isNotBlank() && amount.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) {
                    Text(if (uiState.isRecordingPayment) "Saving..." else "Record Payment")
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}

@Composable
fun OwnerMoreScreen(
    uiState: OwnerUiState,
    onOpenPlans: () -> Unit,
    onOpenReports: () -> Unit,
    onOpenIdCards: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSubscription: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenProfile: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "More Operations",
            subtitle = uiState.session?.gymName?.ifBlank { null } ?: "Plans, Reports, ID Cards & Settings"
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            MoreMenuItemCard("Membership Plans", "Monthly, Quarterly, Yearly & PT plans", Icons.Filled.CardMembership, "more_plans_card", onOpenPlans)
            MoreMenuItemCard("Reports & Analytics", "Members, attendance, revenue & exports", Icons.Filled.Assessment, "more_reports_card", onOpenReports)
            MoreMenuItemCard("Member ID Cards", "Generate, download, print & reissue QR passes", Icons.Filled.Badge, "more_id_cards_card", onOpenIdCards)
            MoreMenuItemCard("Notifications", "Expiries, payments & gym announcements", Icons.Filled.Notifications, "more_notifications_card", onOpenNotifications)
            MoreMenuItemCard("SaaS Subscription", "Current Hemnity plan, limits & renewal", Icons.Filled.WorkspacePremium, "more_subscription_card", onOpenSubscription)
            MoreMenuItemCard("Gym Settings", "Profile, hours, gateway status & OpenAPI spec", Icons.Filled.Settings, "more_settings_card", onOpenSettings)
            MoreMenuItemCard("Owner Profile", "Account security & theme preferences", Icons.Filled.Person, "more_profile_card", onOpenProfile)

            Spacer(modifier = Modifier.height(6.dp))
            Button(
                onClick = onLogout,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth().height(50.dp).testTag("owner_logout_button")
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out")
            }
        }
    }
}

@Composable
private fun MoreMenuItemCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    testTag: String,
    onClick: () -> Unit
) {
    HemnityCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag(testTag)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerPlansScreen(
    uiState: OwnerUiState,
    onRefresh: () -> Unit,
    onCreatePlan: (String, String, String, String, String) -> Unit,
    onTogglePlanActive: (String, Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) { onRefresh() }
    var showCreateSheet by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        floatingActionButton = {
            if (uiState.plans is SectionState.Success) {
                FloatingActionButton(
                    onClick = { showCreateSheet = true },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = Color.White
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Add plan")
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            HemnityTopHeader(
                title = "Gym Membership Plans",
                subtitle = "Monthly, Quarterly, Half-Yearly, Yearly & PT",
                onRefresh = onRefresh,
                isRefreshing = uiState.isRefreshingPlans
            )
            HemnityPullToRefreshBox(
                isRefreshing = uiState.isRefreshingPlans,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize()
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    val plansErr = uiState.plansRefreshError
                    if (!plansErr.isNullOrBlank()) {
                        item { RefreshErrorBanner(message = plansErr, onRetry = onRefresh) }
                    }
                    when (val state = uiState.plans) {
                    is SectionState.Loading -> item { LoadingStatePanel("Loading gym membership plans...") }
                    is SectionState.Error -> item { OfflineRetryState(state.message, onRefresh) }
                    is SectionState.ExtensionRequired -> {
                        val memberPlans = (uiState.members as? SectionState.Success)?.data
                            .orEmpty()
                            .mapNotNull { it.planName?.takeIf { p -> p.isNotBlank() } }
                            .groupingBy { it }
                            .eachCount()
                        if (memberPlans.isNotEmpty()) {
                            item {
                                Text("Plans Active on Current Members", style = MaterialTheme.typography.titleSmall)
                            }
                            items(memberPlans.entries.toList(), key = { it.key }) { (planName, count) ->
                                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(planName, style = MaterialTheme.typography.titleMedium)
                                        StatusBadge(text = "$count member(s)")
                                    }
                                }
                            }
                        }
                        item {
                            BackendExtensionRequiredCard(
                                featureTitle = "Membership Plans",
                                endpointRoute = state.route,
                                explanation = "Full plan CRUD (Monthly, Quarterly, Half-Yearly, Yearly, Personal Training) requires /api/v1/owner/plans on gym.hemnity.in.",
                                onRetry = onRefresh
                            )
                        }
                    }
                    is SectionState.Success -> {
                        if (state.data.isEmpty()) {
                            item {
                                EmptyStateCard(
                                    title = "No Gym Plans Yet",
                                    description = "Tap + to create Monthly, Quarterly, or Personal Training plans.",
                                    icon = Icons.Filled.CardMembership
                                )
                            }
                        } else {
                            items(state.data, key = { it.id }) { plan ->
                                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(plan.name, style = MaterialTheme.typography.titleMedium)
                                            val meta = listOfNotNull(
                                                plan.planType,
                                                plan.durationLabel,
                                                plan.activeMemberCount?.let { "$it members" }
                                            ).joinToString(" • ")
                                            if (meta.isNotBlank()) {
                                                Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                        }
                                        Column(horizontalAlignment = Alignment.End) {
                                            Text(
                                                text = plan.price ?: "Unavailable",
                                                style = MaterialTheme.typography.titleMedium.copy(fontFamily = JetBrainsMonoFamily),
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                            Switch(
                                                checked = plan.isActive,
                                                onCheckedChange = { onTogglePlanActive(plan.id, it) }
                                            )
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

    if (showCreateSheet) {
        var name by remember { mutableStateOf("") }
        var price by remember { mutableStateOf("") }
        var duration by remember { mutableStateOf("30") }
        var planType by remember { mutableStateOf("Monthly") }
        var description by remember { mutableStateOf("") }
        ModalBottomSheet(onDismissRequest = { showCreateSheet = false }) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()).padding(20.dp)) {
                Text("Create Gym Membership Plan", style = MaterialTheme.typography.titleLarge)
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Monthly", "Quarterly", "Half-Yearly", "Yearly", "Personal Training").forEach { t ->
                        FilterChip(
                            selected = planType == t,
                            onClick = { planType = t },
                            label = { Text(t) }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Plan Name") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = price, onValueChange = { price = it }, label = { Text("Price") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = duration, onValueChange = { duration = it }, label = { Text("Duration (Days)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = {
                        onCreatePlan(name, price, duration, planType, description)
                        showCreateSheet = false
                    },
                    enabled = !uiState.isCreatingPlan && name.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text("Save Plan")
                }
                Spacer(modifier = Modifier.height(20.dp))
            }
        }
    }
}
