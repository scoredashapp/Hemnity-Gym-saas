package com.example.core.util

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.example.domain.model.DigitalIdCard
import java.io.File
import java.io.FileOutputStream

object ExportHelper {

    fun saveAndSharePdf(
        context: Context,
        bytes: ByteArray,
        fileName: String,
    ): Result<Uri> = runCatching {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val sanitized = fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
        val file = File(exportDir, sanitized)
        FileOutputStream(file).use { it.write(bytes) }
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(intent, "Open Payment Receipt").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
        uri
    }

    fun exportDigitalIdCardPng(
        context: Context,
        card: DigitalIdCard,
        qrBitmap: Bitmap?,
    ): Result<String> = runCatching {
        val width = 1080
        val height = 1600
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)

        // Obsidian background
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0f, 0f, width.toFloat(), height.toFloat(),
                intArrayOf(0xFF0B0B0F.toInt(), 0xFF17171D.toInt(), 0xFF0B0B0F.toInt()),
                null,
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), bgPaint)

        // Card container
        val cardRect = RectF(64f, 80f, width - 64f, height - 80f)
        val cardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF17171D.toInt() }
        canvas.drawRoundRect(cardRect, 48f, 48f, cardPaint)

        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 5f
            shader = LinearGradient(
                cardRect.left, cardRect.top, cardRect.right, cardRect.bottom,
                0xFFFF6B00.toInt(), 0xFFFF9500.toInt(), Shader.TileMode.CLAMP,
            )
        }
        canvas.drawRoundRect(cardRect, 48f, 48f, borderPaint)

        // Header bar
        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFF6B00.toInt()
            textSize = 46f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        canvas.drawText(card.gymName.uppercase(), 120f, 190f, titlePaint)

        val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFA1A1AA.toInt()
            textSize = 30f
        }
        canvas.drawText("HEMNITY OFFICIAL MEMBER PASS", 120f, 240f, subPaint)

        val namePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            textSize = 62f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        canvas.drawText(card.memberName, 120f, 360f, namePaint)

        val monoPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFF9500.toInt()
            textSize = 36f
            typeface = Typeface.MONOSPACE
        }
        canvas.drawText("ID: ${card.membershipId}", 120f, 425f, monoPaint)

        val infoPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            textSize = 34f
        }
        canvas.drawText("Plan: ${card.planName}", 120f, 505f, infoPaint)
        canvas.drawText("Expires: ${DateUtils.formatDisplayDate(card.expiryDate)}", 120f, 560f, infoPaint)
        canvas.drawText("Status: ${card.status.label}", 120f, 615f, infoPaint)

        if (qrBitmap != null) {
            val qrBg = RectF(220f, 700f, width - 220f, 1340f)
            val whitePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() }
            canvas.drawRoundRect(qrBg, 36f, 36f, whitePaint)
            val dst = RectF(260f, 740f, width - 260f, 1300f)
            canvas.drawBitmap(qrBitmap, null, dst, null)
        }

        val footerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFA1A1AA.toInt()
            textSize = 28f
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("Scan at gym reception for verified check-in", width / 2f, 1440f, footerPaint)

        val fileName = "hemnity_id_${card.membershipId.replace(Regex("[^a-zA-Z0-9_-]"), "_")}.png"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/HemnityGym")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: error("Could not create MediaStore entry")
            resolver.openOutputStream(uri)?.use { out ->
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            "Saved to Pictures/HemnityGym/$fileName"
        } else {
            val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
            val file = File(exportDir, fileName)
            FileOutputStream(file).use { out -> bmp.compress(Bitmap.CompressFormat.PNG, 100, out) }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(
                Intent.createChooser(shareIntent, "Save or Share Hemnity ID Card")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            "Ready to save or share $fileName"
        }
    }
}
