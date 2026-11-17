package com.example.core.network

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface HemnityApiService {

    // --- Confirmed Live Endpoints ---
    @GET("public/landing")
    suspend fun getPublicLanding(): Response<ResponseBody>

    @POST("auth/login")
    suspend fun login(@Body body: RequestBody): Response<ResponseBody>

    @GET("owner/dashboard")
    suspend fun getOwnerDashboard(): Response<ResponseBody>

    @GET("owner/dashboard")
    suspend fun getOwnerDashboardWithAuth(
        @Header("Authorization") authorization: String
    ): Response<ResponseBody>

    @GET("owner/members")
    suspend fun getOwnerMembers(@Query("search") search: String? = null): Response<ResponseBody>

    @POST("owner/members")
    suspend fun createOwnerMember(@Body body: RequestBody): Response<ResponseBody>

    @POST("owner/attendance/qr-checkin")
    suspend fun qrCheckIn(@Body body: RequestBody): Response<ResponseBody>

    @GET("docs/spec")
    suspend fun getOpenApiSpec(): Response<ResponseBody>

    // --- Extended Gym Owner & Auth Endpoints ---
    @GET("auth/me")
    suspend fun getCurrentUser(): Response<ResponseBody>

    @POST("auth/refresh")
    suspend fun refreshToken(@Body body: RequestBody): Response<ResponseBody>

    @POST("auth/logout")
    suspend fun logout(): Response<ResponseBody>

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: RequestBody): Response<ResponseBody>

    @PUT("owner/members/{id}")
    suspend fun updateOwnerMember(
        @Path("id") memberId: String,
        @Body body: RequestBody
    ): Response<ResponseBody>

    @POST("owner/members/{id}/status")
    suspend fun updateMemberStatus(
        @Path("id") memberId: String,
        @Body body: RequestBody
    ): Response<ResponseBody>

    @POST("owner/members/{id}/renew")
    suspend fun renewMemberPlan(
        @Path("id") memberId: String,
        @Body body: RequestBody
    ): Response<ResponseBody>

    @POST("owner/members/{id}/reissue-qr")
    suspend fun reissueMemberQr(@Path("id") memberId: String): Response<ResponseBody>

    @GET("owner/members/{id}/payments")
    suspend fun getMemberPayments(@Path("id") memberId: String): Response<ResponseBody>

    @GET("owner/members/{id}/attendance")
    suspend fun getMemberAttendance(@Path("id") memberId: String): Response<ResponseBody>

    @GET("owner/attendance")
    suspend fun getOwnerAttendanceHistory(@Query("date") date: String? = null): Response<ResponseBody>

    @GET("owner/plans")
    suspend fun getOwnerPlans(): Response<ResponseBody>

    @POST("owner/plans")
    suspend fun createOwnerPlan(@Body body: RequestBody): Response<ResponseBody>

    @PUT("owner/plans/{id}")
    suspend fun updateOwnerPlan(
        @Path("id") planId: String,
        @Body body: RequestBody
    ): Response<ResponseBody>

    @GET("owner/payments")
    suspend fun getOwnerPayments(
        @Query("status") status: String? = null,
        @Query("search") search: String? = null
    ): Response<ResponseBody>

    @POST("owner/payments")
    suspend fun createManualPayment(@Body body: RequestBody): Response<ResponseBody>

    @GET("owner/reports")
    suspend fun getOwnerReports(
        @Query("from") fromDate: String? = null,
        @Query("to") toDate: String? = null
    ): Response<ResponseBody>

    @GET("owner/settings")
    suspend fun getOwnerSettings(): Response<ResponseBody>

    @PUT("owner/settings")
    suspend fun updateOwnerSettings(@Body body: RequestBody): Response<ResponseBody>

    @GET("owner/subscription")
    suspend fun getOwnerSubscription(): Response<ResponseBody>

    @GET("owner/notifications")
    suspend fun getOwnerNotifications(): Response<ResponseBody>
}
