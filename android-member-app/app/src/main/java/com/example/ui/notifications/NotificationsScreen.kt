package com.example.ui.notifications

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.CardMembership
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.EventBusy
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.model.MemberNotification
import com.example.domain.model.NotificationType
import com.example.ui.components.HemnityEmptyState
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.OrangeContainerDark
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusActive
import com.example.ui.theme.StatusExpired
import com.example.ui.theme.StatusHoliday

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.loadNotifications()
    }

    Scaffold(
        containerColor = PrimaryBackground,
        topBar = {
            TopAppBar(
                title = { Text("Notifications", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("notifications_back_button"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                actions = {
                    val hasUnread = (uiState as? NotificationsUiState.Success)?.feed?.unreadCount ?: 0 > 0
                    if (hasUnread) {
                        TextButton(
                            onClick = viewModel::markAllRead,
                            modifier = Modifier.testTag("mark_all_read_button"),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.DoneAll,
                                contentDescription = "Mark all read",
                                tint = PrimaryOrange,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(" Read All", color = PrimaryOrange)
                        }
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
                .testTag("notifications_screen"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (val state = uiState) {
                is NotificationsUiState.Loading -> {
                    items(4) { HemnitySkeletonBox(height = 92.dp) }
                }
                is NotificationsUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadNotifications() },
                        )
                    }
                }
                is NotificationsUiState.Success -> {
                    if (state.feed.items.isEmpty()) {
                        item {
                            HemnityEmptyState(
                                icon = Icons.Rounded.NotificationsNone,
                                title = "No Notifications Yet",
                                subtitle = "Membership alerts, payment receipts, and gym announcements will appear here.",
                            )
                        }
                    } else {
                        items(state.feed.items, key = { it.id }) { item ->
                            NotificationCard(
                                notification = item,
                                onClick = {
                                    if (!item.isRead) {
                                        viewModel.markRead(item.id)
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    notification: MemberNotification,
    onClick: () -> Unit,
) {
    val (icon, tint) = when (notification.type) {
        NotificationType.EXPIRING_SOON, NotificationType.MEMBERSHIP_RENEWED ->
            Icons.Rounded.CardMembership to AccentOrange
        NotificationType.EXPIRED, NotificationType.PAYMENT_DUE ->
            Icons.Rounded.CardMembership to StatusExpired
        NotificationType.PAYMENT_RECEIVED ->
            Icons.Rounded.Payments to StatusActive
        NotificationType.GYM_HOLIDAY ->
            Icons.Rounded.EventBusy to StatusHoliday
        NotificationType.GYM_ANNOUNCEMENT, NotificationType.GENERAL ->
            Icons.Rounded.Campaign to PrimaryOrange
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(
            width = 1.dp,
            color = if (!notification.isRead) PrimaryOrange.copy(alpha = 0.55f) else CardBorderSubtle,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(OrangeContainerDark.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = icon, contentDescription = notification.type.label, tint = tint)
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = notification.type.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = tint,
                    )
                    if (!notification.isRead) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(PrimaryOrange),
                        )
                    }
                }
                Text(
                    text = notification.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = PrimaryText,
                )
                Text(
                    text = notification.message,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
                if (notification.createdAt.isNotBlank()) {
                    Text(
                        text = listOfNotNull(notification.gymName, notification.createdAt).joinToString(" • "),
                        style = MaterialTheme.typography.labelSmall,
                        color = SecondaryText,
                    )
                }
            }
        }
    }
}
