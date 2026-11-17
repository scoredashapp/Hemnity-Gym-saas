package com.example.data.remote

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

/**
 * Hemnity Gym Member REST API service.
 * Strictly consumes auth and member-scoped endpoints only.
 * Owner and Super Admin endpoints are intentionally excluded.
 */
interface HemnityApiService {

    @GET("public/landing")
    suspend fun getPublicLanding(): PublicLandingResponseDto

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequestDto): LoginResponseDto

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequestDto): MessageResponseDto

    @GET("auth/me")
    suspend fun getCurrentSession(): AuthMeResponseDto

    @POST("auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequestDto): LoginResponseDto

    @POST("auth/logout")
    suspend fun logout(@Body request: LogoutRequestDto): MessageResponseDto

    @GET("member/dashboard")
    suspend fun getDashboard(@Query("gym_id") gymId: String?): MemberDashboardDto

    @GET("member/gyms")
    suspend fun getMyGyms(): MemberGymsResponseDto

    @GET("member/memberships")
    suspend fun getMemberships(@Query("gym_id") gymId: String?): MembershipListResponseDto

    @POST("member/memberships/renew")
    suspend fun requestRenewal(@Body request: RenewalRequestDto): RenewalResponseDto

    @GET("member/attendance")
    suspend fun getAttendance(
        @Query("gym_id") gymId: String?,
        @Query("month") month: String?,
    ): AttendanceResponseDto

    @GET("member/id-card")
    suspend fun getDigitalIdCard(@Query("gym_id") gymId: String?): DigitalIdCardDto

    @GET("member/payments")
    suspend fun getPayments(
        @Query("gym_id") gymId: String?,
        @Query("page") page: Int = 1,
    ): PaymentsResponseDto

    @POST("member/payments/initiate")
    suspend fun initiatePayment(@Body request: PaymentInitiateRequestDto): PaymentInitiateResponseDto

    @GET("member/payments/{paymentId}/verify")
    suspend fun verifyPayment(
        @Path("paymentId") paymentId: String,
        @Query("gym_id") gymId: String?,
    ): PaymentVerificationDto

    @Streaming
    @GET("member/payments/{paymentId}/receipt")
    suspend fun downloadReceiptPdf(
        @Path("paymentId") paymentId: String,
        @Query("gym_id") gymId: String?,
    ): Response<ResponseBody>

    @GET("member/profile")
    suspend fun getProfile(@Query("gym_id") gymId: String?): MemberProfileDto

    @PATCH("member/profile")
    suspend fun updateProfile(
        @Query("gym_id") gymId: String?,
        @Body request: UpdateProfileRequestDto,
    ): MemberProfileDto

    @POST("member/profile/change-password")
    suspend fun changePassword(@Body request: ChangePasswordRequestDto): MessageResponseDto

    @GET("member/notifications")
    suspend fun getNotifications(
        @Query("gym_id") gymId: String?,
        @Query("page") page: Int = 1,
    ): NotificationsResponseDto

    @POST("member/notifications/{notificationId}/read")
    suspend fun markNotificationRead(@Path("notificationId") notificationId: String): MessageResponseDto

    @POST("member/notifications/read-all")
    suspend fun markAllNotificationsRead(@Query("gym_id") gymId: String?): MessageResponseDto

    @PATCH("member/notifications/preferences")
    suspend fun updateNotificationPreferences(
        @Body request: NotificationPreferencesDto,
    ): NotificationPreferencesDto

    @POST("member/devices/token")
    suspend fun registerDeviceToken(@Body request: DeviceTokenRequestDto): MessageResponseDto

    @DELETE("member/devices/token")
    suspend fun revokeDeviceToken(@Query("token") token: String): MessageResponseDto
}
