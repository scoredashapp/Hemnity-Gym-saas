package com.example.core.util

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

object QrBitmapGenerator {
    fun generate(payload: String, sizePx: Int = 512): Bitmap? {
        if (payload.isBlank()) return null
        return runCatching {
            val hints = mapOf(
                EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
                EncodeHintType.MARGIN to 1,
                EncodeHintType.CHARACTER_SET to "UTF-8",
            )
            val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
            val bitmap = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
            val pixels = IntArray(matrix.width * matrix.height)
            for (y in 0 until matrix.height) {
                val offset = y * matrix.width
                for (x in 0 until matrix.width) {
                    pixels[offset + x] = if (matrix.get(x, y)) Color.BLACK else Color.WHITE
                }
            }
            bitmap.setPixels(pixels, 0, matrix.width, 0, 0, matrix.width, matrix.height)
            bitmap
        }.getOrNull()
    }
}
