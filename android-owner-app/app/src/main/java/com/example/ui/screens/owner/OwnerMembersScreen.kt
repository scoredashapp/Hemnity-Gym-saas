package com.example.ui.screens.owner

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.R
import com.example.domain.model.MemberRecord
import com.example.domain.model.MembershipFeeCalculator
import com.example.domain.model.NewMemberRequest
import com.example.domain.model.OwnerPlan
import com.example.domain.model.UpdateMemberRequest
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
import com.example.ui.theme.OrangeAccent
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OwnerMembersScreen(
    uiState: OwnerUiState,
    onSearchChanged: (String) -> Unit,
    onExecuteSearch: () -> Unit,
    onFilterSelected: (String) -> Unit,
    onSortSelected: (MemberSortOption) -> Unit,
    onSelectMember: (MemberRecord?) -> Unit,
    onRefreshSelectedMember: (String) -> Unit,
    onOpenAddMember: (Boolean) -> Unit,
    onRetryLoadPlans: () -> Unit,
    onCreateMember: (NewMemberRequest) -> Unit,
    onUpdateMember: (UpdateMemberRequest) -> Unit,
    onToggleSuspendMember: (MemberRecord) -> Unit,
    onRenewMember: (
        memberId: String,
        planId: String,
        amountPaid: String?,
        startDate: String?,
        expiryDate: String?,
        planPrice: String?,
        discountAmount: String?,
        finalFee: String?,
        remainingDue: String?,
        paymentMethod: String,
        paymentStatus: String?,
        adjustmentReason: String?,
        idempotencyKey: String?
    ) -> Unit,
    onReissueQr: (String) -> Unit,
    onViewIdCard: (MemberRecord) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        floatingActionButton = {
            FloatingActionButton(
                onClick = { onOpenAddMember(true) },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = Color.White,
                modifier = Modifier.testTag("add_member_fab")
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Add new member")
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            HemnityTopHeader(
                title = "Members Directory",
                subtitle = "Profiles, plans, dues, renewals & QR passes",
                onRefresh = onRefresh,
                isRefreshing = uiState.isRefreshingMembers
            )

            OutlinedTextField(
                value = uiState.memberSearchQuery,
                onValueChange = onSearchChanged,
                placeholder = { Text("Search by name, member ID, or phone...") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onExecuteSearch() }),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .testTag("member_search_input")
            )

            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val filterItems = listOf(
                    "ALL" to "All",
                    "ACTIVE" to "Active",
                    "EXPIRED" to "Expired",
                    "UNASSIGNED" to "Unassigned",
                    "SUSPENDED" to "Suspended"
                )
                items(filterItems, key = { it.first }) { (key, label) ->
                    FilterChip(
                        selected = uiState.memberFilter == key,
                        onClick = { onFilterSelected(key) },
                        label = { Text(label) },
                        modifier = Modifier.testTag("member_filter_$key")
                    )
                }
            }

            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 16.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                item {
                    Icon(
                        imageVector = Icons.Filled.Sort,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                }
                items(MemberSortOption.entries, key = { it.name }) { option ->
                    FilterChip(
                        selected = uiState.memberSort == option,
                        onClick = { onSortSelected(option) },
                        label = { Text("Sort: ${option.label}") },
                        modifier = Modifier.testTag("member_sort_${option.name}")
                    )
                }
            }

            HemnityPullToRefreshBox(
                isRefreshing = uiState.isRefreshingMembers,
                onRefresh = onRefresh,
                modifier = Modifier.fillMaxSize()
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 88.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    val refreshErr = uiState.membersRefreshError
                    if (!refreshErr.isNullOrBlank()) {
                        item {
                            RefreshErrorBanner(message = refreshErr, onRetry = onRefresh)
                        }
                    }

                    when (val membersState = uiState.members) {
                        is SectionState.Loading -> item { LoadingStatePanel("Loading gym members...") }
                        is SectionState.Error -> item { OfflineRetryState(membersState.message, onRefresh) }
                        is SectionState.ExtensionRequired -> item {
                            BackendExtensionRequiredCard(
                                featureTitle = "Members Directory",
                                endpointRoute = membersState.route,
                                explanation = membersState.message,
                                onRetry = onRefresh
                            )
                        }
                        is SectionState.Success -> {
                            val filtered = filterAndSortMembers(
                                members = membersState.data,
                                query = uiState.memberSearchQuery,
                                filter = uiState.memberFilter,
                                sort = uiState.memberSort
                            )

                            if (filtered.isEmpty()) {
                                item {
                                    EmptyStateCard(
                                        title = "No Members Found",
                                        description = "Try clearing your search or filter criteria, or add a new member.",
                                        icon = Icons.Filled.Group
                                    )
                                }
                            } else {
                                items(filtered, key = { it.id + it.name }) { member ->
                                    MemberListCard(
                                        member = member,
                                        onClick = { onSelectMember(member) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    val selected = uiState.selectedMember
    if (selected != null) {
        ModalBottomSheet(onDismissRequest = { onSelectMember(null) }) {
            MemberDetailSheetContent(
                member = selected,
                uiState = uiState,
                onUpdateMember = onUpdateMember,
                onToggleSuspend = { onToggleSuspendMember(selected) },
                onRenewPlan = { planId, paid, start, expiry, price, disc, finalFee, due, method, status, reason, idemKey ->
                    onRenewMember(
                        selected.id, planId, paid, start, expiry,
                        price, disc, finalFee, due, method, status, reason, idemKey
                    )
                },
                onReissueQr = { onReissueQr(selected.id) },
                onRefreshMember = { onRefreshSelectedMember(selected.id) },
                onRetryLoadPlans = onRetryLoadPlans,
                onViewIdCard = onViewIdCard
            )
        }
    }

    if (uiState.isAddMemberOpen) {
        ModalBottomSheet(onDismissRequest = { onOpenAddMember(false) }) {
            AddMemberSheetContent(
                plansState = uiState.plans,
                onRetryLoadPlans = onRetryLoadPlans,
                isSubmitting = uiState.isCreatingMember,
                errorMessage = uiState.createMemberError,
                onSubmit = onCreateMember
            )
        }
    }
}

internal fun filterAndSortMembers(
    members: List<MemberRecord>,
    query: String,
    filter: String,
    sort: MemberSortOption
): List<MemberRecord> {
    val cleanQuery = query.trim().lowercase()
    val filtered = members.filter { member ->
        val matchesFilter = when (filter) {
            "ACTIVE" -> member.membershipStatus.contains("active", ignoreCase = true)
            "EXPIRED" -> member.membershipStatus.contains("expir", ignoreCase = true)
            "UNASSIGNED" -> member.planName.isNullOrBlank()
            "SUSPENDED" -> member.membershipStatus.contains("suspend", ignoreCase = true)
            else -> true
        }
        val matchesQuery = cleanQuery.isBlank() ||
            member.name.lowercase().contains(cleanQuery) ||
            (member.memberCode?.lowercase()?.contains(cleanQuery) == true) ||
            member.id.lowercase().contains(cleanQuery) ||
            (member.phone?.lowercase()?.contains(cleanQuery) == true) ||
            (member.planName?.lowercase()?.contains(cleanQuery) == true)
        matchesFilter && matchesQuery
    }

    return when (sort) {
        MemberSortOption.NAME_ASC -> filtered.sortedBy { it.name.lowercase() }
        MemberSortOption.EXPIRY_SOONEST -> filtered.sortedBy { it.expiryDate ?: "9999-99-99" }
        MemberSortOption.ID_NEWEST -> filtered.sortedByDescending { it.id.toLongOrNull() ?: 0L }
        MemberSortOption.PENDING_DUE -> filtered.sortedByDescending {
            MembershipFeeCalculator.parseNumericAmount(it.pendingAmount) ?: 0.0
        }
    }
}

@Composable
fun MemberListCard(
    member: MemberRecord,
    onClick: () -> Unit
) {
    val planDisplay = member.planName?.takeIf { it.isNotBlank() } ?: "Unassigned"
    val memberIdDisplay = member.memberCode?.takeIf { it.isNotBlank() } ?: "ID #${member.id}"
    val phoneDisplay = member.phone?.takeIf { it.isNotBlank() } ?: "No phone"
    val expiryDisplay = member.expiryDate?.takeIf { it.isNotBlank() } ?: "No Expiry"
    val pendingVal = MembershipFeeCalculator.parseNumericAmount(member.pendingAmount) ?: 0.0

    HemnityCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("member_card_${member.id}")
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            MemberAvatar(photoUrl = member.photoUrl, name = member.name, sizeDp = 50)
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = member.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "$memberIdDisplay • $phoneDisplay",
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = JetBrainsMonoFamily),
                    color = OrangeAccent,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "Plan: $planDisplay • Expiry: $expiryDisplay",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (pendingVal > 0.009) {
                    Text(
                        text = "Due: ₹${MembershipFeeCalculator.formatCurrency(pendingVal)}",
                        style = MaterialTheme.typography.labelSmall.copy(fontFamily = JetBrainsMonoFamily),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
            Spacer(modifier = Modifier.width(8.dp))
            StatusBadge(text = member.membershipStatus)
        }
    }
}

@Composable
fun MemberAvatar(
    photoUrl: String?,
    name: String,
    sizeDp: Int = 48
) {
    if (!photoUrl.isNullOrBlank()) {
        AsyncImage(
            model = photoUrl,
            contentDescription = stringResource(R.string.cd_member_photo),
            modifier = Modifier
                .size(sizeDp.dp)
                .clip(CircleShape),
            contentScale = ContentScale.Crop
        )
    } else {
        val initials = name.trim().split(" ")
            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
            .take(2)
            .joinToString("")
            .ifBlank { "M" }
        Box(
            modifier = Modifier
                .size(sizeDp.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initials,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun AddMemberSheetContent(
    plansState: SectionState<List<OwnerPlan>>,
    onRetryLoadPlans: () -> Unit,
    isSubmitting: Boolean,
    errorMessage: String?,
    onSubmit: (NewMemberRequest) -> Unit
) {
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var selectedPlan by remember { mutableStateOf<OwnerPlan?>(null) }
    val startDate = remember { MembershipFeeCalculator.computeStartDateToday() }
    var discountText by remember { mutableStateOf("") }
    var overrideEnabled by remember { mutableStateOf(false) }
    var overrideFeeText by remember { mutableStateOf("") }
    var adjustmentReason by remember { mutableStateOf("") }
    var amountPaidText by remember { mutableStateOf("") }
    var paymentMethod by remember { mutableStateOf("CASH") }
    val idempotencyKey = remember { UUID.randomUUID().toString() }

    val activePlansAvailable = (plansState as? SectionState.Success)?.data?.any { it.isActive } == true
    val calculation = selectedPlan?.let { plan ->
        val basePrice = plan.priceAmount ?: MembershipFeeCalculator.parseNumericAmount(plan.price) ?: 0.0
        val disc = if (overrideEnabled) MembershipFeeCalculator.parseNumericAmount(discountText) ?: 0.0 else 0.0
        val ovr = if (overrideEnabled) MembershipFeeCalculator.parseNumericAmount(overrideFeeText) else null
        val paid = MembershipFeeCalculator.parseNumericAmount(amountPaidText) ?: 0.0
        MembershipFeeCalculator.calculate(
            planPrice = basePrice,
            discountAmount = disc,
            amountPaid = paid,
            overrideEnabled = overrideEnabled,
            overrideFinalFee = ovr,
            adjustmentReason = adjustmentReason
        )
    }
    val expiryDate = selectedPlan?.durationDays?.let {
        MembershipFeeCalculator.computeExpiryDate(startDate, it)
    }.orEmpty()

    val canSubmit = !isSubmitting &&
        fullName.isNotBlank() &&
        phone.isNotBlank() &&
        (!activePlansAvailable || (selectedPlan != null && calculation?.isValid == true))

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 10.dp)
    ) {
        Text("Add New Gym Member", style = MaterialTheme.typography.titleLarge)
        Text(
            text = "Loads active plans from server & calculates dues automatically.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(14.dp))

        OutlinedTextField(
            value = fullName,
            onValueChange = { fullName = it },
            label = { Text("Full Name *") },
            leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("add_member_name")
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("Mobile Number *") },
            leadingIcon = { Icon(Icons.Filled.Phone, contentDescription = null) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("add_member_phone")
        )
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Address") },
            leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("add_member_email")
        )

        Spacer(modifier = Modifier.height(14.dp))
        PlanSelectionAndFeeSection(
            plansState = plansState,
            selectedPlan = selectedPlan,
            onSelectPlan = { plan ->
                selectedPlan = plan
                val price = plan.priceAmount ?: MembershipFeeCalculator.parseNumericAmount(plan.price) ?: 0.0
                amountPaidText = MembershipFeeCalculator.formatCurrency(price)
                discountText = ""
                overrideFeeText = ""
                adjustmentReason = ""
                overrideEnabled = false
            },
            onRetryLoadPlans = onRetryLoadPlans,
            startDate = startDate,
            expiryDate = expiryDate,
            discountText = discountText,
            onDiscountChanged = { discountText = it },
            overrideEnabled = overrideEnabled,
            onToggleOverride = { overrideEnabled = it },
            overrideFeeText = overrideFeeText,
            onOverrideFeeChanged = { overrideFeeText = it },
            adjustmentReason = adjustmentReason,
            onAdjustmentReasonChanged = { adjustmentReason = it },
            amountPaidText = amountPaidText,
            onAmountPaidChanged = { amountPaidText = it },
            paymentMethod = paymentMethod,
            onPaymentMethodSelected = { paymentMethod = it },
            calculation = calculation
        )

        if (!errorMessage.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(errorMessage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = {
                onSubmit(
                    NewMemberRequest(
                        fullName = fullName,
                        email = email,
                        phone = phone,
                        planId = selectedPlan?.id,
                        startDate = if (selectedPlan != null) startDate else null,
                        expiryDate = expiryDate.ifBlank { null },
                        planPrice = calculation?.let { MembershipFeeCalculator.formatCurrency(it.planPrice) },
                        discountAmount = calculation?.let { MembershipFeeCalculator.formatCurrency(it.discountAmount) },
                        finalFee = calculation?.let { MembershipFeeCalculator.formatCurrency(it.finalFee) },
                        amountPaid = calculation?.let { MembershipFeeCalculator.formatCurrency(it.amountPaid) },
                        remainingDue = calculation?.let { MembershipFeeCalculator.formatCurrency(it.remainingDue) },
                        paymentMethod = paymentMethod,
                        paymentStatus = calculation?.paymentStatus,
                        adjustmentReason = adjustmentReason.ifBlank { null },
                        idempotencyKey = idempotencyKey
                    )
                )
            },
            enabled = canSubmit,
            modifier = Modifier.fillMaxWidth().height(50.dp).testTag("submit_add_member_button")
        ) {
            Text(if (isSubmitting) "Creating Member..." else "Create Member")
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}
