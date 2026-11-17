package com.example.data.repository

import com.example.core.network.JsonParserHelpers
import com.example.domain.model.ApiResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import org.json.JSONObject
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException

object RepositoryHelpers {
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    fun jsonBody(build: JSONObject.() -> Unit): RequestBody {
        val obj = JSONObject().apply(build)
        return obj.toString().toRequestBody(JSON_MEDIA_TYPE)
    }

    suspend fun <T> safeApiCall(
        routeHint: String,
        call: suspend () -> Response<ResponseBody>,
        mapper: (String) -> T
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        try {
            val response = call()
            if (response.isSuccessful) {
                val raw = response.body()?.string().orEmpty()
                ApiResult.Success(mapper(raw))
            } else {
                val errRaw = response.errorBody()?.string()
                val errObj = JsonParserHelpers.parseObjectOrNull(errRaw)
                val parsedRoute = JsonParserHelpers.firstNonBlankString(errObj, "route") ?: routeHint
                val defaultMsg = when (response.code()) {
                    401 -> "Authentication required or session expired."
                    403 -> "Access denied for this account or gym tenant."
                    404 -> "API endpoint not available on server ($parsedRoute)."
                    422, 400 -> "Invalid request data."
                    else -> "Server returned HTTP ${response.code()}."
                }
                val message = JsonParserHelpers.extractErrorMessage(errRaw, defaultMsg)
                ApiResult.HttpError(
                    code = response.code(),
                    message = message,
                    route = parsedRoute
                )
            }
        } catch (e: SocketTimeoutException) {
            ApiResult.NetworkError("Request timed out while connecting to gym.hemnity.in.")
        } catch (e: SSLException) {
            ApiResult.NetworkError("Secure TLS connection could not be verified.")
        } catch (e: IOException) {
            ApiResult.NetworkError("Unable to reach gym.hemnity.in. Please check your internet connection.")
        } catch (e: Exception) {
            ApiResult.NetworkError(e.message ?: "Unexpected error communicating with server.")
        }
    }
}
