package com.example

import com.example.core.network.ApiErrorMapper
import com.example.core.network.AppError
import com.example.core.network.AuthInterceptor
import com.example.core.network.FlexStringAdapter
import com.example.core.network.NetworkResult
import com.example.core.network.SessionCookieJar
import com.example.core.network.SessionEventBus
import com.example.core.security.RoleGuard
import com.example.core.security.SessionTokens
import com.example.core.security.TokenStorage
import com.example.core.util.DateUtils
import com.example.data.remote.HemnityApiService
import com.example.data.repository.AuthRepository
import com.example.data.repository.MemberRepository
import com.example.domain.model.CalendarDayState
import com.example.domain.model.MembershipStatus
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

private class InMemoryTokenStorage(initial: SessionTokens? = null) : TokenStorage {
    private val _flow = MutableStateFlow(initial)
    override val sessionFlow: StateFlow<SessionTokens?> = _flow
    override suspend fun initialize() = Unit
    override fun currentSession(): SessionTokens? = _flow.value
    override suspend fun saveSession(session: SessionTokens) {
        require(RoleGuard.isAllowedMemberRole(session.role)) {
            RoleGuard.rejectionMessageFor(session.role)
        }
        _flow.value = session
    }
    override suspend fun updateSelectedGymId(gymId: String) {
        _flow.value = _flow.value?.copy(selectedGymId = gymId)
    }
    override suspend fun clearSession() {
        _flow.value = null
    }
}

class HemnitySecurityAndIsolationTest {

    private val moshi = Moshi.Builder()
        .add(FlexStringAdapter())
        .addLast(KotlinJsonAdapterFactory())
        .build()

    @Test
    fun `role guard strictly allows only member roles and blocks owner and super_admin`() {
        assertTrue(RoleGuard.isAllowedMemberRole("member"))
        assertTrue(RoleGuard.isAllowedMemberRole("Gym_Member"))
        assertFalse(RoleGuard.isAllowedMemberRole("owner"))
        assertFalse(RoleGuard.isAllowedMemberRole("gym_owner"))
        assertFalse(RoleGuard.isAllowedMemberRole("super_admin"))
        assertFalse(RoleGuard.isAllowedMemberRole("admin"))
        assertFalse(RoleGuard.isAllowedMemberRole(null))
        assertTrue(RoleGuard.rejectionMessageFor("super_admin").contains("Super Admin"))
        assertTrue(RoleGuard.rejectionMessageFor("owner").contains("Gym Owner"))
    }

    @Test
    fun `auth repository rejects owner login response and clears storage`() = runTest {
        val storage = InMemoryTokenStorage()
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """{"token":"secret-owner-token","role":"owner","user":{"id":"1","role":"owner"}}"""
                            .toResponseBody("application/json".toMediaType())
                    )
                    .build()
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl("https://gym.hemnity.in/api/v1/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(HemnityApiService::class.java)

        val repo = AuthRepository(api, storage, SessionCookieJar(), SessionEventBus(), moshi)
        val result = repo.login("owner@gym.hemnity.in", "password123")

        assertTrue(result is NetworkResult.Failure)
        val failure = result as NetworkResult.Failure
        assertTrue(failure.error is AppError.ForbiddenRole)
        assertNull(storage.currentSession())
    }

    @Test
    fun `multi-gym interceptor attaches X-Gym-Id and switches tenant cleanly`() = runTest {
        val storage = InMemoryTokenStorage(
            SessionTokens(
                accessToken = "member_tok_123",
                role = "member",
                selectedGymId = "gym_alpha",
            )
        )
        var capturedGymHeader: String? = null
        var capturedAuthHeader: String? = null

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(storage))
            .addInterceptor { chain ->
                capturedGymHeader = chain.request().header("X-Gym-Id")
                capturedAuthHeader = chain.request().header("Authorization")
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """{"member_name":"Aarav","gym_id":1,"gym_name":"GoPlay Gym","member_code":"GYM-2026-0001","plan_name":"Monthly","membership_start_date":"2026-11-17","membership_expiry_date":"2026-12-30","status":"Active"}"""
                            .toResponseBody("application/json".toMediaType())
                    )
                    .build()
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl("https://gym.hemnity.in/api/v1/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(HemnityApiService::class.java)

        val memberRepo = MemberRepository(api, storage, moshi)
        memberRepo.switchActiveGym("1")
        val dash = memberRepo.getDashboard()

        assertTrue(dash is NetworkResult.Success)
        val data = (dash as NetworkResult.Success).data
        assertEquals("1", capturedGymHeader)
        assertEquals("Bearer member_tok_123", capturedAuthHeader)
        assertEquals("GYM-2026-0001", data.membershipId)
        assertEquals("GoPlay Gym", data.gymName)
    }

    @Test
    fun `digital id card parses HQR active_qr_token and numeric gym_id`() = runTest {
        val storage = InMemoryTokenStorage(
            SessionTokens(accessToken = "tok", role = "member", selectedGymId = "1")
        )
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """{"gym_id":1,"gym_name":"GoPlay Gym","full_name":"Gulashan","member_code":"GYM-2026-0003","plan_name":"Monthly","membership_expiry_date":"2026-12-17","status":"Active","active_qr_token":"HQR-4387E6F40B889811AF8F5F4261DD15F9"}"""
                            .toResponseBody("application/json".toMediaType())
                    )
                    .build()
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl("https://gym.hemnity.in/api/v1/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(HemnityApiService::class.java)

        val repo = MemberRepository(api, storage, moshi)
        val result = repo.getDigitalIdCard()
        assertTrue(result is NetworkResult.Success)
        val card = (result as NetworkResult.Success).data
        assertEquals("1", card.gymId)
        assertEquals("GYM-2026-0003", card.membershipId)
        assertEquals("HQR-4387E6F40B889811AF8F5F4261DD15F9", card.qrPayload)
    }

    @Test
    fun `api error mapper detects undeployed member routes on 404`() {
        val errBody = """{"error":"API endpoint not found.","route":"member/dashboard"}"""
            .toResponseBody("application/json".toMediaType())
        val retrofitResponse = retrofit2.Response.error<String>(404, errBody)
        val mapped = ApiErrorMapper.mapThrowable(HttpException(retrofitResponse), moshi)

        assertTrue(mapped is AppError.EndpointNotDeployed)
        assertEquals("member/dashboard", (mapped as AppError.EndpointNotDeployed).route)
    }

    @Test
    fun `attendance repository never auto-marks unrecorded days as absent`() = runTest {
        val storage = InMemoryTokenStorage(
            SessionTokens(accessToken = "tok", role = "member", selectedGymId = "gym_1")
        )
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """{"month":"2026-11","today_status":"No Check-in Today","total_visits":10,"month_visits":1,"holidays":[{"date":"2026-11-05","holiday_name":"Diwali"}],"history":[{"id":1,"date":"2026-11-02","checkin_time":"07:15 AM"}]}"""
                            .toResponseBody("application/json".toMediaType())
                    )
                    .build()
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl("https://gym.hemnity.in/api/v1/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(HemnityApiService::class.java)

        val repo = MemberRepository(api, storage, moshi)
        val result = repo.getAttendance("2026-11")
        assertTrue(result is NetworkResult.Success)
        val summary = (result as NetworkResult.Success).data

        assertEquals(CalendarDayState.ATTENDED, summary.calendarDays[2]?.state)
        assertEquals(CalendarDayState.GYM_HOLIDAY, summary.calendarDays[5]?.state)
        assertEquals(CalendarDayState.NO_RECORD, summary.calendarDays[3]?.state)
    }

    @Test
    fun `membership status maps expiring soon and date utils parses ISO dates`() {
        assertEquals(MembershipStatus.EXPIRING_SOON, MembershipStatus.fromRaw("active", remainingDays = 5))
        assertEquals(MembershipStatus.ACTIVE, MembershipStatus.fromRaw("active", remainingDays = 20))
        assertEquals(MembershipStatus.EXPIRED, MembershipStatus.fromRaw("expired", remainingDays = 0))
        assertEquals("30 Dec 2026", DateUtils.formatDisplayDate("2026-12-30"))
    }

    @Test
    fun `public landing parses platform CMS support and legal summaries`() = runTest {
        val storage = InMemoryTokenStorage()
        val client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                Response.Builder()
                    .request(chain.request())
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(
                        """{"platform":{"software_name":"Hemnity Gym","support_email":"support@hemnity.in","support_phone":"+91-9999999999","support_address":"Bengaluru, IN","legal_privacy_summary":"Privacy summary text.","legal_terms_summary":"Terms summary text.","maintenance_mode":0}}"""
                            .toResponseBody("application/json".toMediaType())
                    )
                    .build()
            }
            .build()

        val api = Retrofit.Builder()
            .baseUrl("https://gym.hemnity.in/api/v1/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(HemnityApiService::class.java)

        val repo = MemberRepository(api, storage, moshi)
        val result = repo.getPlatformInfo()
        assertTrue(result is NetworkResult.Success)
        val info = (result as NetworkResult.Success).data
        assertEquals("Hemnity Gym", info.softwareName)
        assertEquals("support@hemnity.in", info.supportEmail)
        assertEquals("+91-9999999999", info.supportPhone)
        assertEquals("Privacy summary text.", info.legalPrivacySummary)
        assertEquals("Terms summary text.", info.legalTermsSummary)
        assertFalse(info.maintenanceMode)
    }
}
