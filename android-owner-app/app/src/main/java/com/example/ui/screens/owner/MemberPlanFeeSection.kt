package com.example.ui.screens.owner

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.domain.model.FeeCalculationResult
import com.example.domain.model.MembershipFeeCalculator
import com.example.domain.model.OwnerPlan
import com.example.ui.components.HemnityCard
import com.example.ui.components.LoadingStatePanel
import com.example.ui.components.StatusBadge
import com.example.ui.theme.JetBrainsMonoFamily
import com.example.ui.theme.LocalHemnityColors

@Composable
fun PlanSelectionAndFeeSection(
    plansState: SectionState<List<OwnerPlan>>,
    selectedPlan: OwnerPlan?,
    onSelectPlan: (OwnerPlan) -> Unit,
    onRetryLoadPlans: () -> Unit,
    startDate: String,
    expiryDate: String,
    discountText: String,
    onDiscountChanged: (String) -> Unit,
    overrideEnabled: Boolean,
    onToggleOverride: (Boolean) -> Unit,
    overrideFeeText: String,
    onOverrideFeeChanged: (String) -> Unit,
    adjustmentReason: String,
    onAdjustmentReasonChanged: (String) -> Unit,
    amountPaidText: String,
    onAmountPaidChanged: (String) -> Unit,
    paymentMethod: String,
    onPaymentMethodSelected: (String) -> Unit,
    calculation: FeeCalculationResult?
) {
    Text("Membership Plan *", style = MaterialTheme.typography.titleSmall)
    Spacer(modifier = Modifier.height(6.dp))

    when (plansState) {
        is SectionState.Loading -> {
            LoadingStatePanel("Loading active plans from server...")
        }
        is SectionState.ExtensionRequired -> {
            HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Info,
                        contentDescription = null,
                        tint = LocalHemnityColors.current.warning,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        text = "Server Plans Endpoint Required",
                        style = MaterialTheme.typography.titleSmall
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "No hardcoded plans are used. Deploy GET /api/v1/owner/plans (included in backend/php_extensions/) so active gym plans load from MySQL.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = onRetryLoadPlans,
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text("Retry Loading Plans")
                }
            }
        }
        is SectionState.Error -> {
            HemnityCard(modifier = Modifier.fillMaxWidth()) {
                Text(plansState.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(onClick = onRetryLoadPlans, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text("Retry Loading Plans")
                }
            }
        }
        is SectionState.Success -> {
            val activePlans = plansState.data.filter { it.isActive }
            if (activePlans.isEmpty()) {
                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "No active membership plans available. Activate or create a plan under More -> Membership Plans first.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(activePlans, key = { it.id }) { plan ->
                        val priceLabel = plan.priceAmount?.let { "₹${MembershipFeeCalculator.formatCurrency(it)}" }
                            ?: plan.price?.let { if (it.startsWith("₹")) it else "₹$it" }
                            ?: "Fee N/A"
                        val durationText = plan.durationDays?.let { "$it days" } ?: plan.durationLabel ?: "Plan"
                        val selected = selectedPlan?.id == plan.id
                        FilterChip(
                            selected = selected,
                            onClick = { onSelectPlan(plan) },
                            leadingIcon = if (selected) {
                                { Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                            } else null,
                            label = { Text("${plan.name} — $durationText — $priceLabel") },
                            modifier = Modifier.testTag("select_plan_${plan.id}")
                        )
                    }
                }
            }
        }
    }

    if (selectedPlan != null && calculation != null) {
        Spacer(modifier = Modifier.height(10.dp))
        HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
            Text("Schedule & Fee Breakdown", style = MaterialTheme.typography.titleSmall)
            Spacer(modifier = Modifier.height(6.dp))
            FeeSummaryRow("Duration", selectedPlan.durationDays?.let { "$it days" } ?: selectedPlan.durationLabel ?: "-")
            FeeSummaryRow("Start Date", startDate)
            FeeSummaryRow("Expiry Date", expiryDate.ifBlank { "Calculated by server" })
            FeeSummaryRow("Plan Price", "₹${MembershipFeeCalculator.formatCurrency(calculation.planPrice)}")

            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Authorize Discount / Override", style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = "Requires manager reason for audit trail",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(
                    checked = overrideEnabled,
                    onCheckedChange = onToggleOverride,
                    modifier = Modifier.testTag("fee_override_switch")
                )
            }

            if (overrideEnabled) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = discountText,
                        onValueChange = onDiscountChanged,
                        label = { Text("Discount ₹") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.weight(1f).testTag("discount_input")
                    )
                    OutlinedTextField(
                        value = overrideFeeText,
                        onValueChange = onOverrideFeeChanged,
                        label = { Text("Override Fee ₹ (opt)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.weight(1f).testTag("override_fee_input")
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = adjustmentReason,
                    onValueChange = onAdjustmentReasonChanged,
                    label = { Text("Authorization Reason *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("adjustment_reason_input")
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
            OutlinedTextField(
                value = amountPaidText,
                onValueChange = onAmountPaidChanged,
                label = { Text("Amount Paid Today (₹)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("amount_paid_input")
            )

            Spacer(modifier = Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("CASH", "UPI_MANUAL", "CARD_POS")) { method ->
                    FilterChip(
                        selected = paymentMethod == method,
                        onClick = { onPaymentMethodSelected(method) },
                        label = { Text(method.replace("_", " ")) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            FeeSummaryRow(
                label = "Final Fee",
                value = "₹${MembershipFeeCalculator.formatCurrency(calculation.finalFee)}",
                bold = true
            )
            FeeSummaryRow(
                label = "Remaining Due",
                value = "₹${MembershipFeeCalculator.formatCurrency(calculation.remainingDue)}",
                bold = true
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Payment Status", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                StatusBadge(text = calculation.paymentStatus, modifier = Modifier.testTag("calculated_payment_status"))
            }

            val validationError = calculation.validationError
            if (!validationError.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = validationError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.testTag("fee_validation_error")
                )
            }
        }
    }
}

@Composable
private fun FeeSummaryRow(label: String, value: String, bold: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFamily = JetBrainsMonoFamily,
                fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal
            ),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
