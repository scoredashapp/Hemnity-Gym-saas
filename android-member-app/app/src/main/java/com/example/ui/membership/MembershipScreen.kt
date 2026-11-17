package com.example.ui.membership

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.Autorenew
import androidx.compose.material.icons.rounded.History
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.core.util.DateUtils
import com.example.domain.model.MembershipDetails
import com.example.domain.model.RenewalRecord
import com.example.ui.components.HemnityEmptyState
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.components.MembershipStatusBadge
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import java.util.Locale

@Composable
fun MembershipScreen(
    viewModel: MembershipViewModel,
    onOpenPayments: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val feedback by viewModel.renewalActionMessage.collectAsStateWithLifecycle()
    val checkoutUrl by viewModel.checkoutUrl.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.loadMembership()
    }

    LaunchedEffect(feedback) {
        feedback?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionMessage()
        }
    }

    LaunchedEffect(checkoutUrl) {
        checkoutUrl?.let { url ->
            viewModel.consumeCheckoutUrl()
            runCatching {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("membership_screen"),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 720.dp)
                .align(Alignment.TopCenter),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (val state = uiState) {
                is MembershipUiState.Loading -> {
                    item { HemnitySkeletonBox(height = 240.dp, cornerRadius = 22.dp) }
                    item { HemnitySkeletonBox(height = 160.dp) }
                }
                is MembershipUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadMembership() },
                        )
                    }
                }
                is MembershipUiState.Success -> {
                    val details = state.details
                    item {
                        MembershipDetailsCard(
                            details = details,
                            onRenew = { viewModel.requestRenewal(details.membershipId) },
                            onOpenPayments = onOpenPayments,
                        )
                    }
                    item {
                        Text(
                            text = "Renewal History",
                            style = MaterialTheme.typography.titleMedium,
                            color = PrimaryText,
                        )
                    }
                    if (details.renewalHistory.isEmpty()) {
                        item {
                            HemnityEmptyState(
                                icon = Icons.Rounded.History,
                                title = "No Past Renewals",
                                subtitle = "Previous plan renewals for this gym will appear here.",
                            )
                        }
                    } else {
                        items(details.renewalHistory, key = { it.id }) { item ->
                            RenewalHistoryCard(item = item, currency = details.currencySymbol)
                        }
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun MembershipDetailsCard(
    details: MembershipDetails,
    onRenew: () -> Unit,
    onOpenPayments: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = details.gymName,
                        style = MaterialTheme.typography.labelLarge,
                        color = AccentOrange,
                    )
                    Text(
                        text = details.planName,
                        style = MaterialTheme.typography.headlineLarge,
                        color = PrimaryText,
                    )
                }
                MembershipStatusBadge(status = details.status)
            }

            HorizontalDivider(color = CardBorderSubtle)

            DetailRow(label = "Membership ID", value = details.membershipId, mono = true)
            DetailRow(label = "Plan Duration", value = details.planDuration)
            DetailRow(label = "Start Date", value = DateUtils.formatDisplayDate(details.startDate))
            DetailRow(
                label = "Expiry Date",
                value = DateUtils.formatDisplayDate(details.expiryDate),
                highlight = true,
            )
            DetailRow(
                label = "Remaining Days",
                value = "${details.remainingDays} days",
                highlight = true,
            )
            DetailRow(
                label = "Membership Fee",
                value = String.format(Locale.US, "%s%.2f", details.currencySymbol, details.membershipFee),
            )
            DetailRow(label = "Payment Status", value = details.paymentStatus)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedButton(
                    onClick = onOpenPayments,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("membership_view_payments_button"),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, CardBorderSubtle),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AccountBalanceWallet,
                        contentDescription = null,
                        tint = PrimaryOrange,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Payments", color = PrimaryText)
                }

                if (details.renewalSupported) {
                    Button(
                        onClick = onRenew,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                            .testTag("membership_renew_button"),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PrimaryOrange,
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Autorenew,
                            contentDescription = null,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Renew Plan", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(
    label: String,
    value: String,
    mono: Boolean = false,
    highlight: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = SecondaryText,
        )
        Text(
            text = value,
            style = if (mono) MaterialTheme.typography.labelSmall else MaterialTheme.typography.titleSmall,
            color = if (highlight) PrimaryOrange else PrimaryText,
            fontWeight = if (highlight || mono) FontWeight.Bold else FontWeight.SemiBold,
        )
    }
}

@Composable
private fun RenewalHistoryCard(
    item: RenewalRecord,
    currency: String,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = item.planName,
                    style = MaterialTheme.typography.titleSmall,
                    color = PrimaryText,
                )
                Text(
                    text = "${DateUtils.formatDisplayDate(item.startDate)} → ${DateUtils.formatDisplayDate(item.expiryDate)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = String.format(Locale.US, "%s%.2f", currency, item.amount),
                    style = MaterialTheme.typography.titleSmall,
                    color = PrimaryOrange,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = item.paymentStatus,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
            }
        }
    }
}
