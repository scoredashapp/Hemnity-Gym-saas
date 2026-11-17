package com.example

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import com.example.core.network.SessionCookieJar
import com.example.core.network.SessionEventBus
import com.example.core.security.RoleGuard
import com.example.core.security.SessionTokens
import com.example.core.security.TokenStorage
import com.example.data.remote.HemnityApiService
import com.example.data.repository.AuthRepository
import com.example.ui.auth.AuthViewModel
import com.example.ui.auth.LoginScreen
import com.example.ui.theme.HemnityGymTheme
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun `app name matches Hemnity Gym Member`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        assertEquals("Hemnity Gym Member", context.getString(R.string.app_name))
    }

    @Test
    fun `login screen validates empty submission and renders member inputs`() {
        val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
        val api = Retrofit.Builder()
            .baseUrl("https://gym.hemnity.in/api/v1/")
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(HemnityApiService::class.java)
        val fakeStorage = object : TokenStorage {
            private val _flow = MutableStateFlow<SessionTokens?>(null)
            override val sessionFlow: StateFlow<SessionTokens?> = _flow
            override suspend fun initialize() = Unit
            override fun currentSession(): SessionTokens? = _flow.value
            override suspend fun saveSession(session: SessionTokens) {
                require(RoleGuard.isAllowedMemberRole(session.role))
                _flow.value = session
            }
            override suspend fun updateSelectedGymId(gymId: String) {
                _flow.value = _flow.value?.copy(selectedGymId = gymId)
            }
            override suspend fun clearSession() {
                _flow.value = null
            }
        }
        val repo = AuthRepository(
            apiService = api,
            tokenStorage = fakeStorage,
            cookieJar = SessionCookieJar(),
            sessionEventBus = SessionEventBus(),
            moshi = moshi,
        )
        val viewModel = AuthViewModel(repo)

        composeRule.setContent {
            HemnityGymTheme {
                LoginScreen(authViewModel = viewModel, onLoginSuccess = {})
            }
        }

        composeRule.waitForIdle()
        composeRule.onNodeWithTag("login_identifier_input").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("login_password_input").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("login_button").performScrollTo().assertIsDisplayed()

        // Empty submit shows validation banner
        composeRule.onNodeWithTag("login_button").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("login_error_banner").performScrollTo().assertIsDisplayed()

        // Typing clears error banner
        composeRule.onNodeWithTag("login_identifier_input").performScrollTo().performTextInput("member@gym.hemnity.in")
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("login_error_banner").assertDoesNotExist()
    }
}
