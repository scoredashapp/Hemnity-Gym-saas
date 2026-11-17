package com.example.domain.model

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

data class FeeCalculationResult(
    val planPrice: Double,
    val discountAmount: Double,
    val finalFee: Double,
    val amountPaid: Double,
    val remainingDue: Double,
    val paymentStatus: String,
    val validationError: String? = null
) {
    val isValid: Boolean get() = validationError == null
}

object MembershipFeeCalculator {

    fun calculate(
        planPrice: Double,
        discountAmount: Double = 0.0,
        amountPaid: Double = 0.0,
        overrideEnabled: Boolean = false,
        overrideFinalFee: Double? = null,
        adjustmentReason: String = ""
    ): FeeCalculationResult {
        if (planPrice < 0.0) {
            return FeeCalculationResult(
                planPrice = 0.0,
                discountAmount = 0.0,
                finalFee = 0.0,
                amountPaid = amountPaid,
                remainingDue = 0.0,
                paymentStatus = "Invalid",
                validationError = "Plan price cannot be negative."
            )
        }
        if (discountAmount < 0.0) {
            return FeeCalculationResult(
                planPrice = planPrice,
                discountAmount = discountAmount,
                finalFee = planPrice,
                amountPaid = amountPaid,
                remainingDue = max(0.0, planPrice - max(0.0, amountPaid)),
                paymentStatus = "Invalid",
                validationError = "Discount cannot be negative."
            )
        }
        if (amountPaid < 0.0) {
            return FeeCalculationResult(
                planPrice = planPrice,
                discountAmount = discountAmount,
                finalFee = max(0.0, planPrice - discountAmount),
                amountPaid = amountPaid,
                remainingDue = max(0.0, planPrice - discountAmount),
                paymentStatus = "Invalid",
                validationError = "Amount paid cannot be negative."
            )
        }

        val computedFinalFee = if (overrideEnabled && overrideFinalFee != null) {
            max(0.0, overrideFinalFee)
        } else {
            max(0.0, planPrice - discountAmount)
        }

        if (overrideEnabled && (discountAmount > 0.0 || (overrideFinalFee != null && abs(overrideFinalFee - planPrice) > 0.009)) && adjustmentReason.isBlank()) {
            return FeeCalculationResult(
                planPrice = planPrice,
                discountAmount = discountAmount,
                finalFee = computedFinalFee,
                amountPaid = amountPaid,
                remainingDue = max(0.0, computedFinalFee - amountPaid),
                paymentStatus = derivePaymentStatus(computedFinalFee, amountPaid),
                validationError = "Enter an authorization reason for fee override or discount."
            )
        }

        if (amountPaid > computedFinalFee + 0.009) {
            return FeeCalculationResult(
                planPrice = planPrice,
                discountAmount = discountAmount,
                finalFee = computedFinalFee,
                amountPaid = amountPaid,
                remainingDue = 0.0,
                paymentStatus = "Invalid",
                validationError = "Amount paid (₹${formatCurrency(amountPaid)}) exceeds final fee (₹${formatCurrency(computedFinalFee)})."
            )
        }

        val remainingDue = max(0.0, computedFinalFee - amountPaid)
        val status = derivePaymentStatus(computedFinalFee, amountPaid)
        return FeeCalculationResult(
            planPrice = planPrice,
            discountAmount = discountAmount,
            finalFee = computedFinalFee,
            amountPaid = amountPaid,
            remainingDue = remainingDue,
            paymentStatus = status,
            validationError = null
        )
    }

    fun derivePaymentStatus(finalFee: Double, amountPaid: Double): String {
        val remaining = max(0.0, finalFee - amountPaid)
        return when {
            finalFee <= 0.009 -> "Paid"
            remaining <= 0.009 -> "Paid"
            amountPaid > 0.009 -> "Partial"
            else -> "Unpaid"
        }
    }

    fun computeStartDateToday(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }

    fun computeExpiryDate(startDate: String, durationDays: Int): String? {
        if (durationDays <= 0) return null
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { isLenient = false }
        val start = runCatching { fmt.parse(startDate.trim()) }.getOrNull() ?: return null
        val cal = Calendar.getInstance().apply {
            time = start
            add(Calendar.DAY_OF_YEAR, durationDays)
        }
        return fmt.format(cal.time)
    }

    fun formatCurrency(value: Double): String {
        return if (abs(value - value.toLong().toDouble()) < 0.001) {
            value.toLong().toString()
        } else {
            String.format(Locale.US, "%.2f", value)
        }
    }

    fun parseNumericAmount(raw: String?): Double? {
        val cleaned = raw?.replace("₹", "")?.replace(",", "")?.trim() ?: return null
        return cleaned.toDoubleOrNull()
    }

    fun explainFeeMismatch(member: MemberRecord): String? {
        val assigned = parseNumericAmount(member.finalFee ?: member.assignedFee)
        val currentPlanPrice = parseNumericAmount(member.planCurrentPrice)
        if (assigned == null || currentPlanPrice == null) return null
        if (abs(assigned - currentPlanPrice) < 0.01) return null

        val sourceLabel = when (member.feeSource?.lowercase()) {
            "custom_override" -> "Custom Fee Override"
            "historical_price", "historical_snapshot" -> "Historical Plan Price Snapshot"
            "duplicated_assignment" -> "Duplicated Assignment Detected"
            else -> member.feeSource ?: "Historical / Assigned Fee Snapshot"
        }
        return "Assigned fee ₹${formatCurrency(assigned)} ($sourceLabel) differs from current plan price ₹${formatCurrency(currentPlanPrice)}. Historical financial records are preserved."
    }
}
