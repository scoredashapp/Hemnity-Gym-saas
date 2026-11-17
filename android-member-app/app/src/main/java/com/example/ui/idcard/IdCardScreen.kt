package com.example.ui.idcard

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.core.util.DateUtils
import com.example.core.util.ExportHelper
import com.example.domain.model.DigitalIdCard
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnityGymAvatar
import com.example.ui.components.HemnityMemberAvatar
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.components.MembershipStatusBadge
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.ElevatedSurface
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import kotlinx.coroutines.launch

@Composable
fun IdCardScreen(
    viewModel: IdCardViewModel,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var fullScreenQrOpen by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.loadIdCard()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("id_card_screen"),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 600.dp)
                .align(Alignment.TopCenter),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            when (val state = uiState) {
                is IdCardUiState.Loading -> {
                    item { HemnitySkeletonBox(height = 460.dp, cornerRadius = 26.dp) }
                }
                is IdCardUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadIdCard() },
                        )
                    }
                }
                is IdCardUiState.Success -> {
                    item {
                        DigitalPassCard(
                            card = state.card,
                            qrBitmap = state.qrBitmap,
                            onOpenFullScreen = { fullScreenQrOpen = true },
                            onRefresh = { viewModel.loadIdCard() },
                            onDownload = {
                                scope.launch {
                                    val result = ExportHelper.exportDigitalIdCardPng(
                                        context = context,
                                        card = state.card,
                                        qrBitmap = state.qrBitmap,
                                    )
                                    snackbarHostState.showSnackbar(
                                        result.getOrElse { it.message ?: "Unable to export ID card." }
                                    )
                                }
                            },
                        )
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    val successState = uiState as? IdCardUiState.Success
    if (fullScreenQrOpen && successState?.qrBitmap != null) {
        FullScreenQrDialog(
            card = successState.card,
            qrBitmap = successState.qrBitmap,
            onDismiss = { fullScreenQrOpen = false },
        )
    }
}

@Composable
private fun DigitalPassCard(
    card: DigitalIdCard,
    qrBitmap: Bitmap?,
    onOpenFullScreen: () -> Unit,
    onRefresh: () -> Unit,
    onDownload: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(26.dp),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent),
            border = BorderStroke(1.5.dp, PrimaryOrange.copy(alpha = 0.65f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color(0xFF1C130C), SecondaryBackground, PrimaryBackground)
                        )
                    )
                    .padding(22.dp),
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Gym Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            HemnityGymAvatar(
                                logoUrl = card.gymLogoUrl,
                                gymName = card.gymName,
                                size = 40.dp,
                            )
                            Column {
                                Text(
                                    text = card.gymName,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = PrimaryText,
                                )
                                Text(
                                    text = "OFFICIAL GYM PASS",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = AccentOrange,
                                )
                            }
                        }
                        MembershipStatusBadge(status = card.status)
                    }

                    HorizontalDivider(color = CardBorderSubtle)

                    // Member identity
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        HemnityMemberAvatar(
                            photoUrl = card.memberPhotoUrl,
                            memberName = card.memberName,
                            size = 64.dp,
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = card.memberName,
                                style = MaterialTheme.typography.headlineMedium,
                                color = PrimaryText,
                            )
                            Text(
                                text = "ID: ${card.membershipId}",
                                style = MaterialTheme.typography.labelSmall,
                                color = PrimaryOrange,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    // Plan & Expiry
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(ElevatedSurface)
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(
                                text = "Active Plan",
                                style = MaterialTheme.typography.bodySmall,
                                color = SecondaryText,
                            )
                            Text(
                                text = card.planName,
                                style = MaterialTheme.typography.titleSmall,
                                color = PrimaryText,
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "Valid Until",
                                style = MaterialTheme.typography.bodySmall,
                                color = SecondaryText,
                            )
                            Text(
                                text = DateUtils.formatDisplayDate(card.expiryDate),
                                style = MaterialTheme.typography.titleSmall,
                                color = PrimaryOrange,
                            )
                        }
                    }

                    // QR Block (strictly from server-issued qrPayload)
                    if (qrBitmap != null) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color.White)
                                .padding(16.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                bitmap = qrBitmap.asImageBitmap(),
                                contentDescription = "Verified Gym Check-In QR Code",
                                modifier = Modifier
                                    .size(210.dp)
                                    .testTag("digital_id_qr_image"),
                            )
                        }
                        Text(
                            text = "Present this server-verified QR code at the gym scanner.",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                            textAlign = TextAlign.Center,
                        )
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .background(ElevatedSurface)
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.QrCode2,
                                contentDescription = "QR unavailable",
                                tint = SecondaryText,
                                modifier = Modifier.size(40.dp),
                            )
                            Text(
                                text = "QR Credential Unavailable",
                                style = MaterialTheme.typography.titleSmall,
                                color = PrimaryText,
                            )
                            Text(
                                text = "A server-issued attendance token was not provided for this membership status.",
                                style = MaterialTheme.typography.bodySmall,
                                color = SecondaryText,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }

        // Actions
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (qrBitmap != null) {
                Button(
                    onClick = onOpenFullScreen,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp)
                        .testTag("fullscreen_qr_button"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PrimaryOrange,
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(imageVector = Icons.Rounded.Fullscreen, contentDescription = null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Full-Screen QR", fontWeight = FontWeight.SemiBold)
                }
            }

            if (card.downloadPermitted) {
                OutlinedButton(
                    onClick = onDownload,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp)
                        .testTag("download_id_card_button"),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, CardBorderSubtle),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Download,
                        contentDescription = null,
                        tint = PrimaryOrange,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Save Card", color = PrimaryText)
                }
            }
        }

        OutlinedButton(
            onClick = onRefresh,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .testTag("refresh_qr_button"),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, CardBorderSubtle),
        ) {
            Icon(
                imageVector = Icons.Rounded.Refresh,
                contentDescription = null,
                tint = SecondaryText,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Refresh QR Credential", color = SecondaryText)
        }
    }
}

@Composable
private fun FullScreenQrDialog(
    card: DigitalIdCard,
    qrBitmap: Bitmap,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        BackHandler(onBack = onDismiss)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(PrimaryBackground)
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(48.dp)
                    .testTag("close_fullscreen_qr"),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = "Close full-screen QR",
                    tint = PrimaryText,
                )
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Text(
                    text = card.gymName,
                    style = MaterialTheme.typography.titleLarge,
                    color = AccentOrange,
                )
                Text(
                    text = card.memberName,
                    style = MaterialTheme.typography.headlineLarge,
                    color = PrimaryText,
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color.White)
                        .padding(20.dp),
                ) {
                    Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "Full-screen QR code",
                        modifier = Modifier.size(280.dp),
                    )
                }
                Text(
                    text = "ID: ${card.membershipId}",
                    style = MaterialTheme.typography.labelLarge,
                    color = PrimaryOrange,
                )
                MembershipStatusBadge(status = card.status)
            }
        }
    }
}
