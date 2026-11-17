package com.example.ui.payments

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Payment
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.core.util.DateUtils
import com.example.domain.model.PaymentRecord
import com.example.ui.components.HemnityEmptyState
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusActive
import com.example.ui.theme.StatusExpired
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentsScreen(
    viewModel: PaymentsViewModel,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val feedback by viewModel.actionFeedback.collectAsStateWithLifecycle()
    val checkoutUrl by viewModel.pendingCheckoutUrl.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var selectedReceipt by remember { mutableStateOf<PaymentRecord?>(null) }

    LaunchedEffect(Unit) {
        viewModel.loadPayments()
    }

    // Always verify payment status from the server on return from external checkout
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.verifyReturnedPayment()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(feedback) {
        feedback?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearFeedback()
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

    Scaffold(
        containerColor = PrimaryBackground,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("My Payments", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("payments_back_button"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = PrimaryBackground,
                    titleContentColor = PrimaryText,
                    navigationIconContentColor = PrimaryText,
                ),
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .widthIn(max = 720.dp)
                .testTag("payments_screen"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            when (val state = uiState) {
                is PaymentsUiState.Loading -> {
                    item { HemnitySkeletonBox(height = 120.dp) }
                    items(3) { HemnitySkeletonBox(height = 96.dp) }
                }

                is PaymentsUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadPayments() },
                        )
                    }
                }

                is PaymentsUiState.Success -> {
                    val overview = state.overview
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            PaymentSummaryCard(
                                label = "Total Paid",
                                amount = String.format(
                                    Locale.US,
                                    "%s%.2f",
                                    overview.currencySymbol,
                                    overview.totalPaid,
                                ),
                                accent = StatusActive,
                                modifier = Modifier.weight(1f),
                            )
                            PaymentSummaryCard(
                                label = "Pending Fees",
                                amount = String.format(
                                    Locale.US,
                                    "%s%.2f",
                                    overview.currencySymbol,
                                    overview.pendingFees,
                                ),
                                accent = if (overview.pendingFees > 0) StatusExpired else PrimaryText,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }

                    if (overview.onlinePaymentEnabled && overview.pendingFees > 0.0) {
                        item {
                            Button(
                                onClick = { viewModel.initiateOnlinePayment() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(50.dp)
                                    .testTag("pay_online_button"),
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = PrimaryOrange,
                                    contentColor = Color.White,
                                ),
                            ) {
                                Icon(imageVector = Icons.Rounded.Payment, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Pay Pending Fees Online${overview.gatewayName?.let { " ($it)" } ?: ""}",
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }

                    item {
                        Text(
                            text = "Payment History",
                            style = MaterialTheme.typography.titleMedium,
                            color = PrimaryText,
                        )
                    }

                    if (overview.payments.isEmpty()) {
                        item {
                            HemnityEmptyState(
                                icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                                title = "No Payment Records",
                                subtitle = "Completed payments and fee receipts for this gym will appear here.",
                            )
                        }
                    } else {
                        items(overview.payments, key = { it.id }) { payment ->
                            PaymentHistoryCard(
                                record = payment,
                                onClick = { selectedReceipt = payment },
                            )
                        }
                    }
                }
            }
        }
    }

    selectedReceipt?.let { receipt ->
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { selectedReceipt = null },
            sheetState = sheetState,
            containerColor = SecondaryBackground,
            contentColor = PrimaryText,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Verified,
                        contentDescription = null,
                        tint = PrimaryOrange,
                    )
                    Text(
                        text = "Receipt #${receipt.receiptNumber}",
                        style = MaterialTheme.typography.headlineMedium,
                        color = PrimaryText,
                    )
                }
                HorizontalDivider(color = CardBorderSubtle)
                ReceiptRow("Date", DateUtils.formatDisplayDate(receipt.paymentDate))
                ReceiptRow(
                    "Amount",
                    String.format(Locale.US, "%s%.2f", receipt.currencySymbol, receipt.amount),
                )
                ReceiptRow("Method", receipt.method)
                ReceiptRow("Status", receipt.status)
                receipt.planName?.let { ReceiptRow("Plan", it) }

                if (receipt.receiptSupported) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Button(
                        onClick = {
                            viewModel.downloadReceipt(context, receipt.id, receipt.receiptNumber)
                            selectedReceipt = null
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .testTag("download_receipt_pdf_button"),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryOrange),
                    ) {
                        Icon(imageVector = Icons.Rounded.Download, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Download Receipt PDF", fontWeight = FontWeight.SemiBold)
                    }
                }
                OutlinedButton(
                    onClick = { selectedReceipt = null },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, CardBorderSubtle),
                ) {
                    Text("Close", color = SecondaryText)
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun PaymentSummaryCard(
    label: String,
    amount: String,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(text = label, style = MaterialTheme.typography.bodySmall, color = SecondaryText)
            Text(
                text = amount,
                style = MaterialTheme.typography.headlineMedium,
                color = accent,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun PaymentHistoryCard(
    record: PaymentRecord,
    onClick: () -> Unit,
) {
    val isPaid = record.status.equals("paid", ignoreCase = true) ||
        record.status.equals("completed", ignoreCase = true) ||
        record.status.equals("success", ignoreCase = true)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .testTag("payment_card_${record.id}"),
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
                    text = record.planName ?: "Membership Payment",
                    style = MaterialTheme.typography.titleSmall,
                    color = PrimaryText,
                )
                Text(
                    text = "${DateUtils.formatDisplayDate(record.paymentDate)} • ${record.method}",
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
                Text(
                    text = "Receipt: ${record.receiptNumber}",
                    style = MaterialTheme.typography.labelSmall,
                    color = PrimaryOrange,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = String.format(Locale.US, "%s%.2f", record.currencySymbol, record.amount),
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = record.status,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isPaid) StatusActive else StatusExpired,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun ReceiptRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = SecondaryText)
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            color = PrimaryText,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
