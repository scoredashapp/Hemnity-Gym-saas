package com.example.ui.attendance

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.core.util.DateUtils
import com.example.domain.model.AttendanceMonthSummary
import com.example.domain.model.AttendanceRecord
import com.example.domain.model.CalendarDayInfo
import com.example.domain.model.CalendarDayState
import com.example.ui.components.HemnityEmptyState
import com.example.ui.components.HemnityErrorCard
import com.example.ui.components.HemnitySkeletonBox
import com.example.ui.theme.AccentOrange
import com.example.ui.theme.CardBorderSubtle
import com.example.ui.theme.ElevatedSurface
import com.example.ui.theme.MutedText
import com.example.ui.theme.PrimaryOrange
import com.example.ui.theme.PrimaryText
import com.example.ui.theme.SecondaryBackground
import com.example.ui.theme.SecondaryText
import com.example.ui.theme.StatusActive
import com.example.ui.theme.StatusExpired
import com.example.ui.theme.StatusExpiredContainer
import com.example.ui.theme.StatusHoliday
import com.example.ui.theme.StatusHolidayContainer

@Composable
fun AttendanceScreen(
    viewModel: AttendanceViewModel,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val monthKey by viewModel.selectedMonthKey.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        viewModel.loadAttendance()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .widthIn(max = 720.dp)
            .testTag("attendance_screen"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        when (val state = uiState) {
            is AttendanceUiState.Loading -> {
                item { HemnitySkeletonBox(height = 84.dp) }
                item { HemnitySkeletonBox(height = 280.dp, cornerRadius = 22.dp) }
                item { HemnitySkeletonBox(height = 120.dp) }
            }

            is AttendanceUiState.Error -> {
                item {
                    HemnityErrorCard(
                        error = state.error,
                        onRetry = { viewModel.loadAttendance(monthKey) },
                    )
                }
            }

            is AttendanceUiState.Success -> {
                val summary = state.summary
                item { TodayStatusBanner(summary) }
                item { AttendanceStatsRow(summary) }
                item {
                    MonthlyCalendarCard(
                        monthKey = monthKey,
                        calendarDays = summary.calendarDays,
                        onPreviousMonth = viewModel::previousMonth,
                        onNextMonth = viewModel::nextMonth,
                    )
                }
                item {
                    Text(
                        text = "Check-In History",
                        style = MaterialTheme.typography.titleMedium,
                        color = PrimaryText,
                    )
                }
                if (summary.history.isEmpty()) {
                    item {
                        HemnityEmptyState(
                            icon = Icons.Rounded.CalendarToday,
                            title = "No Attendance Recorded",
                            subtitle = "No gym check-ins were recorded for ${DateUtils.formatMonthTitle(monthKey)}.",
                        )
                    }
                } else {
                    items(summary.history, key = { it.id }) { record ->
                        AttendanceLogRow(record)
                    }
                }
            }
        }
    }
}

@Composable
private fun TodayStatusBanner(summary: AttendanceMonthSummary) {
    val checkedIn = summary.todayStatus.contains("checked", ignoreCase = true) ||
        summary.todayStatus.contains("present", ignoreCase = true) ||
        !summary.todayCheckinTime.isNullOrBlank()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, if (checkedIn) StatusActive.copy(alpha = 0.5f) else CardBorderSubtle),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(if (checkedIn) StatusActive.copy(alpha = 0.16f) else ElevatedSurface),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (checkedIn) Icons.Rounded.CheckCircle else Icons.Rounded.Schedule,
                    contentDescription = "Today's attendance status",
                    tint = if (checkedIn) StatusActive else AccentOrange,
                )
            }
            Column {
                Text(
                    text = "Today's Status",
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
                Text(
                    text = summary.todayStatus,
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                )
                if (!summary.todayCheckinTime.isNullOrBlank()) {
                    Text(
                        text = "Checked in at ${summary.todayCheckinTime}",
                        style = MaterialTheme.typography.labelSmall,
                        color = StatusActive,
                    )
                }
            }
        }
    }
}

@Composable
private fun AttendanceStatsRow(summary: AttendanceMonthSummary) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        StatChipCard("Total Visits", summary.totalVisits.toString(), Modifier.weight(1f))
        StatChipCard("This Month", summary.monthVisits.toString(), Modifier.weight(1f))
        StatChipCard("Streak", "${summary.attendanceStreak}d", Modifier.weight(1f))
    }
}

@Composable
private fun StatChipCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 14.dp, horizontal = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                color = PrimaryOrange,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = SecondaryText,
            )
        }
    }
}

@Composable
private fun MonthlyCalendarCard(
    monthKey: String,
    calendarDays: Map<Int, CalendarDayInfo>,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit,
) {
    val meta = DateUtils.monthGridInfo(monthKey)
    val weekdays = listOf("M", "T", "W", "T", "F", "S", "S")
    val totalCells = meta.leadingEmptyCells + meta.daysInMonth
    val rows = (totalCells + 6) / 7

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = onPreviousMonth,
                    modifier = Modifier.testTag("attendance_prev_month"),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowLeft,
                        contentDescription = "Previous month",
                        tint = PrimaryText,
                    )
                }
                Text(
                    text = DateUtils.formatMonthTitle(monthKey),
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Bold,
                )
                IconButton(
                    onClick = onNextMonth,
                    modifier = Modifier.testTag("attendance_next_month"),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                        contentDescription = "Next month",
                        tint = PrimaryText,
                    )
                }
            }

            Row(modifier = Modifier.fillMaxWidth()) {
                weekdays.forEach { dayName ->
                    Text(
                        text = dayName,
                        modifier = Modifier.weight(1f),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.labelMedium,
                        color = SecondaryText,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (row in 0 until rows) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        for (col in 0 until 7) {
                            val cellIdx = row * 7 + col
                            val dayNum = cellIdx - meta.leadingEmptyCells + 1
                            if (dayNum in 1..meta.daysInMonth) {
                                val dayInfo = calendarDays[dayNum]
                                CalendarDayCell(
                                    dayNum = dayNum,
                                    state = dayInfo?.state ?: CalendarDayState.NO_RECORD,
                                    modifier = Modifier.weight(1f),
                                )
                            } else {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            // Legend
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                LegendDot("Attended", PrimaryOrange)
                LegendDot("No Check-in", ElevatedSurface)
                LegendDot("Holiday", StatusHoliday)
                LegendDot("Absent", StatusExpired)
            }
        }
    }
}

@Composable
private fun CalendarDayCell(
    dayNum: Int,
    state: CalendarDayState,
    modifier: Modifier = Modifier,
) {
    val bgColor: Color
    val textColor: Color
    val borderColor: Color?

    when (state) {
        CalendarDayState.ATTENDED -> {
            bgColor = PrimaryOrange
            textColor = Color.White
            borderColor = null
        }
        CalendarDayState.GYM_HOLIDAY -> {
            bgColor = StatusHolidayContainer
            textColor = StatusHoliday
            borderColor = StatusHoliday.copy(alpha = 0.4f)
        }
        CalendarDayState.ABSENT -> {
            bgColor = StatusExpiredContainer
            textColor = StatusExpired
            borderColor = StatusExpired.copy(alpha = 0.45f)
        }
        CalendarDayState.FUTURE -> {
            bgColor = Color.Transparent
            textColor = MutedText
            borderColor = null
        }
        CalendarDayState.NO_RECORD -> {
            bgColor = ElevatedSurface
            textColor = SecondaryText
            borderColor = null
        }
    }

    Box(
        modifier = modifier
            .aspectRatio(1f)
            .clip(CircleShape)
            .background(bgColor)
            .then(
                if (borderColor != null) Modifier.border(1.dp, borderColor, CircleShape)
                else Modifier
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = dayNum.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = textColor,
            fontWeight = if (state == CalendarDayState.ATTENDED) FontWeight.Bold else FontWeight.Medium,
        )
    }
}

@Composable
private fun LegendDot(label: String, color: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            modifier = Modifier
                .size(9.dp)
                .clip(CircleShape)
                .background(color),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = SecondaryText,
        )
    }
}

@Composable
private fun AttendanceLogRow(record: AttendanceRecord) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = SecondaryBackground),
        border = BorderStroke(1.dp, CardBorderSubtle),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = DateUtils.formatDisplayDate(record.date),
                    style = MaterialTheme.typography.titleSmall,
                    color = PrimaryText,
                )
                Text(
                    text = record.method?.let { "Method: $it" } ?: record.status,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = record.checkinTime,
                    style = MaterialTheme.typography.labelSmall,
                    color = PrimaryOrange,
                    fontWeight = FontWeight.Bold,
                )
                if (!record.checkoutTime.isNullOrBlank()) {
                    Text(
                        text = "Out: ${record.checkoutTime}",
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText,
                    )
                }
            }
        }
    }
}
