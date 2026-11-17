package com.example

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import com.example.core.network.JsonParserHelpers
import com.example.core.network.NetworkClientFactory
import com.example.core.network.SessionCookieJar
import com.example.core.qr.IdCardAssets
import com.example.core.qr.IdCardRenderer
import com.example.core.qr.QrBitmapGenerator
import com.example.core.security.InMemorySecureTokenStorage
import com.example.data.repository.OwnerRepository
import com.example.domain.model.AuthSession
import com.example.domain.model.CheckInOutcome
import com.example.domain.model.MemberRecord
import com.example.domain.model.MembershipFeeCalculator
import com.example.domain.model.UserRole
import com.example.ui.screens.login.LoginAuthMode
import com.example.ui.screens.login.LoginScreen
import com.example.ui.screens.login.LoginUiState
import com.example.ui.screens.owner.MemberListCard
import com.example.ui.screens.owner.MemberSortOption
import com.example.ui.screens.owner.filterAndSortMembers
import com.example.ui.theme.HemnityGymTheme
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `app name matches Hemnity Gym Owner`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("Hemnity Gym Owner", appName)
    }

    @Test
    fun `server role authorization strictly permits only gym owners`() {
        assertTrue(UserRole.fromServerRole("owner").isAuthorizedOwner)
        assertTrue(UserRole.fromServerRole("gym_owner").isAuthorizedOwner)
        assertTrue(UserRole.fromServerRole("admin").isAuthorizedOwner)

        assertEquals(UserRole.MEMBER, UserRole.fromServerRole("member"))
        assertFalse(UserRole.fromServerRole("member").isAuthorizedOwner)

        assertEquals(UserRole.SUPER_ADMIN, UserRole.fromServerRole("superadmin"))
        assertFalse(UserRole.fromServerRole("super_admin").isAuthorizedOwner)

        assertEquals(UserRole.UNKNOWN, UserRole.fromServerRole(null))
        assertFalse(UserRole.fromServerRole(null).isAuthorizedOwner)
    }

    @Test
    fun `session token storage handles save expiry and clear`() {
        val storage = InMemorySecureTokenStorage()
        assertNull(storage.getSession())

        val expired = AuthSession(
            token = "tok_owner_123",
            role = UserRole.OWNER,
            expiresAtEpochMs = 1000L
        )
        assertTrue(expired.isExpired(nowMs = 2000L))
        assertFalse(expired.isExpired(nowMs = 500L))

        storage.saveSession(expired)
        assertEquals("tok_owner_123", storage.getSession()?.token)

        storage.clearSession()
        assertNull(storage.getSession())
    }

    @Test
    fun `qr generator produces bitmap only for non-blank server credentials`() {
        assertNull(QrBitmapGenerator.generateQrBitmap(""))
        assertNull(QrBitmapGenerator.generateQrBitmap("   "))
        val bmp = QrBitmapGenerator.generateQrBitmap("hem_qr_9f8a2b7c1e", sizePx = 256)
        assertNotNull(bmp)
        assertEquals(256, bmp?.width)
        assertEquals(256, bmp?.height)
    }

    @Test
    fun `json helpers extract error messages and resolve relative asset urls`() {
        val err = JsonParserHelpers.extractErrorMessage(
            """{"error":"Email and password are required."}""",
            "Fallback"
        )
        assertEquals("Email and password are required.", err)
        assertEquals(
            "https://gym.hemnity.in/uploads/logo.png",
            JsonParserHelpers.resolveAbsoluteAssetUrl("/uploads/logo.png")
        )
    }

    @Test
    fun `login screen renders exclusive gym owner sign in controls`() {
        composeTestRule.setContent {
            HemnityGymTheme {
                LoginScreen(
                    uiState = LoginUiState(),
                    sessionRevokedBanner = null,
                    onEmailChanged = {},
                    onPasswordChanged = {},
                    onTogglePasswordVisibility = {},
                    onOpenForgotPassword = {},
                    onCloseForgotPassword = {},
                    onForgotEmailChanged = {},
                    onSubmitForgotPassword = {},
                    onSubmitLogin = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Hemnity Gym Owner").assertIsDisplayed()
        composeTestRule.onNodeWithTag("email_input").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("password_input").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("toggle_password_visibility").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("forgot_password_button").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("login_button").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `login screen renders bearer token mode input when selected`() {
        composeTestRule.setContent {
            HemnityGymTheme {
                LoginScreen(
                    uiState = LoginUiState(authMode = LoginAuthMode.BEARER_TOKEN),
                    sessionRevokedBanner = null,
                    onEmailChanged = {},
                    onPasswordChanged = {},
                    onTogglePasswordVisibility = {},
                    onOpenForgotPassword = {},
                    onCloseForgotPassword = {},
                    onForgotEmailChanged = {},
                    onSubmitForgotPassword = {},
                    onSubmitLogin = {}
                )
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("bearer_token_input").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("login_button").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `owner repository parses live kpis subscription and member fields accurately`() {
        val storage = InMemorySecureTokenStorage()
        val api = NetworkClientFactory.createApiService(storage, SessionCookieJar(storage))
        val repo = OwnerRepository(api)

        val dashJson = """
            {
              "gym_id": 1,
              "gym_name": "Iron Peak Gym",
              "subscription": {
                "billing_cycle": "yearly",
                "effective_status": "Active",
                "current_period_end": "2027-11-17",
                "plan_name": "Pro",
                "max_members": "750",
                "max_branches": "3",
                "current_members": 12,
                "can_write_operations": true,
                "enabled_features_json": "[\"qr_attendance\",\"id_card_printing\"]"
              },
              "kpis": {
                "total_members": 12,
                "active_members": 10,
                "expired_members": 2,
                "today_attendance": 4,
                "monthly_revenue": 15000
              }
            }
        """.trimIndent()

        val dash = repo.parseDashboardJson(dashJson)
        assertEquals("1", dash.gymId)
        assertEquals("Iron Peak Gym", dash.gymName)
        assertEquals("Pro", dash.subscriptionPlan)
        assertEquals("Active", dash.subscriptionStatus)
        assertEquals("yearly", dash.billingCycle)
        assertEquals("12", dash.totalMembers)
        assertEquals("10", dash.activeMembers)
        assertEquals("2", dash.expiredMembers)
        assertEquals("4", dash.todayAttendance)
        assertEquals("15000", dash.monthlyRevenue)
        assertEquals(listOf("Qr Attendance", "Id Card Printing"), dash.enabledFeatures)

        val membersJson = """
            {
              "gym_id": 1,
              "members": [
                {
                  "id": "1",
                  "member_code": "GYM-2026-0001",
                  "full_name": "Test Athlete",
                  "phone": "9999999999",
                  "email": "athlete@example.com",
                  "status": "Active",
                  "membership_start_date": "2026-11-17",
                  "membership_expiry_date": "2026-12-17",
                  "plan_name": "Monthly",
                  "active_qr_token": "HQR-TESTTOKEN123456"
                }
              ]
            }
        """.trimIndent()

        val members = repo.parseMembersJson(membersJson)
        assertEquals(1, members.size)
        assertEquals("GYM-2026-0001", members[0].memberCode)
        assertEquals("2026-11-17", members[0].startDate)
        assertEquals("2026-12-17", members[0].expiryDate)
        assertEquals("Monthly", members[0].planName)
        assertEquals("HQR-TESTTOKEN123456", members[0].qrCredential)
    }

    @Test
    fun `qr credential extraction and check-in error classification handle all payload types`() {
        val storage = InMemorySecureTokenStorage()
        val api = NetworkClientFactory.createApiService(storage, SessionCookieJar(storage))
        val repo = OwnerRepository(api)

        assertEquals("HQR-ABC123456", repo.extractQrCredentialFromScan("HQR-ABC123456"))
        assertEquals(
            "HQR-JSONTOKEN99",
            repo.extractQrCredentialFromScan("""{"credential_token":"HQR-JSONTOKEN99"}""")
        )
        assertEquals(
            "HQR-URLTOKEN77",
            repo.extractQrCredentialFromScan("https://gym.hemnity.in/checkin?qr_token=HQR-URLTOKEN77")
        )

        assertEquals(CheckInOutcome.DUPLICATE, repo.classifyCheckInError(409, "Member already checked in today."))
        assertEquals(CheckInOutcome.EXPIRED, repo.classifyCheckInError(422, "Membership expired on 2026-10-01."))
        assertEquals(CheckInOutcome.INVALID_QR, repo.classifyCheckInError(404, "Member or QR credential not found."))
        assertEquals(CheckInOutcome.INVALID_QR, repo.classifyCheckInError(422, "QR credential was revoked."))
    }

    @Test
    fun `plans parser filters active plans accurately without fake entries`() {
        val storage = InMemorySecureTokenStorage()
        val api = NetworkClientFactory.createApiService(storage, SessionCookieJar(storage))
        val repo = OwnerRepository(api)

        val plansJson = """
            {
              "plans": [
                {"id": 1, "name": "Monthly", "duration_days": 30, "price": "500.00", "is_active": 1},
                {"id": 2, "name": "Quarterly", "duration_days": 90, "price": "1400.00", "is_active": true},
                {"id": 3, "name": "Deactivated Legacy", "duration_days": 60, "price": "900.00", "is_active": 0}
              ]
            }
        """.trimIndent()

        val allPlans = repo.parsePlansJson(plansJson)
        val selectable = allPlans.filter { it.isActive }
        assertEquals(3, allPlans.size)
        assertEquals(2, selectable.size)
        assertEquals("Monthly", selectable[0].name)
        assertEquals(30, selectable[0].durationDays)
        assertEquals(500.0, selectable[0].priceAmount ?: 0.0, 0.01)
        assertTrue(selectable.none { it.name.contains("Legacy") })
    }

    @Test
    fun `membership fee calculator enforces remaining due status overrides and dates`() {
        val partial = MembershipFeeCalculator.calculate(planPrice = 500.0, amountPaid = 300.0)
        assertTrue(partial.isValid)
        assertEquals(500.0, partial.finalFee, 0.01)
        assertEquals(200.0, partial.remainingDue, 0.01)
        assertEquals("Partial", partial.paymentStatus)

        val paid = MembershipFeeCalculator.calculate(planPrice = 500.0, amountPaid = 500.0)
        assertTrue(paid.isValid)
        assertEquals(0.0, paid.remainingDue, 0.01)
        assertEquals("Paid", paid.paymentStatus)

        val unpaid = MembershipFeeCalculator.calculate(planPrice = 1400.0, amountPaid = 0.0)
        assertTrue(unpaid.isValid)
        assertEquals(1400.0, unpaid.remainingDue, 0.01)
        assertEquals("Unpaid", unpaid.paymentStatus)

        val overpaid = MembershipFeeCalculator.calculate(planPrice = 500.0, amountPaid = 600.0)
        assertFalse(overpaid.isValid)

        val negativePaid = MembershipFeeCalculator.calculate(planPrice = 500.0, amountPaid = -50.0)
        assertFalse(negativePaid.isValid)

        val missingReason = MembershipFeeCalculator.calculate(
            planPrice = 500.0,
            discountAmount = 100.0,
            amountPaid = 400.0,
            overrideEnabled = true,
            adjustmentReason = ""
        )
        assertFalse(missingReason.isValid)

        val authorizedDiscount = MembershipFeeCalculator.calculate(
            planPrice = 500.0,
            discountAmount = 100.0,
            amountPaid = 400.0,
            overrideEnabled = true,
            adjustmentReason = "Festive Promo"
        )
        assertTrue(authorizedDiscount.isValid)
        assertEquals(400.0, authorizedDiscount.finalFee, 0.01)
        assertEquals(0.0, authorizedDiscount.remainingDue, 0.01)
        assertEquals("Paid", authorizedDiscount.paymentStatus)

        assertEquals("2026-12-01", MembershipFeeCalculator.computeExpiryDate("2026-11-01", 30))
        assertEquals("2027-01-30", MembershipFeeCalculator.computeExpiryDate("2026-11-01", 90))
    }

    @Test
    fun `price mismatch explainer preserves historical record and clarifies fee source`() {
        val member = MemberRecord(
            id = "11",
            memberCode = "GYM-2026-0011",
            name = "Aarav Patel",
            email = null,
            phone = "9876543210",
            photoUrl = null,
            planName = "Monthly",
            membershipStatus = "Active",
            joiningDate = "2026-01-01",
            startDate = "2026-01-01",
            expiryDate = "2026-02-01",
            qrCredential = "HQR-AARAV11",
            pendingAmount = "0",
            assignedFee = "1000",
            planCurrentPrice = "500",
            finalFee = "1000",
            feeSource = "historical_price"
        )
        val explanation = MembershipFeeCalculator.explainFeeMismatch(member)
        assertNotNull(explanation)
        assertTrue(explanation!!.contains("1000"))
        assertTrue(explanation.contains("500"))
        assertTrue(explanation.contains("Historical Plan Price Snapshot"))
    }

    @Test
    fun `id card renderer creates front and back cards and exports verified png and pdf`() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val member = MemberRecord(
            id = "7",
            memberCode = "GYM-2026-0007",
            name = "Rohan Sharma",
            email = "rohan@example.com",
            phone = "9898989898",
            photoUrl = null,
            planName = "Quarterly",
            membershipStatus = "Active",
            joiningDate = "2026-11-01",
            startDate = "2026-11-01",
            expiryDate = "2027-01-30",
            qrCredential = "HQR-ROHANQR987654321",
            pendingAmount = "0"
        )
        val assets = IdCardAssets(gymLogoBitmap = null, memberPhotoBitmap = null)
        val front = IdCardRenderer.renderFrontCardBitmap(member, "GoPlay Gym", assets, widthPx = 720)
        val back = IdCardRenderer.renderBackCardBitmap("GoPlay Gym", "Surat Branch", "9898000000", "6 AM - 10 PM", assets, widthPx = 720)

        assertEquals(720, front.width)
        assertTrue(front.height > 900)
        assertEquals(720, back.width)

        val pngFile = File(context.cacheDir, "test_id_card.png")
        val pngRes = IdCardRenderer.exportPngToUri(context, Uri.fromFile(pngFile), front)
        assertTrue(pngRes.exceptionOrNull()?.stackTraceToString() ?: "PNG export failed", pngRes.isSuccess)
        val decoded = BitmapFactory.decodeFile(pngFile.absolutePath)
        assertNotNull(decoded)
        assertEquals(720, decoded.width)

        val pdfFile = File(context.cacheDir, "test_id_card.pdf")
        val pdfRes = IdCardRenderer.exportPdfToUri(context, Uri.fromFile(pdfFile), front, back)
        assertTrue(pdfRes.exceptionOrNull()?.stackTraceToString() ?: "PDF export failed", pdfRes.isSuccess)
        assertTrue((pdfRes.getOrNull() ?: 0L) > 1000L)
        val header = pdfFile.readBytes().take(5).toByteArray().toString(Charsets.US_ASCII)
        assertEquals("%PDF-", header)
    }

    @Test
    fun `members directory renders unassigned plan fallback and sorts cleanly`() {
        val m1 = MemberRecord(
            id = "1",
            memberCode = "GYM-001",
            name = "Zoya Khan",
            email = null,
            phone = "9000000001",
            photoUrl = null,
            planName = null,
            membershipStatus = "Unassigned",
            joiningDate = "2026-11-01",
            startDate = null,
            expiryDate = null,
            qrCredential = "HQR-ZOYA",
            pendingAmount = "0"
        )
        val m2 = MemberRecord(
            id = "2",
            memberCode = "GYM-002",
            name = "Arjun Mehta",
            email = null,
            phone = "9000000002",
            photoUrl = null,
            planName = "Monthly",
            membershipStatus = "Active",
            joiningDate = "2026-11-02",
            startDate = "2026-11-02",
            expiryDate = "2026-12-02",
            qrCredential = "HQR-ARJUN",
            pendingAmount = "200"
        )

        val unassignedFiltered = filterAndSortMembers(listOf(m1, m2), "", "UNASSIGNED", MemberSortOption.NAME_ASC)
        assertEquals(1, unassignedFiltered.size)
        assertEquals("Zoya Khan", unassignedFiltered[0].name)

        val sortedByDues = filterAndSortMembers(listOf(m1, m2), "", "ALL", MemberSortOption.PENDING_DUE)
        assertEquals("Arjun Mehta", sortedByDues[0].name)

        composeTestRule.setContent {
            HemnityGymTheme {
                MemberListCard(member = m1, onClick = {})
            }
        }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Zoya Khan").assertIsDisplayed()
        composeTestRule.onNodeWithText("Plan: Unassigned • Expiry: No Expiry").assertIsDisplayed()
    }
}
