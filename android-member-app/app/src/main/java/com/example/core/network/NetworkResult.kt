package com.example.core.network

import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import retrofit2.HttpException

@JsonClass(generateAdapter = true)
data class ApiErrorEnvelope(
    val error: String? = null,
    val message: String? = null,
    val route: String? = null,
    val code: String? = null,
)

sealed interface AppError {
    val message: String

    data class Unauthorized(
        override val message: String = "Your session has expired. Please sign in again.",
    ) : AppError

    data class ForbiddenRole(
        override val message: String,
    ) : AppError

    data class EndpointNotDeployed(
        val route: String?,
        override val message: String,
    ) : AppError

    data class Validation(
        override val message: String,
    ) : AppError

    data class Network(
        override val message: String = "Unable to connect to Hemnity servers. Please check your internet connection.",
    ) : AppError

    data class Server(
        val statusCode: Int,
        override val message: String,
    ) : AppError
}

sealed interface NetworkResult<out T> {
    data class Success<T>(val data: T) : NetworkResult<T>
    data class Failure(val error: AppError) : NetworkResult<Nothing>
}

object ApiErrorMapper {
    fun mapThrowable(throwable: Throwable, moshi: Moshi): AppError {
        return when (throwable) {
            is HttpException -> mapHttpException(throwable, moshi)
            is UnknownHostException -> AppError.Network(
                "Cannot reach gym.hemnity.in. Check your internet connection."
            )
            is SocketTimeoutException -> AppError.Network(
                "Connection timed out while contacting Hemnity Gym servers."
            )
            is SSLException -> AppError.Network(
                "Secure TLS connection failed. Please ensure your device date/time and network are secure."
            )
            is IOException -> AppError.Network(
                "Network error occurred. Please check your connection and retry."
            )
            else -> AppError.Server(500, throwable.message ?: "Unexpected application error.")
        }
    }

    private fun mapHttpException(exception: HttpException, moshi: Moshi): AppError {
        val code = exception.code()
        val rawBody = runCatching { exception.response()?.errorBody()?.string() }.getOrNull()
        val parsed = rawBody?.let {
            runCatching { moshi.adapter(ApiErrorEnvelope::class.java).fromJson(it) }.getOrNull()
        }
        val serverMsg = parsed?.error?.takeIf { it.isNotBlank() }
            ?: parsed?.message?.takeIf { it.isNotBlank() }

        return when (code) {
            400, 422 -> AppError.Validation(
                serverMsg ?: "Please check the submitted information and try again."
            )
            401 -> AppError.Unauthorized(
                serverMsg ?: "Session expired or invalid credentials."
            )
            403 -> AppError.ForbiddenRole(
                serverMsg ?: "You do not have permission to access this resource."
            )
            404 -> {
                val isMissingApiRoute = parsed?.route != null ||
                    (serverMsg?.contains("API endpoint not found", ignoreCase = true) == true)
                if (isMissingApiRoute) {
                    AppError.EndpointNotDeployed(
                        route = parsed?.route,
                        message = "Backend member endpoint (${parsed?.route ?: "route"}) is not yet enabled on gym.hemnity.in.",
                    )
                } else {
                    AppError.Server(404, serverMsg ?: "Requested record was not found.")
                }
            }
            429 -> AppError.Server(429, serverMsg ?: "Too many requests. Please wait a moment and try again.")
            else -> AppError.Server(
                statusCode = code,
                message = serverMsg ?: "Server returned an unexpected error (HTTP $code).",
            )
        }
    }
}
