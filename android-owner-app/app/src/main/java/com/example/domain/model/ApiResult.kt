package com.example.domain.model

sealed class ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>()

    data class HttpError(
        val code: Int,
        val message: String,
        val isNotFound: Boolean = code == 404,
        val isUnauthorized: Boolean = code == 401,
        val isForbidden: Boolean = code == 403,
        val route: String? = null
    ) : ApiResult<Nothing>()

    data class NetworkError(val message: String) : ApiResult<Nothing>()
}
