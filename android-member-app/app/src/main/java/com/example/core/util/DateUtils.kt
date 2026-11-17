package com.example.core.util

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

object DateUtils {
    private val inputFormats = listOf(
        "yyyy-MM-dd",
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "dd-MM-yyyy",
        "dd/MM/yyyy",
    )

    fun parseDate(raw: String?): Date? {
        if (raw.isNullOrBlank()) return null
        val cleaned = raw.trim().substringBefore("Z").substringBefore("+")
        for (pattern in inputFormats) {
            val sdf = SimpleDateFormat(pattern, Locale.US).apply { isLenient = false }
            val parsed = runCatching { sdf.parse(cleaned) }.getOrNull()
            if (parsed != null) return parsed
        }
        return null
    }

    fun calculateRemainingDays(expiryDateRaw: String?): Int? {
        val expiry = parseDate(expiryDateRaw) ?: return null
        val todayCal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val expCal = Calendar.getInstance().apply {
            time = expiry
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val diffMillis = expCal.timeInMillis - todayCal.timeInMillis
        return TimeUnit.MILLISECONDS.toDays(diffMillis).toInt()
    }

    fun formatDisplayDate(raw: String?): String {
        if (raw.isNullOrBlank()) return "—"
        val parsed = parseDate(raw) ?: return raw
        return SimpleDateFormat("dd MMM yyyy", Locale.US).format(parsed)
    }

    fun currentMonthKey(): String {
        return SimpleDateFormat("yyyy-MM", Locale.US).format(Date())
    }

    fun shiftMonthKey(monthKey: String, deltaMonths: Int): String {
        val sdf = SimpleDateFormat("yyyy-MM", Locale.US)
        val date = runCatching { sdf.parse(monthKey) }.getOrNull() ?: Date()
        val cal = Calendar.getInstance().apply {
            time = date
            add(Calendar.MONTH, deltaMonths)
        }
        return sdf.format(cal.time)
    }

    fun formatMonthTitle(monthKey: String): String {
        val sdf = SimpleDateFormat("yyyy-MM", Locale.US)
        val date = runCatching { sdf.parse(monthKey) }.getOrNull() ?: return monthKey
        return SimpleDateFormat("MMMM yyyy", Locale.US).format(date)
    }

    fun monthGridInfo(monthKey: String): MonthGridMeta {
        val sdf = SimpleDateFormat("yyyy-MM", Locale.US)
        val date = runCatching { sdf.parse(monthKey) }.getOrNull() ?: Date()
        val cal = Calendar.getInstance().apply {
            time = date
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
        // Monday = 0 .. Sunday = 6
        val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK)
        val leadingEmptyDays = when (dayOfWeek) {
            Calendar.MONDAY -> 0
            Calendar.TUESDAY -> 1
            Calendar.WEDNESDAY -> 2
            Calendar.THURSDAY -> 3
            Calendar.FRIDAY -> 4
            Calendar.SATURDAY -> 5
            else -> 6
        }
        val today = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return MonthGridMeta(
            monthKey = monthKey,
            daysInMonth = daysInMonth,
            leadingEmptyCells = leadingEmptyDays,
            year = cal.get(Calendar.YEAR),
            monthZeroBased = cal.get(Calendar.MONTH),
            todayMillis = today.timeInMillis,
        )
    }

    fun dayMillis(year: Int, monthZeroBased: Int, dayOfMonth: Int): Long {
        return Calendar.getInstance().apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, monthZeroBased)
            set(Calendar.DAY_OF_MONTH, dayOfMonth)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }

    fun isoDate(year: Int, monthZeroBased: Int, dayOfMonth: Int): String {
        return String.format(Locale.US, "%04d-%02d-%02d", year, monthZeroBased + 1, dayOfMonth)
    }

    fun extractDayOfMonth(isoDate: String): Int? {
        val parts = isoDate.trim().substringBefore("T").substringBefore(" ").split("-")
        if (parts.size != 3) return null
        return parts[2].toIntOrNull()
    }
}

data class MonthGridMeta(
    val monthKey: String,
    val daysInMonth: Int,
    val leadingEmptyCells: Int,
    val year: Int,
    val monthZeroBased: Int,
    val todayMillis: Long,
)
