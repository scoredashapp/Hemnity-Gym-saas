package com.example.ui.screens.owner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.FlashlightOff
import androidx.compose.material.icons.filled.FlashlightOn
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.R
import com.example.domain.model.CheckInOutcome
import com.example.domain.model.QrCheckInResult
import com.example.ui.components.BackendExtensionRequiredCard
import com.example.ui.components.EmptyStateCard
import com.example.ui.components.HemnityCard
import com.example.ui.components.HemnityPullToRefreshBox
import com.example.ui.components.HemnityTopHeader
import com.example.ui.components.LoadingStatePanel
import com.example.ui.components.OfflineRetryState
import com.example.ui.components.RefreshErrorBanner
import com.example.ui.components.StatusBadge
import com.example.ui.theme.LocalHemnityColors
import com.example.ui.theme.OrangePrimary
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@Composable
fun OwnerAttendanceScreen(
    uiState: OwnerUiState,
    onQrDetected: (String) -> Unit,
    onManualCheckIn: (String) -> Unit,
    onResumeScanner: () -> Unit,
    onRefreshHistory: () -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) {
        onRefreshHistory()
    }

    val context = LocalContext.current
    val hasHardwareCamera = remember(context) {
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var cameraUnavailableReason by remember { mutableStateOf<String?>(null) }
    var torchEnabled by remember { mutableStateOf(false) }
    var manualCode by remember { mutableStateOf("") }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    Column(modifier = modifier.fillMaxSize()) {
        HemnityTopHeader(
            title = "QR Attendance",
            subtitle = "POST /api/v1/owner/attendance/qr-checkin",
            onRefresh = onRefreshHistory,
            isRefreshing = uiState.isRefreshingAttendance
        )

        HemnityPullToRefreshBox(
            isRefreshing = uiState.isRefreshingAttendance,
            onRefresh = onRefreshHistory,
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                val refreshErr = uiState.attendanceRefreshError
                if (!refreshErr.isNullOrBlank()) {
                    RefreshErrorBanner(message = refreshErr, onRetry = onRefreshHistory)
                }

                when {
                    !hasHardwareCamera || !cameraUnavailableReason.isNullOrBlank() -> {
                        HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Filled.VideocamOff,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(28.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Camera Unavailable", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        text = cameraUnavailableReason
                                            ?: "This device does not expose an available camera. Use Manual Member Code Check-In below.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            if (hasHardwareCamera) {
                                Spacer(modifier = Modifier.height(10.dp))
                                OutlinedButton(
                                    onClick = { cameraUnavailableReason = null },
                                    modifier = Modifier.fillMaxWidth().height(48.dp)
                                ) {
                                    Text("Retry Camera Initialization")
                                }
                            }
                        }
                    }
                    !hasCameraPermission -> {
                        HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Filled.CameraAlt,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(28.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Camera Permission Required", style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        text = "Grant camera access to scan member QR ID cards at reception.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(14.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Button(
                                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                                    modifier = Modifier.weight(1f).height(48.dp).testTag("grant_camera_permission_button")
                                ) {
                                    Text("Enable Camera")
                                }
                                OutlinedButton(
                                    onClick = {
                                        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                            data = Uri.fromParts("package", context.packageName, null)
                                        }
                                        context.startActivity(intent)
                                    },
                                    modifier = Modifier.height(48.dp)
                                ) {
                                    Text("App Settings")
                                }
                            }
                        }
                    }
                    else -> {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(290.dp)
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color.Black)
                        ) {
                            CameraQrPreview(
                                isPaused = uiState.scannerPaused || uiState.isCheckingIn,
                                torchEnabled = torchEnabled,
                                onQrCodeScanned = onQrDetected,
                                onCameraUnavailable = { reason -> cameraUnavailableReason = reason },
                                modifier = Modifier.fillMaxSize()
                            )

                            ScannerReticleOverlay(
                                isActive = !uiState.scannerPaused && !uiState.isCheckingIn,
                                modifier = Modifier.fillMaxSize()
                            )

                            IconButton(
                                onClick = { torchEnabled = !torchEnabled },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(10.dp)
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color.Black.copy(alpha = 0.55f))
                                    .testTag("torch_toggle_button")
                            ) {
                                Icon(
                                    imageVector = if (torchEnabled) Icons.Filled.FlashlightOn else Icons.Filled.FlashlightOff,
                                    contentDescription = stringResource(R.string.cd_torch),
                                    tint = if (torchEnabled) OrangePrimary else Color.White
                                )
                            }

                            if (uiState.isCheckingIn) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(Color.Black.copy(alpha = 0.65f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        CircularProgressIndicator(color = OrangePrimary)
                                        Spacer(modifier = Modifier.height(10.dp))
                                        Text(
                                            text = "Verifying QR credential...",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = Color.White
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                val checkInResult = uiState.checkInResult
                if (checkInResult != null) {
                    CheckInResultCard(result = checkInResult, onScanAgain = onResumeScanner)
                }

                val networkErr = uiState.checkInNetworkError
                if (networkErr != null) {
                    OfflineRetryState(
                        message = networkErr,
                        onRetry = {
                            val last = uiState.lastScannedPayload
                            if (!last.isNullOrBlank()) {
                                onResumeScanner()
                                onManualCheckIn(last)
                            } else {
                                onResumeScanner()
                            }
                        }
                    )
                }

                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Keyboard, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Manual Member Code Check-In", style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Enter a member's QR token or membership code if their card cannot be scanned.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = manualCode,
                            onValueChange = { manualCode = it },
                            label = { Text("Member / QR Code") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    if (manualCode.isNotBlank() && !uiState.isCheckingIn) {
                                        onManualCheckIn(manualCode)
                                    }
                                }
                            ),
                            modifier = Modifier.weight(1f).testTag("manual_checkin_input")
                        )
                        Button(
                            onClick = { onManualCheckIn(manualCode) },
                            enabled = manualCode.isNotBlank() && !uiState.isCheckingIn,
                            modifier = Modifier.height(54.dp).testTag("manual_checkin_submit")
                        ) {
                            Text("Check In")
                        }
                    }
                }

                if (uiState.scannerPaused && checkInResult == null && networkErr == null && !uiState.isCheckingIn) {
                    Button(
                        onClick = onResumeScanner,
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Icon(Icons.Filled.QrCodeScanner, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Resume QR Scanner")
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Today's Check-Ins & History", style = MaterialTheme.typography.titleMedium)
                }

                if (uiState.sessionCheckIns.isNotEmpty()) {
                    uiState.sessionCheckIns.forEach { item ->
                        HemnityCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.memberName, style = MaterialTheme.typography.titleSmall)
                                    Text(
                                        text = listOfNotNull(item.memberCode, item.checkedInAt, item.method)
                                            .joinToString(" • "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                StatusBadge(text = item.status ?: "Checked In")
                            }
                        }
                    }
                }

                when (val hist = uiState.todayAttendanceHistory) {
                    is SectionState.Loading -> LoadingStatePanel("Loading today's attendance log...")
                    is SectionState.Error -> OfflineRetryState(hist.message, onRefreshHistory)
                    is SectionState.ExtensionRequired -> {
                        BackendExtensionRequiredCard(
                            featureTitle = "Attendance History",
                            endpointRoute = hist.route,
                            explanation = "Live QR check-in (POST /owner/attendance/qr-checkin) is active above and check-ins from this session appear here, while full historical logs across devices require GET /api/v1/owner/attendance.",
                            onRetry = onRefreshHistory
                        )
                    }
                    is SectionState.Success -> {
                        if (hist.data.isEmpty()) {
                            EmptyStateCard(
                                title = "No Check-Ins Recorded Today",
                                description = "Scan a member QR code to record the first check-in today."
                            )
                        } else {
                            hist.data.forEach { item ->
                                HemnityCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(item.memberName, style = MaterialTheme.typography.titleSmall)
                                            Text(
                                                text = listOfNotNull(item.memberCode, item.checkedInAt, item.method)
                                                    .joinToString(" • "),
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                        StatusBadge(text = item.status ?: "Checked In")
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun CheckInResultCard(
    result: QrCheckInResult,
    onScanAgain: () -> Unit
) {
    val semantic = LocalHemnityColors.current
    val (title, icon, accent) = when (result.outcome) {
        CheckInOutcome.SUCCESS -> Triple("Attendance Recorded", Icons.Filled.CheckCircle, semantic.success)
        CheckInOutcome.DUPLICATE -> Triple("Duplicate Check-In", Icons.Filled.Warning, semantic.warning)
        CheckInOutcome.EXPIRED -> Triple("Membership Expired / Inactive", Icons.Filled.Error, MaterialTheme.colorScheme.error)
        CheckInOutcome.INVALID_QR -> Triple("Invalid / Revoked QR", Icons.Filled.Error, MaterialTheme.colorScheme.error)
        CheckInOutcome.ERROR -> Triple("Check-In Rejected", Icons.Filled.Error, MaterialTheme.colorScheme.error)
    }

    HemnityCard(modifier = Modifier.fillMaxWidth(), highlightAccent = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(30.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = accent)
                Text(result.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (!result.memberName.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                MemberAvatar(photoUrl = result.memberPhotoUrl, name = result.memberName, sizeDp = 46)
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(result.memberName, style = MaterialTheme.typography.titleSmall)
                    val meta = listOfNotNull(
                        result.memberCode,
                        result.planName,
                        result.checkedInAt?.let { "Checked in: $it" }
                    ).joinToString(" • ")
                    if (meta.isNotBlank()) {
                        Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (!result.membershipStatus.isNullOrBlank()) {
                    StatusBadge(text = result.membershipStatus)
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))
        Button(
            onClick = onScanAgain,
            modifier = Modifier.fillMaxWidth().height(48.dp).testTag("scan_again_button"),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
        ) {
            Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Scan Again")
        }
    }
}

@Composable
private fun ScannerReticleOverlay(isActive: Boolean, modifier: Modifier = Modifier) {
    val bracketColor = if (isActive) OrangePrimary else Color.White.copy(alpha = 0.5f)
    Canvas(modifier = modifier) {
        val boxSize = size.minDimension * 0.62f
        val left = (size.width - boxSize) / 2f
        val top = (size.height - boxSize) / 2f
        val right = left + boxSize
        val bottom = top + boxSize
        val corner = boxSize * 0.18f
        val stroke = 6f

        drawLine(bracketColor, Offset(left, top), Offset(left + corner, top), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(left, top), Offset(left, top + corner), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(right - corner, top), Offset(right, top), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(right, top), Offset(right, top + corner), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(left, bottom - corner), Offset(left, bottom), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(left, bottom), Offset(left + corner, bottom), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(right - corner, bottom), Offset(right, bottom), stroke, StrokeCap.Round)
        drawLine(bracketColor, Offset(right, bottom - corner), Offset(right, bottom), stroke, StrokeCap.Round)
    }
}

@OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraQrPreview(
    isPaused: Boolean,
    torchEnabled: Boolean,
    onQrCodeScanned: (String) -> Unit,
    onCameraUnavailable: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val pausedState = rememberUpdatedState(isPaused)
    val scanCallbackState = rememberUpdatedState(onQrCodeScanned)
    val unavailableState = rememberUpdatedState(onCameraUnavailable)
    val scanLocked = remember { AtomicBoolean(false) }

    LaunchedEffect(isPaused) {
        if (!isPaused) {
            scanLocked.set(false)
        }
    }

    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val barcodeScanner = remember {
        val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
        BarcodeScanning.getClient(options)
    }
    var boundCamera by remember { mutableStateOf<Camera?>(null) }

    DisposableEffect(torchEnabled, boundCamera) {
        boundCamera?.cameraControl?.enableTorch(torchEnabled)
        onDispose {}
    }

    DisposableEffect(Unit) {
        onDispose {
            barcodeScanner.close()
            analysisExecutor.shutdown()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }

            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = runCatching { cameraProviderFuture.get() }.getOrElse { err ->
                    unavailableState.value("Camera provider failed to initialize: ${err.message ?: "Unavailable"}")
                    return@addListener
                }
                val selector = when {
                    runCatching { cameraProvider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) }.getOrDefault(false) ->
                        CameraSelector.DEFAULT_BACK_CAMERA
                    runCatching { cameraProvider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) }.getOrDefault(false) ->
                        CameraSelector.DEFAULT_FRONT_CAMERA
                    else -> null
                }
                if (selector == null) {
                    unavailableState.value("No usable front or back camera detected on this device.")
                    return@addListener
                }

                val preview = Preview.Builder().build().apply {
                    surfaceProvider = previewView.surfaceProvider
                }
                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
                    if (pausedState.value || scanLocked.get()) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val mediaImage = imageProxy.image
                    if (mediaImage != null) {
                        val inputImage = InputImage.fromMediaImage(
                            mediaImage,
                            imageProxy.imageInfo.rotationDegrees
                        )
                        barcodeScanner.process(inputImage)
                            .addOnSuccessListener { barcodes ->
                                val raw = barcodes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue
                                if (!raw.isNullOrBlank() && !pausedState.value && scanLocked.compareAndSet(false, true)) {
                                    ContextCompat.getMainExecutor(ctx).execute {
                                        scanCallbackState.value(raw)
                                    }
                                }
                            }
                            .addOnCompleteListener {
                                imageProxy.close()
                            }
                    } else {
                        imageProxy.close()
                    }
                }

                runCatching {
                    cameraProvider.unbindAll()
                    boundCamera = cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        selector,
                        preview,
                        imageAnalysis
                    )
                    boundCamera?.cameraControl?.enableTorch(torchEnabled)
                }.onFailure { err ->
                    unavailableState.value("Unable to bind camera preview: ${err.message ?: "Unavailable"}")
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        }
    )
}
