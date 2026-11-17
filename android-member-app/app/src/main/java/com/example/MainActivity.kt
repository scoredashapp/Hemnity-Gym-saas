package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.ui.navigation.HemnityAppNavHost
import com.example.ui.theme.HemnityGymTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val appContainer = (application as HemnityMemberApp).container
        setContent {
            HemnityGymTheme {
                HemnityAppNavHost(container = appContainer)
            }
        }
    }
}
