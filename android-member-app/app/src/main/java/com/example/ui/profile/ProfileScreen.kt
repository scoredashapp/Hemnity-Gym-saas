package com.example.ui.profile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material.icons.rounded.LockReset
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.PrivacyTip
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.core.util.DateUtils
import com.example.domain.model.MemberProfile
import com.example.domain.model.NotificationPreferences
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnityMemberAvatar
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.ElevatedSurface
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusExpired

private enum class PolicyDocType(val title: String, val body: String) {
    PRIVACY(
        "Privacy Policy",
        "Hemnity Gym Member accesses only your authorized gym membership, attendance, payment, and digital ID card records over HTTPS. Authentication tokens are encrypted using Android Keystore AES-256-GCM hardware-backed keys. Plaintext passwords are never stored on this device.",
    ),
    TERMS(
        "Terms & Conditions",
        "Your digital gym pass QR code is valid exclusively for active memberships verified by your registered gym. Sharing or duplicating QR passes across individuals is prohibited. Payment and renewal terms are governed by your respective gym.",
    ),
    HELP(
        "Help & Support",
        "Need help with your membership, pending fees, or QR pass? Contact your gym front desk or reach Hemnity platform support via https://gym.hemnity.in.",
    ),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onOpenMyGyms: () -> Unit,
    onOpenPayments: () -> Unit,
    onLoggedOut: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val feedback by viewModel.feedbackMessage.collectAsStateWithLifecycle()
    val loggedOut by viewModel.loggedOut.collectAsStateWithLifecycle()
    val platformInfo by viewModel.platformInfo.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    var editProfileOpen by remember { mutableStateOf(false) }
    var changePasswordOpen by remember { mutableStateOf(false) }
    var notifSettingsOpen by remember { mutableStateOf(false) }
    var activePolicyDoc by remember { mutableStateOf<PolicyDocType?>(null) }
    var confirmLogoutOpen by remember { mutableStateOf(false) }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { _ -> }

    LaunchedEffect(Unit) {
        viewModel.loadProfile()
    }

    LaunchedEffect(loggedOut) {
        if (loggedOut) {
            viewModel.consumeLoggedOut()
            onLoggedOut()
        }
    }

    LaunchedEffect(feedback) {
        feedback?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearFeedback()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("profile_screen"),
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
                is ProfileUiState.Loading -> {
                    item { HemnitySkeletonBox(height = 140.dp, cornerRadius = 22.dp) }
                    item { HemnitySkeletonBox(height = 220.dp) }
                }

                is ProfileUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadProfile() },
                        )
                    }
                    item {
                        LogoutButton(onClick = { confirmLogoutOpen = true })
                    }
                }

                is ProfileUiState.Success -> {
                    val profile = state.profile
                    item {
                        ProfileHeaderCard(
                            profile = profile,
                            onEdit = if (profile.editableFields.isNotEmpty()) {
                                { editProfileOpen = true }
                            } else {
                                null
                            },
                        )
                    }
                    item { ProfileDetailsCard(profile) }
                    item {
                        SettingsCard(
                            gymsCount = profile.gyms.size,
                            onOpenMyGyms = onOpenMyGyms,
                            onOpenPayments = onOpenPayments,
                            onOpenChangePassword = { changePasswordOpen = true },
                            onOpenNotifications = {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    val granted = ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.POST_NOTIFICATIONS,
                                    ) == PackageManager.PERMISSION_GRANTED
                                    if (!granted) {
                                        notificationPermissionLauncher.launch(
                                            Manifest.permission.POST_NOTIFICATIONS
                                        )
                                    }
                                }
                                notifSettingsOpen = true
                            },
                            onOpenPrivacy = { activePolicyDoc = PolicyDocType.PRIVACY },
                            onOpenTerms = { activePolicyDoc = PolicyDocType.TERMS },
                            onOpenHelp = { activePolicyDoc = PolicyDocType.HELP },
                        )
                    }
                    item {
                        LogoutButton(onClick = { confirmLogoutOpen = true })
                    }
                }
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    val currentProfile = (uiState as? ProfileUiState.Success)?.profile
    if (editProfileOpen && currentProfile != null) {
        EditProfileSheet(
            profile = currentProfile,
            onDismiss = { editProfileOpen = false },
            onSave = { name, phone, emName, emPhone, emRel ->
                viewModel.updateProfile(name, phone, emName, emPhone, emRel)
                editProfileOpen = false
            },
        )
    }

    if (changePasswordOpen) {
        ChangePasswordSheet(
            onDismiss = { changePasswordOpen = false },
            onSubmit = { current, newPw, confirm ->
                viewModel.changePassword(current, newPw, confirm)
                changePasswordOpen = false
            },
        )
    }

    if (notifSettingsOpen && currentProfile != null) {
        NotificationSettingsSheet(
            initialPrefs = currentProfile.notificationPreferences,
            onDismiss = { notifSettingsOpen = false },
            onSave = { updated ->
                viewModel.updateNotificationPreferences(updated)
                notifSettingsOpen = false
            },
        )
    }

    activePolicyDoc?.let { doc ->
        val dynamicBody = when (doc) {
            PolicyDocType.PRIVACY -> platformInfo?.legalPrivacySummary?.takeIf { it.isNotBlank() } ?: doc.body
            PolicyDocType.TERMS -> platformInfo?.legalTermsSummary?.takeIf { it.isNotBlank() } ?: doc.body
            PolicyDocType.HELP -> {
                val info = platformInfo
                if (info != null) {
                    buildString {
                        append(info.softwareName)
                        append("\n\nEmail: ").append(info.supportEmail)
                        if (info.supportPhone.isNotBlank()) append("\nPhone: ").append(info.supportPhone)
                        if (info.supportAddress.isNotBlank()) append("\nAddress: ").append(info.supportAddress)
                    }
                } else {
                    doc.body
                }
            }
        }
        AlertDialog(
            onDismissRequest = { activePolicyDoc = null },
            containerColor = SecondaryBackground,
            titleContentColor = PrimaryText,
            textContentColor = SecondaryText,
            title = { Text(doc.title, fontWeight = FontWeight.Bold) },
            text = { Text(dynamicBody, style = MaterialTheme.typography.bodyMedium) },
            confirmButton = {
                TextButton(onClick = { activePolicyDoc = null }) {
                    Text("Close", color = PrimaryOrange)
                }
            },
        )
    }

    if (confirmLogoutOpen) {
        AlertDialog(
            onDismissRequest = { confirmLogoutOpen = false },
            containerColor = SecondaryBackground,
            titleContentColor = PrimaryText,
            textContentColor = SecondaryText,
            title = { Text("Log Out", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to log out and clear your secure session from this device?") },
            confirmButton = {
                Button(
                    onClick = {
                        confirmLogoutOpen = false
                        viewModel.logout()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = StatusExpired),
                    modifier = Modifier.testTag("confirm_logout_button"),
                ) {
                    Text("Log Out")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogoutOpen = false }) {
                    Text("Cancel", color = SecondaryText)
                }
            },
        )
    }
}

@Composable
private fun ProfileHeaderCard(
    profile: MemberProfile,
    onEdit: (() -> Unit)?,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                HemnityMemberAvatar(
                    photoUrl = profile.photoUrl,
                    memberName = profile.fullName,
                    size = 64.dp,
                )
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        text = profile.fullName,
                        style = MaterialTheme.typography.headlineMedium,
                        color = PrimaryText,
                    )
                    Text(
                        text = profile.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText,
                    )
                    Text(
                        text = profile.phone,
                        style = MaterialTheme.typography.labelSmall,
                        color = PrimaryOrange,
                    )
                }
            }
            if (onEdit != null) {
                OutlinedButton(
                    onClick = onEdit,
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, CardBorderSubtle),
                    modifier = Modifier.testTag("edit_profile_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Edit,
                        contentDescription = "Edit profile",
                        tint = PrimaryOrange,
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileDetailsCard(profile: MemberProfile) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Member Details",
                style = MaterialTheme.typography.titleMedium,
                color = PrimaryText,
            )
            ProfileInfoRow("Date of Joining", DateUtils.formatDisplayDate(profile.joiningDate))
            ProfileInfoRow("Registered Mobile", profile.phone)
            ProfileInfoRow("Email", profile.email)
            if (profile.emergencyContactAuthorized) {
                HorizontalDivider(color = CardBorderSubtle)
                ProfileInfoRow(
                    "Emergency Contact",
                    listOfNotNull(
                        profile.emergencyContactName,
                        profile.emergencyContactPhone,
                        profile.emergencyContactRelation?.let { "($it)" },
                    ).joinToString(" ").ifBlank { "Not set" },
                )
            }
        }
    }
}

@Composable
private fun ProfileInfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = SecondaryText)
        Text(
            text = value,
            style = MaterialTheme.typography.titleSmall,
            color = PrimaryText,
        )
    }
}

@Composable
private fun SettingsCard(
    gymsCount: Int,
    onOpenMyGyms: () -> Unit,
    onOpenPayments: () -> Unit,
    onOpenChangePassword: () -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenHelp: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            SettingsRow(
                icon = Icons.Rounded.FitnessCenter,
                title = "My Gyms ($gymsCount)",
                onClick = onOpenMyGyms,
                tag = "profile_my_gyms_row",
            )
            HorizontalDivider(color = CardBorderSubtle)
            SettingsRow(
                icon = Icons.Rounded.AccountBalanceWallet,
                title = "My Payments & Receipts",
                onClick = onOpenPayments,
                tag = "profile_payments_row",
            )
            HorizontalDivider(color = CardBorderSubtle)
            SettingsRow(
                icon = Icons.Rounded.LockReset,
                title = "Change Password",
                onClick = onOpenChangePassword,
                tag = "profile_change_password_row",
            )
            HorizontalDivider(color = CardBorderSubtle)
            SettingsRow(
                icon = Icons.Rounded.NotificationsActive,
                title = "Notification Settings",
                onClick = onOpenNotifications,
                tag = "profile_notification_settings_row",
            )
            HorizontalDivider(color = CardBorderSubtle)
            SettingsRow(
                icon = Icons.Rounded.PrivacyTip,
                title = "Privacy Policy",
                onClick = onOpenPrivacy,
                tag = "profile_privacy_row",
            )
            HorizontalDivider(color = CardBorderSubtle)
            SettingsRow(
                icon = Icons.Rounded.Description,
                title = "Terms & Conditions",
                onClick = onOpenTerms,
                tag = "profile_terms_row",
            )
            HorizontalDivider(color = CardBorderSubtle)
            SettingsRow(
                icon = Icons.AutoMirrored.Rounded.HelpOutline,
                title = "Help & Support",
                onClick = onOpenHelp,
                tag = "profile_help_row",
            )
        }
    }
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit,
    tag: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 16.dp)
            .testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = PrimaryOrange)
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = PrimaryText,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = SecondaryText,
        )
    }
}

@Composable
private fun LogoutButton(onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .testTag("logout_button"),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, StatusExpired.copy(alpha = 0.55f)),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Rounded.Logout,
            contentDescription = null,
            tint = StatusExpired,
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text("Log Out", color = StatusExpired, fontWeight = FontWeight.Bold)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditProfileSheet(
    profile: MemberProfile,
    onDismiss: () -> Unit,
    onSave: (String?, String?, String?, String?, String?) -> Unit,
) {
    val editable = profile.editableFields
    var fullName by remember { mutableStateOf(profile.fullName) }
    var phone by remember { mutableStateOf(profile.phone) }
    var emName by remember { mutableStateOf(profile.emergencyContactName.orEmpty()) }
    var emPhone by remember { mutableStateOf(profile.emergencyContactPhone.orEmpty()) }
    var emRel by remember { mutableStateOf(profile.emergencyContactRelation.orEmpty()) }

    val colors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = PrimaryOrange,
        unfocusedBorderColor = CardBorderSubtle,
        focusedContainerColor = ElevatedSurface,
        unfocusedContainerColor = ElevatedSurface,
        focusedTextColor = PrimaryText,
        unfocusedTextColor = PrimaryText,
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = SecondaryBackground,
        contentColor = PrimaryText,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Edit Profile", style = MaterialTheme.typography.headlineMedium, color = PrimaryText)
            if ("full_name" in editable || "name" in editable) {
                OutlinedTextField(
                    value = fullName,
                    onValueChange = { fullName = it },
                    label = { Text("Full Name") },
                    colors = colors,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if ("phone" in editable || "mobile" in editable) {
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Mobile Number") },
                    colors = colors,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if ("emergency_contact" in editable || "emergency_contact_phone" in editable) {
                OutlinedTextField(
                    value = emName,
                    onValueChange = { emName = it },
                    label = { Text("Emergency Contact Name") },
                    colors = colors,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = emPhone,
                    onValueChange = { emPhone = it },
                    label = { Text("Emergency Contact Phone") },
                    colors = colors,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = emRel,
                    onValueChange = { emRel = it },
                    label = { Text("Relationship") },
                    colors = colors,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Button(
                onClick = {
                    onSave(
                        fullName.takeIf { "full_name" in editable || "name" in editable },
                        phone.takeIf { "phone" in editable || "mobile" in editable },
                        emName.takeIf { "emergency_contact" in editable || "emergency_contact_name" in editable },
                        emPhone.takeIf { "emergency_contact" in editable || "emergency_contact_phone" in editable },
                        emRel.takeIf { "emergency_contact" in editable || "emergency_contact_relation" in editable },
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryOrange),
            ) {
                Text("Save Changes", fontWeight = FontWeight.SemiBold)
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChangePasswordSheet(
    onDismiss: () -> Unit,
    onSubmit: (String, String, String) -> Unit,
) {
    var current by remember { mutableStateOf("") }
    var newPw by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }

    val colors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = PrimaryOrange,
        unfocusedBorderColor = CardBorderSubtle,
        focusedContainerColor = ElevatedSurface,
        unfocusedContainerColor = ElevatedSurface,
        focusedTextColor = PrimaryText,
        unfocusedTextColor = PrimaryText,
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = SecondaryBackground,
        contentColor = PrimaryText,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Change Password", style = MaterialTheme.typography.headlineMedium, color = PrimaryText)
            OutlinedTextField(
                value = current,
                onValueChange = { current = it },
                label = { Text("Current Password") },
                visualTransformation = PasswordVisualTransformation(),
                colors = colors,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = newPw,
                onValueChange = { newPw = it },
                label = { Text("New Password") },
                visualTransformation = PasswordVisualTransformation(),
                colors = colors,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = confirm,
                onValueChange = { confirm = it },
                label = { Text("Confirm New Password") },
                visualTransformation = PasswordVisualTransformation(),
                colors = colors,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { onSubmit(current, newPw, confirm) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryOrange),
            ) {
                Text("Update Password", fontWeight = FontWeight.SemiBold)
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationSettingsSheet(
    initialPrefs: NotificationPreferences,
    onDismiss: () -> Unit,
    onSave: (NotificationPreferences) -> Unit,
) {
    var prefs by remember { mutableStateOf(initialPrefs) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = SecondaryBackground,
        contentColor = PrimaryText,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Notification Preferences",
                style = MaterialTheme.typography.headlineMedium,
                color = PrimaryText,
            )
            PrefSwitchRow("Push Notifications", prefs.pushEnabled) {
                prefs = prefs.copy(pushEnabled = it)
            }
            PrefSwitchRow("Membership Expiry Alerts", prefs.membershipAlerts) {
                prefs = prefs.copy(membershipAlerts = it)
            }
            PrefSwitchRow("Payment & Receipt Alerts", prefs.paymentAlerts) {
                prefs = prefs.copy(paymentAlerts = it)
            }
            PrefSwitchRow("Gym Announcements & Holidays", prefs.gymAnnouncements) {
                prefs = prefs.copy(gymAnnouncements = it)
            }
            Button(
                onClick = { onSave(prefs) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryOrange),
            ) {
                Text("Save Preferences", fontWeight = FontWeight.SemiBold)
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
private fun PrefSwitchRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = title, style = MaterialTheme.typography.bodyLarge, color = PrimaryText)
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = PrimaryOrange,
            ),
        )
    }
}
