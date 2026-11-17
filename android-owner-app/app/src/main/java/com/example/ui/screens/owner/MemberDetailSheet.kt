package com.example.ui.screens.owner

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.R
import com.example.core.qr.QrBitmapGenerator
import com.example.domain.model.MemberRecord
import com.example.domain.model.MembershipFeeCalculator
import com.example.domain.model.OwnerPlan
import com.example.domain.model.UpdateMemberRequest
import com.example.ui.components.HemnityCard
import com.example.ui.components.HemnityPullToRefreshBox
import com.example.ui.components.LoadingStatePanel
import com.example.ui.components.RefreshErrorBanner
import com.example.ui.components.StatusBadge
import com.example.ui.theme.JetBrainsMonoFamily
import com.example.ui.theme.LocalHemnityColors
import java.util.UUID

@Composable
fun MemberDetailSheetContent(
    member: MemberRecord,
    uiState: OwnerUiState,
    onUpdateMember: (UpdateMemberRequest) -> Unit,
    onToggleSuspend: () -> Unit,
    onRenewPlan: (
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
    onReissueQr: () -> Unit,
    onRefreshMember: () -> Unit,
    onRetryLoadPlans: () -> Unit,
    onViewIdCard: (MemberRecord) -> Unit
) {
    val qrBitmap = remember(member.qrCredential) {
        member.qrCredential?.takeIf { it.isNotBlank() }?.let { QrBitmapGenerator.generateQrBitmap(it, 420) }
    }
    var detailTab by remember { mutableStateOf("OVERVIEW") }
    var showEditDialog by remember { mutableStateOf(false) }
    var showRenewDialog by remember { mutableStateOf(false) }
    var pickedPhotoUri by remember { mutableStateOf<Uri?>(null) }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        pickedPhotoUri = uri
    }

    val mismatchExplanation = remember(member) {
        MembershipFeeCalculator.explainFeeMismatch(member)
    }

    HemnityPullToRefreshBox(
        isRefreshing = uiState.isRefreshingMemberDetail,
        onRefresh = onRefreshMember,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 640.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            val detailRefreshErr = uiState.memberDetailRefreshError
            if (!detailRefreshErr.isNullOrBlank()) {
                RefreshErrorBanner(message = detailRefreshErr, onRetry = onRefreshMember)
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (pickedPhotoUri != null) {
                AsyncImage(
                    model = pickedPhotoUri,
                    contentDescription = stringResource(R.string.cd_member_photo),
                    modifier = Modifier.size(74.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop
                )
            } else {
                MemberAvatar(photoUrl = member.photoUrl, name = member.name, sizeDp = 74)
            }
            Spacer(modifier = Modifier.height(6.dp))
            TextButton(
                onClick = {
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }
            ) {
                Icon(Icons.Filled.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Select Photo")
            }

            Text(member.name, style = MaterialTheme.typography.headlineSmall)
            Text(
                text = member.memberCode?.takeIf { it.isNotBlank() } ?: "ID #${member.id}",
                style = MaterialTheme.typography.labelSmall.copy(fontFamily = JetBrainsMonoFamily),
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(6.dp))
            StatusBadge(text = member.membershipStatus)

            if (!uiState.memberActionFeedback.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = uiState.memberActionFeedback,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("OVERVIEW" to "Profile", "PAYMENTS" to "Payments", "ATTENDANCE" to "Attendance").forEach { (k, label) ->
                    FilterChip(
                        selected = detailTab == k,
                        onClick = { detailTab = k },
                        label = { Text(label) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            when (detailTab) {
                "OVERVIEW" -> {
                    if (!mismatchExplanation.isNullOrBlank()) {
                        HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Filled.Info,
                                    contentDescription = null,
                                    tint = LocalHemnityColors.current.warning,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Fee Audit Notice", style = MaterialTheme.typography.titleSmall)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = mismatchExplanation,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                    }

                    HemnityCard(modifier = Modifier.fillMaxWidth()) {
                        DetailRow("Plan", member.planName?.takeIf { it.isNotBlank() } ?: "Unassigned")
                        DetailRow("Phone", member.phone?.takeIf { it.isNotBlank() } ?: "Unavailable")
                        DetailRow("Email", member.email?.takeIf { it.isNotBlank() } ?: "Unavailable")
                        DetailRow("Joined", member.joiningDate ?: member.startDate ?: "Unavailable")
                        DetailRow("Expiry", member.expiryDate ?: "No Expiry")
                        DetailRow(
                            "Assigned Fee",
                            member.finalFee ?: member.assignedFee ?: "Unavailable"
                        )
                        if (!member.planCurrentPrice.isNullOrBlank()) {
                            DetailRow("Catalog Plan Price", member.planCurrentPrice)
                        }
                        if (!member.discountAmount.isNullOrBlank()) {
                            DetailRow("Discount", member.discountAmount)
                        }
                        if (!member.amountPaid.isNullOrBlank()) {
                            DetailRow("Amount Paid", member.amountPaid)
                        }
                        DetailRow(
                            "Pending Due",
                            member.pendingAmount ?: "0"
                        )
                        if (!member.paymentStatus.isNullOrBlank()) {
                            DetailRow("Payment Status", member.paymentStatus)
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { showEditDialog = true },
                            modifier = Modifier.weight(1f).height(48.dp)
                        ) {
                            Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Edit")
                        }
                        OutlinedButton(
                            onClick = {
                                onRetryLoadPlans()
                                showRenewDialog = true
                            },
                            modifier = Modifier.weight(1f).height(48.dp).testTag("assign_renew_plan_button")
                        ) {
                            Icon(Icons.Filled.Autorenew, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(if (member.planName.isNullOrBlank()) "Assign Plan" else "Renew")
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = { onViewIdCard(member) },
                        modifier = Modifier.fillMaxWidth().height(48.dp).testTag("view_member_id_card_button")
                    ) {
                        Icon(Icons.Filled.Badge, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("View & Export ID Card")
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = onToggleSuspend,
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Icon(Icons.Filled.PauseCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            if (member.membershipStatus.contains("active", ignoreCase = true)) {
                                "Suspend Member"
                            } else {
                                "Reactivate Member"
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))
                    HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = qrBitmap != null) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.QrCode2, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("QR ID Credential", style = MaterialTheme.typography.titleSmall)
                            }
                            TextButton(onClick = onReissueQr) {
                                Text("Reissue QR")
                            }
                        }
                        if (qrBitmap != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color.White)
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Image(
                                    bitmap = qrBitmap.asImageBitmap(),
                                    contentDescription = stringResource(R.string.cd_qr_code),
                                    modifier = Modifier.size(180.dp)
                                )
                            }
                        } else {
                            Text(
                                text = "No QR credential provided in this member record. Tap Reissue QR once PHP extensions are live.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                "PAYMENTS" -> {
                    when (val ps = uiState.selectedMemberPayments) {
                        null, is SectionState.Loading -> LoadingStatePanel("Loading member payments...")
                        is SectionState.Error -> Text(ps.message, color = MaterialTheme.colorScheme.error)
                        is SectionState.ExtensionRequired -> Text(
                            "Endpoint /api/v1/${ps.route} requires PHP backend extension.",
                            style = MaterialTheme.typography.bodySmall
                        )
                        is SectionState.Success -> {
                            if (ps.data.isEmpty()) {
                                Text("No payment records for this member.")
                            } else {
                                ps.data.forEach { p ->
                                    HemnityCard(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(p.planName ?: "Payment")
                                            Text(p.amount ?: "-", fontFamily = JetBrainsMonoFamily)
                                        }
                                        Text(
                                            text = listOfNotNull(p.receiptNumber, p.paidAt, p.status).joinToString(" • "),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                "ATTENDANCE" -> {
                    when (val att = uiState.selectedMemberAttendance) {
                        null, is SectionState.Loading -> LoadingStatePanel("Loading attendance history...")
                        is SectionState.Error -> Text(att.message, color = MaterialTheme.colorScheme.error)
                        is SectionState.ExtensionRequired -> Text(
                            "Endpoint /api/v1/${att.route} requires PHP backend extension.",
                            style = MaterialTheme.typography.bodySmall
                        )
                        is SectionState.Success -> {
                            if (att.data.isEmpty()) {
                                Text("No check-in history found for this member.")
                            } else {
                                att.data.forEach { log ->
                                    HemnityCard(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(log.checkedInAt, style = MaterialTheme.typography.bodyMedium)
                                            StatusBadge(text = log.status ?: "Checked In")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    if (showEditDialog) {
        var name by remember { mutableStateOf(member.name) }
        var email by remember { mutableStateOf(member.email.orEmpty()) }
        var phone by remember { mutableStateOf(member.phone.orEmpty()) }
        AlertDialog(
            onDismissRequest = { showEditDialog = false },
            title = { Text("Edit Member Profile") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Full Name") })
                    OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") })
                    OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    onUpdateMember(UpdateMemberRequest(member.id, name, email, phone))
                    showEditDialog = false
                }) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { showEditDialog = false }) { Text("Cancel") }
            }
        )
    }

    if (showRenewDialog) {
        var selectedPlan by remember { mutableStateOf<OwnerPlan?>(null) }
        val startDate = remember { MembershipFeeCalculator.computeStartDateToday() }
        var discountText by remember { mutableStateOf("") }
        var overrideEnabled by remember { mutableStateOf(false) }
        var overrideFeeText by remember { mutableStateOf("") }
        var adjustmentReason by remember { mutableStateOf("") }
        var amountPaidText by remember { mutableStateOf("") }
        var paymentMethod by remember { mutableStateOf("CASH") }
        val submissionKey = remember { UUID.randomUUID().toString() }

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

        AlertDialog(
            onDismissRequest = { showRenewDialog = false },
            title = { Text("Assign / Renew Plan") },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 460.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    PlanSelectionAndFeeSection(
                        plansState = uiState.plans,
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
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val plan = selectedPlan ?: return@Button
                        val calc = calculation ?: return@Button
                        onRenewPlan(
                            plan.id,
                            MembershipFeeCalculator.formatCurrency(calc.amountPaid),
                            startDate,
                            expiryDate.ifBlank { null },
                            MembershipFeeCalculator.formatCurrency(calc.planPrice),
                            MembershipFeeCalculator.formatCurrency(calc.discountAmount),
                            MembershipFeeCalculator.formatCurrency(calc.finalFee),
                            MembershipFeeCalculator.formatCurrency(calc.remainingDue),
                            paymentMethod,
                            calc.paymentStatus,
                            adjustmentReason.ifBlank { null },
                            submissionKey
                        )
                        showRenewDialog = false
                    },
                    enabled = !uiState.isAssigningPlan && selectedPlan != null && calculation?.isValid == true
                ) {
                    Text(if (uiState.isAssigningPlan) "Saving..." else "Confirm")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRenewDialog = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}
