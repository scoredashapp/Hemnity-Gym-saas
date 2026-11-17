package com.example.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.example.core.network.AppError
import com.example.domain.model.MembershipStatus
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.ElevatedSurface
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusActive
import com.example.ui.theme.StatusActiveContainer
import com.example.ui.theme.StatusExpired
import com.example.ui.theme.StatusExpiredContainer
import com.example.ui.theme.StatusExpiringSoon
import com.example.ui.theme.StatusExpiringSoonContainer
import com.example.ui.theme.StatusSuspended
import com.example.ui.theme.StatusSuspendedContainer
import com.example.ui.theme.SurfaceHighlight

@Composable
fun MembershipStatusBadge(
    status: MembershipStatus,
    modifier: Modifier = Modifier,
) {
    val (fg, bg) = when (status) {
        MembershipStatus.ACTIVE -> StatusActive to StatusActiveContainer
        MembershipStatus.EXPIRING_SOON -> StatusExpiringSoon to StatusExpiringSoonContainer
        MembershipStatus.EXPIRED -> StatusExpired to StatusExpiredContainer
        MembershipStatus.SUSPENDED -> StatusSuspended to StatusSuspendedContainer
        MembershipStatus.UNKNOWN -> SecondaryText to SurfaceHighlight
    }

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(bg)
            .border(1.dp, fg.copy(alpha = 0.45f), RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(fg),
        )
        Text(
            text = status.label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = fg,
        )
    }
}

@Composable
fun HemnityMemberAvatar(
    photoUrl: String?,
    memberName: String,
    size: Dp = 48.dp,
    modifier: Modifier = Modifier,
) {
    val initials = memberName
        .trim()
        .split(Regex("\\s+"))
        .take(2)
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .ifEmpty { "M" }

    val borderBrush = Brush.linearGradient(listOf(PrimaryOrange, AccentOrange))
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .border(2.dp, borderBrush, CircleShape)
            .background(ElevatedSurface),
        contentAlignment = Alignment.Center,
    ) {
        if (!photoUrl.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = photoUrl,
                contentDescription = "$memberName profile photo",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(size)
                    .clip(CircleShape),
                error = {
                    Text(
                        text = initials,
                        style = MaterialTheme.typography.titleMedium,
                        color = PrimaryOrange,
                        fontWeight = FontWeight.Bold,
                    )
                },
            )
        } else {
            Text(
                text = initials,
                style = MaterialTheme.typography.titleMedium,
                color = PrimaryOrange,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
fun HemnityGymAvatar(
    logoUrl: String?,
    gymName: String,
    size: Dp = 40.dp,
    modifier: Modifier = Modifier,
) {
    val letter = gymName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "G"
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceHighlight)
            .border(1.dp, CardBorderSubtle, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (!logoUrl.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = logoUrl,
                contentDescription = "$gymName logo",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(size)
                    .clip(RoundedCornerShape(12.dp)),
                error = {
                    Text(
                        text = letter,
                        style = MaterialTheme.typography.titleMedium,
                        color = PrimaryOrange,
                        fontWeight = FontWeight.Bold,
                    )
                },
            )
        } else {
            Text(
                text = letter,
                style = MaterialTheme.typography.titleMedium,
                color = PrimaryOrange,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
fun HemnitySkeletonBox(
    modifier: Modifier = Modifier,
    height: Dp = 100.dp,
    cornerRadius: Dp = 18.dp,
) {
    val transition = rememberInfiniteTransition(label = "skeleton_shimmer")
    val shift by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmer_offset",
    )
    val brush = Brush.linearGradient(
        colors = listOf(
            SecondaryBackground,
            ElevatedSurface,
            SecondaryBackground,
        ),
        start = Offset(shift - 300f, 0f),
        end = Offset(shift, 200f),
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(cornerRadius))
            .background(brush),
    )
}

@Composable
fun HemnityErrorCard(
    error: AppError,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val (icon, title) = when (error) {
        is AppError.Network -> Icons.Rounded.CloudOff to "Connection Issue"
        is AppError.EndpointNotDeployed -> Icons.Rounded.Dns to "Member API Endpoint Pending"
        is AppError.ForbiddenRole -> Icons.Rounded.ErrorOutline to "Access Restricted"
        is AppError.Unauthorized -> Icons.Rounded.ErrorOutline to "Session Required"
        else -> Icons.Rounded.ErrorOutline to "Unable to Load Data"
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("error_state_card"),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(PrimaryOrange.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = PrimaryOrange,
                    modifier = Modifier.size(28.dp),
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = PrimaryText,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error.message,
                style = MaterialTheme.typography.bodyMedium,
                color = SecondaryText,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(20.dp))
            Button(
                onClick = onRetry,
                modifier = Modifier
                    .height(48.dp)
                    .testTag("retry_button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PrimaryOrange,
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(14.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Refresh,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Retry", fontWeight = FontWeight.SemiBold)
            }
            if (error is AppError.EndpointNotDeployed) {
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedButton(
                    onClick = {
                        runCatching {
                            context.startActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://gym.hemnity.in/member/login.php"),
                                )
                            )
                        }
                    },
                    modifier = Modifier.height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, CardBorderSubtle),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                        contentDescription = null,
                        tint = PrimaryOrange,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Open Member Web Portal", color = PrimaryText)
                }
            }
        }
    }
}

@Composable
fun HemnityEmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(ElevatedSurface),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = SecondaryText,
                    modifier = Modifier.size(28.dp),
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = PrimaryText,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = SecondaryText,
                textAlign = TextAlign.Center,
            )
        }
    }
}
