package com.example.ui.screens.owner

import android.graphics.Bitmap
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.core.qr.IdCardAssets
import com.example.core.qr.IdCardRenderer
import com.example.ui.components.EmptyStateCard
import com.example.ui.components.HemnityCard
import com.example.ui.components.HemnityPullToRefreshBox
import com.example.ui.components.HemnityTopHeader
import com.example.ui.components.RefreshErrorBanner
import kotlinx.coroutines.launch

@Composable
fun OwnerIdCardsScreen(
    uiState: OwnerUiState,
    initialSelectedMemberId: String? = null,
    onReissueQr: (String) -> Unit,
    onRefreshMembers: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val members = (uiState.members as? SectionState.Success)?.data.orEmpty()
    var selectedMemberId by remember { mutableStateOf(initialSelectedMemberId) }

    LaunchedEffect(initialSelectedMemberId, members) {
        if (!initialSelectedMemberId.isNullOrBlank() && members.any { it.id == initialSelectedMemberId }) {
            selectedMemberId = initialSelectedMemberId
        } else if (selectedMemberId != null && members.none { it.id == selectedMemberId }) {
            selectedMemberId = null
        }
    }

    val member = members.firstOrNull { it.id == selectedMemberId }
    val dash = (uiState.dashboard as? SectionState.Success)?.data
    val settingsData = (uiState.settings as? SectionState.Success)?.data
    val gymName = dash?.gymName ?: uiState.session?.gymName?.ifBlank { null } ?: "Hemnity Gym"
    val gymLogoUrl = dash?.gymLogoUrl ?: settingsData?.gymLogoUrl

    var cardSide by remember { mutableStateOf("FRONT") }
    var includeBackInExport by remember { mutableStateOf(true) }
    var exportStatusMessage by remember { mutableStateOf<String?>(null) }

    val cardAssets by produceState(
        initialValue = IdCardAssets(gymLogoBitmap = null, memberPhotoBitmap = null),
        key1 = member?.id,
        key2 = member?.photoUrl,
        key3 = gymLogoUrl
    ) {
        value = IdCardRenderer.loadAssets(context, gymLogoUrl, member?.photoUrl)
    }

    val frontBitmap: Bitmap? = remember(member, gymName, cardAssets) {
        member?.let {
            IdCardRenderer.renderFrontCardBitmap(
                member = it,
                gymName = gymName,
                assets = cardAssets
            )
        }
    }

    val backBitmap: Bitmap? = remember(gymName, settingsData, dash, cardAssets) {
        IdCardRenderer.renderBackCardBitmap(
            gymName = gymName,
            gymAddress = settingsData?.address ?: dash?.gymId?.let { "Tenant Gym ID #$it" },
            gymPhone = settingsData?.phone,
            operatingHours = settingsData?.operatingHours,
            assets = cardAssets
        )
    }

    val savePngLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("image/png")
    ) { uri ->
        val targetBitmap = if (cardSide == "BACK") backBitmap else frontBitmap
        if (uri == null || targetBitmap == null) return@rememberLauncherForActivityResult
        scope.launch {
            val res = IdCardRenderer.exportPngToUri(context, uri, targetBitmap)
            val msg = res.fold(
                onSuccess = { (w, h) -> "Saved verified PNG ID Card (${w}x${h}px)." },
                onFailure = { "PNG export failed: ${it.message}" }
            )
            exportStatusMessage = msg
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    val savePdfLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/pdf")
    ) { uri ->
        val front = frontBitmap ?: return@rememberLauncherForActivityResult
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val res = IdCardRenderer.exportPdfToUri(
                context = context,
                uri = uri,
                frontBitmap = front,
                backBitmap = if (includeBackInExport) backBitmap else null
            )
            val msg = res.fold(
                onSuccess = { bytes -> "Saved verified PDF ID Card (${bytes / 1024} KB)." },
                onFailure = { "PDF export failed: ${it.message}" }
            )
            exportStatusMessage = msg
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "Member ID Card Generator",
            subtitle = "Save PNG, Save PDF, Print & Share QR ID Cards",
            onRefresh = onRefreshMembers,
            isRefreshing = uiState.isRefreshingMembers
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingMembers,
            onRefresh = onRefreshMembers,
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                val refreshErr = uiState.membersRefreshError
                if (!refreshErr.isNullOrBlank()) {
                    RefreshErrorBanner(message = refreshErr, onRetry = onRefreshMembers)
                }

                if (members.isEmpty()) {
                    EmptyStateCard(
                        title = "No Members Loaded",
                        description = "Load members from /api/v1/owner/members to generate digital QR ID cards.",
                        icon = Icons.Filled.QrCode2
                    )
                } else {
                    MemberSearchPicker(
                        members = members,
                        selected = member,
                        onSelect = { picked -> selectedMemberId = picked?.id },
                        label = "Search member (name / ID / phone)"
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FilterChip(
                            selected = cardSide == "FRONT",
                            onClick = { cardSide = "FRONT" },
                            label = { Text("Front Card") },
                            modifier = Modifier.testTag("id_card_front_tab")
                        )
                        FilterChip(
                            selected = cardSide == "BACK",
                            onClick = { cardSide = "BACK" },
                            label = { Text("Back Card") },
                            modifier = Modifier.testTag("id_card_back_tab")
                        )
                    }

                    val previewBitmap = if (cardSide == "BACK") backBitmap else frontBitmap
                    if (member != null && previewBitmap != null) {
                        Image(
                            bitmap = previewBitmap.asImageBitmap(),
                            contentDescription = "Member ID Card ${if (cardSide == "BACK") "Back" else "Front"}",
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f / 1.48f)
                                .clip(RoundedCornerShape(22.dp))
                                .testTag("rendered_id_card_preview"),
                            contentScale = ContentScale.Fit
                        )

                        HemnityCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Include Back Page in PDF & Print",
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Switch(
                                    checked = includeBackInExport,
                                    onCheckedChange = { includeBackInExport = it }
                                )
                            }
                        }

                        if (!exportStatusMessage.isNullOrBlank()) {
                            Text(
                                text = exportStatusMessage!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }

                        val safeFilePrefix = (member.memberCode ?: "member_${member.id}")
                            .replace(Regex("[^A-Za-z0-9_-]"), "_")

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = {
                                    savePngLauncher.launch("${safeFilePrefix}_${cardSide.lowercase()}.png")
                                },
                                modifier = Modifier.weight(1f).height(48.dp).testTag("save_id_png_button")
                            ) {
                                Icon(Icons.Filled.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Save PNG")
                            }
                            OutlinedButton(
                                onClick = {
                                    savePdfLauncher.launch("${safeFilePrefix}_id_card.pdf")
                                },
                                modifier = Modifier.weight(1f).height(48.dp).testTag("save_id_pdf_button")
                            ) {
                                Icon(Icons.Filled.PictureAsPdf, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Save PDF")
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = {
                                    val front = frontBitmap ?: return@OutlinedButton
                                    IdCardRenderer.printIdCard(
                                        context = context,
                                        frontBitmap = front,
                                        backBitmap = if (includeBackInExport) backBitmap else null,
                                        jobName = "Hemnity_ID_${safeFilePrefix}"
                                    )
                                },
                                modifier = Modifier.weight(1f).height(48.dp).testTag("print_id_card_button")
                            ) {
                                Icon(Icons.Filled.Print, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Print Card")
                            }
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        val res = IdCardRenderer.shareCardPng(
                                            context = context,
                                            bitmap = previewBitmap,
                                            fileName = "${safeFilePrefix}_${cardSide.lowercase()}.png",
                                            subject = "${member.name} Gym ID Card"
                                        )
                                        res.onFailure { err ->
                                            val msg = "Share failed: ${err.message}"
                                            exportStatusMessage = msg
                                            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f).height(48.dp).testTag("share_id_card_button")
                            ) {
                                Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Share")
                            }
                        }

                        Button(
                            onClick = { onReissueQr(member.id) },
                            modifier = Modifier.fillMaxWidth().height(48.dp).testTag("reissue_qr_button")
                        ) {
                            Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Reissue Backend QR Credential")
                        }
                    }
                }
            }
        }
    }
}
