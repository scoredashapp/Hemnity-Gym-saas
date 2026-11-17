package com.example.ui.gyms

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.FitnessCenter
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.example.core.util.DateUtils
import com.example.domain.model.GymMembershipSummary
import com.example.ui.components.HemnityEmptyState
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnityGymAvatar
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.components.MembershipStatusBadge
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.PrimaryBackground
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyGymsScreen(
    viewModel: GymsViewModel,
    onGymSelected: () -> Unit,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)

    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.loadGyms()
    }

    Scaffold(
        containerColor = PrimaryBackground,
        topBar = {
            TopAppBar(
                title = { Text("My Gyms", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("my_gyms_back_button"),
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
                .widthIn(max = 720.dp),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    text = "Select a gym to switch your active membership, QR pass, attendance, and payment records.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SecondaryText,
                )
            }

            when (val state = uiState) {
                is GymsUiState.Loading -> {
                    items(3) { HemnitySkeletonBox(height = 112.dp) }
                }
                is GymsUiState.Error -> {
                    item {
                        HemnityErrorCard(
                            error = state.error,
                            onRetry = { viewModel.loadGyms() },
                        )
                    }
                }
                is GymsUiState.Success -> {
                    if (state.gyms.isEmpty()) {
                        item {
                            HemnityEmptyState(
                                icon = Icons.Rounded.FitnessCenter,
                                title = "No Gym Memberships Found",
                                subtitle = "Ask your gym reception to link your member account.",
                            )
                        }
                    } else {
                        items(state.gyms, key = { "${it.gymId}_${it.membershipId}" }) { gym ->
                            GymSelectionCard(
                                gym = gym,
                                onSelect = {
                                    viewModel.selectGym(gym.gymId, onGymSelected)
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
private fun GymSelectionCard(
    gym: GymMembershipSummary,
    onSelect: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onSelect)
            .testTag("gym_card_${gym.gymId}"),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(
            width = if (gym.isCurrent) 1.5.dp else 1.dp,
            color = if (gym.isCurrent) PrimaryOrange else CardBorderSubtle,
        ),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    HemnityGymAvatar(
                        logoUrl = gym.gymLogoUrl,
                        gymName = gym.gymName,
                        size = 46.dp,
                    )
                    Column {
                        Text(
                            text = gym.gymName,
                            style = MaterialTheme.typography.titleMedium,
                            color = PrimaryText,
                        )
                        Text(
                            text = "${gym.planName}${gym.city?.let { " • $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                        )
                    }
                }
                if (gym.isCurrent) {
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = "Selected gym",
                        tint = PrimaryOrange,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = "Expires ${DateUtils.formatDisplayDate(gym.expiryDate)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "ID: ${gym.membershipId}",
                        style = MaterialTheme.typography.labelSmall,
                        color = PrimaryOrange,
                    )
                }
                MembershipStatusBadge(status = gym.status)
            }
        }
    }
}
