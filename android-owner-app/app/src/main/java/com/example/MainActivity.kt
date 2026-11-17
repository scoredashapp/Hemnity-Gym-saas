package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.di.AppContainer
import com.example.domain.model.AppThemeMode
import com.example.ui.navigation.HemnityAppNavHost
import com.example.ui.theme.HemnityGymTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val container = remember { AppContainer(applicationContext) }
            val themeMode by container.themePreferences.themeMode.collectAsStateWithLifecycle(
                initialValue = AppThemeMode.DARK
            )
            HemnityGymTheme(themeMode = themeMode) {
                HemnityAppNavHost(
                    container = container,
                    themeMode = themeMode
                )
            }
        }
    }
}
