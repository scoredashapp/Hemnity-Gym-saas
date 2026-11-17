package com.example.core.qr

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.print.pdf.PrintedPdfDocument
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import coil.ImageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.example.R
import com.example.domain.model.MemberRecord
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

data class IdCardAssets(
    val gymLogoBitmap: Bitmap?,
    val memberPhotoBitmap: Bitmap?
)

object IdCardRenderer {

    suspend fun loadAssets(
        context: Context,
        gymLogoUrl: String?,
        memberPhotoUrl: String?
    ): IdCardAssets = withContext(Dispatchers.IO) {
        val loader = ImageLoader(context)
        val gymLogo = loadSoftwareBitmap(context, loader, gymLogoUrl)
            ?: loadDrawableBitmap(context, R.drawable.hemnity_logo)
        val memberPhoto = loadSoftwareBitmap(context, loader, memberPhotoUrl)
        IdCardAssets(gymLogoBitmap = gymLogo, memberPhotoBitmap = memberPhoto)
    }

    private suspend fun loadSoftwareBitmap(
        context: Context,
        loader: ImageLoader,
        url: String?
    ): Bitmap? {
        val clean = url?.trim().takeIf { !it.isNullOrBlank() } ?: return null
        return runCatching {
            val req = ImageRequest.Builder(context)
                .data(clean)
                .allowHardware(false)
                .build()
            val result = loader.execute(req) as? SuccessResult ?: return null
            (result.drawable as? BitmapDrawable)?.bitmap
        }.getOrNull()
    }

    private fun loadDrawableBitmap(context: Context, resId: Int): Bitmap? {
        val drawable = ContextCompat.getDrawable(context, resId) ?: return null
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            return drawable.bitmap
        }
        val w = drawable.intrinsicWidth.coerceAtLeast(128)
        val h = drawable.intrinsicHeight.coerceAtLeast(128)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        drawable.setBounds(0, 0, w, h)
        drawable.draw(canvas)
        return bmp
    }

    fun generateScannableQrBitmap(content: String, sizePx: Int = 520): Bitmap? {
        if (content.isBlank()) return null
        return runCatching {
            val hints = mapOf(
                EncodeHintType.MARGIN to 2,
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

    fun renderFrontCardBitmap(
        member: MemberRecord,
        gymName: String,
        assets: IdCardAssets,
        widthPx: Int = 1080
    ): Bitmap {
        val heightPx = (widthPx * 1.48f).toInt()
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#0B0B0F") }
        canvas.drawRoundRect(RectF(0f, 0f, widthPx.toFloat(), heightPx.toFloat()), 44f, 44f, bgPaint)

        val headerHeight = heightPx * 0.145f
        val headerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                0f, 0f, widthPx.toFloat(), headerHeight,
                Color.parseColor("#FF6B00"),
                Color.parseColor("#FF9500"),
                Shader.TileMode.CLAMP
            )
        }
        val headerPath = Path().apply {
            addRoundRect(
                RectF(0f, 0f, widthPx.toFloat(), headerHeight),
                floatArrayOf(44f, 44f, 44f, 44f, 0f, 0f, 0f, 0f),
                Path.Direction.CW
            )
        }
        canvas.drawPath(headerPath, headerPaint)

        // Outer border
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 5f
            color = Color.parseColor("#FF6B00")
        }
        canvas.drawRoundRect(
            RectF(2.5f, 2.5f, widthPx - 2.5f, heightPx - 2.5f),
            44f, 44f, borderPaint
        )

        // Gym Logo + Gym Name
        val pad = widthPx * 0.06f
        val logoSize = headerHeight * 0.56f
        val logoTop = (headerHeight - logoSize) / 2f
        val logoRect = RectF(pad, logoTop, pad + logoSize, logoTop + logoSize)
        drawRoundedBitmap(canvas, assets.gymLogoBitmap, logoRect, 22f)

        val gymTitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = widthPx * 0.044f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val subtitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FFF4E5")
            textSize = widthPx * 0.025f
        }
        val gymTextLeft = pad + logoSize + 24f
        val gymTextMaxW = widthPx - gymTextLeft - 240f
        val safeGymName = TextUtils.ellipsize(gymName.ifBlank { "Hemnity Gym" }, gymTitlePaint, gymTextMaxW, TextUtils.TruncateAt.END).toString()
        canvas.drawText(safeGymName, gymTextLeft, headerHeight * 0.48f, gymTitlePaint)
        canvas.drawText("OFFICIAL MEMBER PASS", gymTextLeft, headerHeight * 0.72f, subtitlePaint)

        // Status pill
        drawStatusPill(
            canvas = canvas,
            status = member.membershipStatus,
            rightX = widthPx - pad,
            centerY = headerHeight * 0.5f,
            widthPx = widthPx
        )

        // Member photo / initials avatar
        val avatarSize = widthPx * 0.24f
        val avatarCenterX = widthPx / 2f
        val avatarCenterY = headerHeight + avatarSize * 0.68f
        val avatarRect = RectF(
            avatarCenterX - avatarSize / 2f,
            avatarCenterY - avatarSize / 2f,
            avatarCenterX + avatarSize / 2f,
            avatarCenterY + avatarSize / 2f
        )
        val avatarRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 7f
            color = Color.parseColor("#FF6B00")
        }
        if (assets.memberPhotoBitmap != null) {
            drawCircularBitmap(canvas, assets.memberPhotoBitmap, avatarRect)
        } else {
            val circleFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#2A1B10") }
            canvas.drawOval(avatarRect, circleFill)
            val initials = member.name.trim().split(" ")
                .mapNotNull { it.firstOrNull()?.uppercaseChar() }
                .take(2)
                .joinToString("")
                .ifBlank { "M" }
            val initPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#FF9500")
                textSize = avatarSize * 0.38f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                textAlign = Paint.Align.CENTER
            }
            val textY = avatarCenterY - (initPaint.descent() + initPaint.ascent()) / 2f
            canvas.drawText(initials, avatarCenterX, textY, initPaint)
        }
        canvas.drawOval(avatarRect, avatarRingPaint)

        // Member Name & ID
        val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = widthPx * 0.048f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        var cursorY = avatarRect.bottom + widthPx * 0.068f
        val ellipsizedName = TextUtils.ellipsize(member.name, namePaint, widthPx - pad * 2f, TextUtils.TruncateAt.END).toString()
        canvas.drawText(ellipsizedName, widthPx / 2f, cursorY, namePaint)

        cursorY += widthPx * 0.042f
        val codePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FF9500")
            textSize = widthPx * 0.032f
            typeface = Typeface.MONOSPACE
            textAlign = Paint.Align.CENTER
        }
        val memberIdText = member.memberCode?.takeIf { it.isNotBlank() } ?: "ID #${member.id}"
        canvas.drawText(memberIdText, widthPx / 2f, cursorY, codePaint)

        // Details grid box (Plan, Joining Date, Expiry Date, Status)
        cursorY += widthPx * 0.042f
        val gridRect = RectF(pad, cursorY, widthPx - pad, cursorY + widthPx * 0.245f)
        val panelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#17171D") }
        val panelBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2.5f
            color = Color.parseColor("#2B2B36")
        }
        canvas.drawRoundRect(gridRect, 24f, 24f, panelPaint)
        canvas.drawRoundRect(gridRect, 24f, 24f, panelBorder)

        val colMid = (gridRect.left + gridRect.right) / 2f
        val rowMid = (gridRect.top + gridRect.bottom) / 2f
        val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#A1A1AA")
            textSize = widthPx * 0.023f
        }
        val valPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = widthPx * 0.030f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val cellPad = 24f
        val cellMaxW = (gridRect.width() / 2f) - (cellPad * 1.5f)
        drawGridCell(canvas, "PLAN", member.planName?.takeIf { it.isNotBlank() } ?: "Unassigned", gridRect.left + cellPad, gridRect.top + 38f, cellMaxW, labelPaint, valPaint)
        drawGridCell(canvas, "STATUS", member.membershipStatus, colMid + cellPad * 0.6f, gridRect.top + 38f, cellMaxW, labelPaint, valPaint)
        drawGridCell(canvas, "JOINED", member.joiningDate ?: member.startDate ?: "Unavailable", gridRect.left + cellPad, rowMid + 34f, cellMaxW, labelPaint, valPaint)
        drawGridCell(canvas, "EXPIRY", member.expiryDate ?: "Unavailable", colMid + cellPad * 0.6f, rowMid + 34f, cellMaxW, labelPaint, valPaint)

        // Crisp white-backed QR Code section
        val qrSectionTop = gridRect.bottom + widthPx * 0.044f
        val qrSectionBottom = heightPx - widthPx * 0.085f
        val qrSize = minOf(qrSectionBottom - qrSectionTop - 52f, widthPx * 0.42f).coerceAtLeast(220f)
        val qrBoxPad = 24f
        val qrFrameLeft = (widthPx - qrSize) / 2f - qrBoxPad
        val qrFrameTop = qrSectionTop
        val qrFrameRect = RectF(
            qrFrameLeft,
            qrFrameTop,
            qrFrameLeft + qrSize + qrBoxPad * 2f,
            qrFrameTop + qrSize + qrBoxPad * 2f
        )
        val whitePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
        canvas.drawRoundRect(qrFrameRect, 28f, 28f, whitePaint)

        val qrBmp = member.qrCredential?.takeIf { it.isNotBlank() }?.let {
            generateScannableQrBitmap(it, qrSize.toInt())
        }
        if (qrBmp != null) {
            canvas.drawBitmap(
                qrBmp,
                null,
                RectF(
                    qrFrameRect.left + qrBoxPad,
                    qrFrameRect.top + qrBoxPad,
                    qrFrameRect.right - qrBoxPad,
                    qrFrameRect.bottom - qrBoxPad
                ),
                null
            )
        } else {
            val noQrPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.DKGRAY
                textSize = widthPx * 0.026f
                textAlign = Paint.Align.CENTER
            }
            canvas.drawText("QR Credential Unavailable", widthPx / 2f, qrFrameRect.centerY(), noQrPaint)
        }

        val footerPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#A1A1AA")
            textSize = widthPx * 0.023f
            typeface = Typeface.MONOSPACE
            textAlign = Paint.Align.CENTER
        }
        val footerText = if (!member.qrCredential.isNullOrBlank()) {
            "SCAN AT RECEPTION • ${memberIdText}"
        } else {
            "REISSUE QR CREDENTIAL REQUIRED"
        }
        canvas.drawText(footerText, widthPx / 2f, heightPx - widthPx * 0.036f, footerPaint)

        return bitmap
    }

    fun renderBackCardBitmap(
        gymName: String,
        gymAddress: String?,
        gymPhone: String?,
        operatingHours: String?,
        assets: IdCardAssets,
        widthPx: Int = 1080
    ): Bitmap {
        val heightPx = (widthPx * 1.48f).toInt()
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#0B0B0F") }
        canvas.drawRoundRect(RectF(0f, 0f, widthPx.toFloat(), heightPx.toFloat()), 44f, 44f, bgPaint)

        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 5f
            color = Color.parseColor("#FF6B00")
        }
        canvas.drawRoundRect(
            RectF(2.5f, 2.5f, widthPx - 2.5f, heightPx - 2.5f),
            44f, 44f, borderPaint
        )

        val pad = widthPx * 0.08f
        val logoSize = widthPx * 0.22f
        val logoRect = RectF(
            (widthPx - logoSize) / 2f,
            widthPx * 0.14f,
            (widthPx + logoSize) / 2f,
            widthPx * 0.14f + logoSize
        )
        drawRoundedBitmap(canvas, assets.gymLogoBitmap, logoRect, 28f)

        val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = widthPx * 0.048f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText(gymName.ifBlank { "Hemnity Gym" }, widthPx / 2f, logoRect.bottom + 70f, titlePaint)

        val accentPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FF9500")
            textSize = widthPx * 0.028f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("MEMBERSHIP TERMS & GYM INFORMATION", widthPx / 2f, logoRect.bottom + 120f, accentPaint)

        val panelRect = RectF(pad, logoRect.bottom + 170f, widthPx - pad, heightPx - pad * 1.4f)
        val panelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#17171D") }
        canvas.drawRoundRect(panelRect, 28f, 28f, panelPaint)

        val bodyPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#E4E4E7")
            textSize = widthPx * 0.029f
        }
        val infoLines = listOfNotNull(
            gymAddress?.takeIf { it.isNotBlank() }?.let { "Facility: $it" },
            gymPhone?.takeIf { it.isNotBlank() }?.let { "Contact: $it" },
            operatingHours?.takeIf { it.isNotBlank() }?.let { "Operations: $it" },
            "• Present this digital or printed QR pass at reception for daily check-in.",
            "• Pass is strictly non-transferable and tied to your active membership.",
            "• Lost or compromised passes can be revoked immediately by gym staff.",
            "• Verified via Hemnity Gym Management Platform (https://gym.hemnity.in)."
        )
        var lineY = panelRect.top + 70f
        infoLines.forEach { rawLine ->
            val maxW = panelRect.width() - 60f
            val words = rawLine.split(" ")
            var current = ""
            words.forEach { w ->
                val test = if (current.isEmpty()) w else "$current $w"
                if (bodyPaint.measureText(test) > maxW) {
                    canvas.drawText(current, panelRect.left + 30f, lineY, bodyPaint)
                    lineY += 48f
                    current = w
                } else {
                    current = test
                }
            }
            if (current.isNotEmpty()) {
                canvas.drawText(current, panelRect.left + 30f, lineY, bodyPaint)
                lineY += 64f
            }
        }

        val sitePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#A1A1AA")
            textSize = widthPx * 0.026f
            typeface = Typeface.MONOSPACE
            textAlign = Paint.Align.CENTER
        }
        canvas.drawText("https://gym.hemnity.in", widthPx / 2f, heightPx - pad * 0.65f, sitePaint)
        return bitmap
    }

    suspend fun exportPngToUri(
        context: Context,
        uri: Uri,
        bitmap: Bitmap
    ): Result<Pair<Int, Int>> = withContext(Dispatchers.IO) {
        runCatching {
            val resolver = context.contentResolver
            resolver.openOutputStream(uri, "w")?.use { out ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                    "Failed to encode PNG image."
                }
                out.flush()
            } ?: error("Could not open selected image destination.")

            // Reopen and verify the exported PNG can be decoded cleanly
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use { input ->
                BitmapFactory.decodeStream(input, null, opts)
            } ?: error("Could not reopen exported PNG file for verification.")
            check(opts.outWidth > 0 && opts.outHeight > 0) {
                "Exported PNG failed verification."
            }
            opts.outWidth to opts.outHeight
        }
    }

    suspend fun exportPdfToUri(
        context: Context,
        uri: Uri,
        frontBitmap: Bitmap,
        backBitmap: Bitmap?
    ): Result<Long> = withContext(Dispatchers.IO) {
        runCatching {
            val resolver = context.contentResolver
            val rawBytes = runCatching {
                val pdfBytes = java.io.ByteArrayOutputStream()
                val doc = PdfDocument()
                try {
                    val pageW = 595
                    val pageH = 842
                    drawPdfCardPage(doc, 1, pageW, pageH, frontBitmap)
                    if (backBitmap != null) {
                        drawPdfCardPage(doc, 2, pageW, pageH, backBitmap)
                    }
                    doc.writeTo(pdfBytes)
                } finally {
                    runCatching { doc.close() }
                }
                pdfBytes.toByteArray()
            }.getOrDefault(ByteArray(0))

            val finalBytes = if (rawBytes.size >= 512 && String(rawBytes, 0, 5, Charsets.US_ASCII) == "%PDF-") {
                rawBytes
            } else {
                buildFallbackPdfBytes(listOfNotNull(frontBitmap, backBitmap))
            }

            resolver.openOutputStream(uri, "w")?.use { out ->
                out.write(finalBytes)
                out.flush()
            } ?: error("Could not open selected PDF destination.")

            // Reopen and verify valid non-empty %PDF- header
            val header = ByteArray(5)
            var totalBytes = 0L
            resolver.openInputStream(uri)?.use { input ->
                val read = input.read(header)
                check(read >= 5 && String(header, Charsets.US_ASCII) == "%PDF-") {
                    "Exported file is not a valid PDF."
                }
                totalBytes += read
                val buf = ByteArray(4096)
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    totalBytes += n
                }
            } ?: error("Could not reopen exported PDF for verification.")
            check(totalBytes > 512L) { "Exported PDF appears empty." }
            totalBytes
        }
    }

    private fun buildFallbackPdfBytes(bitmaps: List<Bitmap>): ByteArray {
        val pageW = 595
        val pageH = 842
        val margin = 48f
        val out = java.io.ByteArrayOutputStream()
        val offsets = mutableListOf<Int>()

        fun writeAscii(s: String) {
            out.write(s.toByteArray(Charsets.US_ASCII))
        }

        writeAscii("%PDF-1.4\n")
        out.write(byteArrayOf('%'.code.toByte(), 0xE2.toByte(), 0xE3.toByte(), 0xCF.toByte(), 0xD3.toByte(), '\n'.code.toByte()))
        val catalogObjId = 1
        val pagesObjId = 2
        val pageObjIds = mutableListOf<Int>()
        var nextId = 3

        val pageDescriptors = bitmaps.map { bmp ->
            val pageId = nextId++
            val imgId = nextId++
            val contentId = nextId++
            pageObjIds.add(pageId)
            Triple(pageId, imgId, contentId) to bmp
        }

        // Catalog
        offsets.add(out.size())
        writeAscii("$catalogObjId 0 obj\n<< /Type /Catalog /Pages $pagesObjId 0 R >>\nendobj\n")

        // Pages
        offsets.add(out.size())
        val kidsStr = pageObjIds.joinToString(" ") { "$it 0 R" }
        writeAscii("$pagesObjId 0 obj\n<< /Type /Pages /Kids [$kidsStr] /Count ${pageObjIds.size} >>\nendobj\n")

        pageDescriptors.forEach { (ids, bmp) ->
            val (pageId, imgId, contentId) = ids
            val jpgStream = java.io.ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 92, jpgStream)
            val jpgBytes = jpgStream.toByteArray()

            val availW = pageW - margin * 2f
            val availH = pageH - margin * 2f
            val aspect = bmp.height.toFloat() / bmp.width.toFloat().coerceAtLeast(1f)
            var targetW = availW
            var targetH = targetW * aspect
            if (targetH > availH) {
                targetH = availH
                targetW = targetH / aspect
            }
            val x = (pageW - targetW) / 2f
            val y = (pageH - targetH) / 2f
            val contentCmd = "q\n1 1 1 rg 0 0 $pageW $pageH re f\n$targetW 0 0 $targetH $x $y cm\n/Im0 Do\nQ\n"
            val contentBytes = contentCmd.toByteArray(Charsets.US_ASCII)

            offsets.add(out.size())
            writeAscii(
                "$pageId 0 obj\n<< /Type /Page /Parent $pagesObjId 0 R /MediaBox [0 0 $pageW $pageH] " +
                    "/Resources << /XObject << /Im0 $imgId 0 R >> >> /Contents $contentId 0 R >>\nendobj\n"
            )

            offsets.add(out.size())
            writeAscii(
                "$imgId 0 obj\n<< /Type /XObject /Subtype /Image /Width ${bmp.width} /Height ${bmp.height} " +
                    "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgBytes.size} >>\nstream\n"
            )
            out.write(jpgBytes)
            writeAscii("\nendstream\nendobj\n")

            offsets.add(out.size())
            writeAscii("$contentId 0 obj\n<< /Length ${contentBytes.size} >>\nstream\n")
            out.write(contentBytes)
            writeAscii("\nendstream\nendobj\n")
        }

        val xrefOffset = out.size()
        writeAscii("xref\n0 ${offsets.size + 1}\n0000000000 65535 f \n")
        offsets.forEach { off ->
            writeAscii(String.format(java.util.Locale.US, "%010d 00000 n \n", off))
        }
        writeAscii("trailer\n<< /Size ${offsets.size + 1} /Root $catalogObjId 0 R >>\nstartxref\n$xrefOffset\n%%EOF\n")
        return out.toByteArray()
    }

    private fun drawPdfCardPage(
        doc: PdfDocument,
        pageNumber: Int,
        pageW: Int,
        pageH: Int,
        cardBitmap: Bitmap
    ) {
        val pageInfo = PdfDocument.PageInfo.Builder(pageW, pageH, pageNumber).create()
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas
        canvas.drawColor(Color.WHITE)

        val margin = 48f
        val availW = pageW - (margin * 2f)
        val availH = pageH - (margin * 2f)
        val aspect = cardBitmap.height.toFloat() / cardBitmap.width.toFloat().coerceAtLeast(1f)
        var targetW = availW
        var targetH = targetW * aspect
        if (targetH > availH) {
            targetH = availH
            targetW = targetH / aspect
        }
        val left = (pageW - targetW) / 2f
        val top = (pageH - targetH) / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        canvas.drawBitmap(cardBitmap, null, RectF(left, top, left + targetW, top + targetH), paint)
        doc.finishPage(page)
    }

    suspend fun shareCardPng(
        context: Context,
        bitmap: Bitmap,
        fileName: String,
        subject: String
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val dir = File(context.cacheDir, "id_cards").apply { mkdirs() }
            val file = File(dir, fileName)
            FileOutputStream(file).use { out ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                    "Failed to encode share PNG."
                }
                out.flush()
            }
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )
            withContext(Dispatchers.Main) {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, subject)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(intent, subject))
            }
        }
    }

    fun printIdCard(
        context: Context,
        frontBitmap: Bitmap,
        backBitmap: Bitmap?,
        jobName: String
    ) {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val pagesCount = if (backBitmap != null) 2 else 1
        val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes?,
                cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback?,
                extras: android.os.Bundle?
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback?.onLayoutCancelled()
                    return
                }
                val info = PrintDocumentInfo.Builder("$jobName.pdf")
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(pagesCount)
                    .build()
                callback?.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out PageRange>?,
                destination: ParcelFileDescriptor?,
                cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback?
            ) {
                val pdf = PrintedPdfDocument(
                    context,
                    PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A5)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .build()
                )
                drawPrintedPage(pdf, 0, frontBitmap)
                if (backBitmap != null) {
                    drawPrintedPage(pdf, 1, backBitmap)
                }
                runCatching {
                    destination?.fileDescriptor?.let { fd ->
                        FileOutputStream(fd).use { pdf.writeTo(it) }
                    }
                    callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                }.onFailure { err ->
                    callback?.onWriteFailed(err.message)
                }
                pdf.close()
            }
        }
        printManager.print(jobName, adapter, null)
    }

    private fun drawPrintedPage(pdf: PrintedPdfDocument, pageIndex: Int, cardBitmap: Bitmap) {
        val page = pdf.startPage(pageIndex)
        val canvas = page.canvas
        canvas.drawColor(Color.WHITE)
        val margin = 28f
        val availW = canvas.width - margin * 2f
        val availH = canvas.height - margin * 2f
        val aspect = cardBitmap.height.toFloat() / cardBitmap.width.toFloat().coerceAtLeast(1f)
        var targetW = availW
        var targetH = targetW * aspect
        if (targetH > availH) {
            targetH = availH
            targetW = targetH / aspect
        }
        val left = (canvas.width - targetW) / 2f
        val top = (canvas.height - targetH) / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        canvas.drawBitmap(cardBitmap, null, RectF(left, top, left + targetW, top + targetH), paint)
        pdf.finishPage(page)
    }

    private fun drawGridCell(
        canvas: Canvas,
        label: String,
        value: String,
        x: Float,
        y: Float,
        maxW: Float,
        labelPaint: TextPaint,
        valPaint: TextPaint
    ) {
        canvas.drawText(label, x, y, labelPaint)
        val clipped = TextUtils.ellipsize(value, valPaint, maxW, TextUtils.TruncateAt.END).toString()
        canvas.drawText(clipped, x, y + 36f, valPaint)
    }

    private fun drawStatusPill(
        canvas: Canvas,
        status: String,
        rightX: Float,
        centerY: Float,
        widthPx: Int
    ) {
        val lower = status.lowercase()
        val (bgHex, fgHex) = when {
            "active" in lower -> "#123A24" to "#22C55E"
            "expir" in lower || "suspend" in lower -> "#3F171A" to "#EF4444"
            else -> "#3F2B10" to "#F59E0B"
        }
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor(fgHex)
            textSize = widthPx * 0.024f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val label = status.uppercase()
        val pillW = textPaint.measureText(label) + 44f
        val pillH = widthPx * 0.048f
        val rect = RectF(rightX - pillW, centerY - pillH / 2f, rightX, centerY + pillH / 2f)
        val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor(bgHex) }
        canvas.drawRoundRect(rect, pillH / 2f, pillH / 2f, bgPaint)
        val textY = centerY - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(label, rect.left + 22f, textY, textPaint)
    }

    private fun drawRoundedBitmap(canvas: Canvas, bmp: Bitmap?, rect: RectF, radius: Float) {
        if (bmp == null) return
        canvas.save()
        val clipPath = Path().apply { addRoundRect(rect, radius, radius, Path.Direction.CW) }
        canvas.clipPath(clipPath)
        canvas.drawBitmap(bmp, null, rect, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        canvas.restore()
    }

    private fun drawCircularBitmap(canvas: Canvas, bmp: Bitmap, rect: RectF) {
        val scaled = Bitmap.createScaledBitmap(bmp, rect.width().toInt().coerceAtLeast(1), rect.height().toInt().coerceAtLeast(1), true)
        val shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        val matrix = android.graphics.Matrix().apply { setTranslate(rect.left, rect.top) }
        shader.setLocalMatrix(matrix)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
            this.shader = shader
        }
        canvas.drawOval(rect, paint)
    }
}
