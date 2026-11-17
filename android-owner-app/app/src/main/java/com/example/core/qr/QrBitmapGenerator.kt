package com.example.core.qr

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object QrBitmapGenerator {
    fun generateQrBitmap(content: String, sizePx: Int = 512): Bitmap? {
        if (content.isBlank()) return null
        return runCatching {
            val hints = mapOf(
                EncodeHintType.MARGIN to 1,
                EncodeHintType.CHARACTER_SET to "UTF-8"
            )
            val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
            val pixels = IntArray(sizePx * sizePx)
            for (y in 0 until sizePx) {
                val offset = y * sizePx
                for (x in 0 until sizePx) {
                    pixels[offset + x] = if (matrix.get(x, y)) Color.BLACK else Color.WHITE
                }
            }
            bitmap.setPixels(pixels, 0, sizePx, 0, 0, sizePx, sizePx)
            bitmap
        }.getOrNull()
    }
}

object MediaStoreSaver {
    suspend fun saveBitmapToPictures(
        context: Context,
        bitmap: Bitmap,
        fileNamePrefix: String
    ): Result<Uri> = withContext(Dispatchers.IO) {
        runCatching {
            val filename = "${fileNamePrefix}_${System.currentTimeMillis()}.png"
            val resolver = context.contentResolver
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(
                        MediaStore.MediaColumns.RELATIVE_PATH,
                        "${Environment.DIRECTORY_PICTURES}/HemnityGymOwner"
                    )
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                ?: error("Could not create MediaStore entry")

            resolver.openOutputStream(uri)?.use { stream ->
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
                    error("Failed to compress PNG")
                }
            } ?: error("Failed to open output stream")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }
            uri
        }
    }

    suspend fun saveTextPdfToDownloads(
        context: Context,
        title: String,
        lines: List<String>,
        fileNamePrefix: String
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val doc = PdfDocument()
            val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
            val page = doc.startPage(pageInfo)
            val canvas: Canvas = page.canvas

            val titlePaint = Paint().apply {
                color = Color.BLACK
                textSize = 20f
                isFakeBoldText = true
            }
            val bodyPaint = Paint().apply {
                color = Color.DKGRAY
                textSize = 13f
            }
            var y = 64f
            canvas.drawText(title, 48f, y, titlePaint)
            y += 32f
            lines.forEach { line ->
                canvas.drawText(line, 48f, y, bodyPaint)
                y += 22f
            }
            doc.finishPage(page)

            val filename = "${fileNamePrefix}_${System.currentTimeMillis()}.pdf"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/HemnityGymOwner")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: error("Could not create PDF file in Downloads")
                resolver.openOutputStream(uri)?.use { doc.writeTo(it) }
                values.clear()
                values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                val file = java.io.File(context.cacheDir, filename)
                file.outputStream().use { doc.writeTo(it) }
            }
            doc.close()
            filename
        }
    }

    fun shareImageUri(context: Context, uri: Uri, subject: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, subject)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, subject))
    }

    fun printBitmap(context: Context, bitmap: Bitmap, jobName: String) {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val adapter = object : android.print.PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes?,
                cancellationSignal: android.os.CancellationSignal?,
                callback: LayoutResultCallback?,
                extras: android.os.Bundle?
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback?.onLayoutCancelled()
                    return
                }
                val info = android.print.PrintDocumentInfo.Builder("$jobName.pdf")
                    .setContentType(android.print.PrintDocumentInfo.CONTENT_TYPE_PHOTO)
                    .setPageCount(1)
                    .build()
                callback?.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out android.print.PageRange>?,
                destination: android.os.ParcelFileDescriptor?,
                cancellationSignal: android.os.CancellationSignal?,
                callback: WriteResultCallback?
            ) {
                val pdf = android.print.pdf.PrintedPdfDocument(
                    context,
                    PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A5).build()
                )
                val page = pdf.startPage(0)
                val canvas = page.canvas
                val targetWidth = canvas.width * 0.65f
                val left = (canvas.width - targetWidth) / 2f
                val destRect = android.graphics.RectF(left, 80f, left + targetWidth, 80f + targetWidth)
                canvas.drawBitmap(bitmap, null, destRect, null)
                pdf.finishPage(page)
                destination?.fileDescriptor?.let { fd ->
                    java.io.FileOutputStream(fd).use { pdf.writeTo(it) }
                }
                pdf.close()
                callback?.onWriteFinished(arrayOf(android.print.PageRange.ALL_PAGES))
            }
        }
        printManager.print(jobName, adapter, null)
    }
}
