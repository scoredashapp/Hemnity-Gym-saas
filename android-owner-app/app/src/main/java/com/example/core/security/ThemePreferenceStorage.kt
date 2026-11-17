package com.example.core.security

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.domain.model.AppThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.uiPrefsDataStore by preferencesDataStore(name = "hemnity_ui_preferences")

class ThemePreferenceStorage(private val context: Context) {
    private val themeKey = stringPreferencesKey("app_theme_mode")
    private val hapticScanKey = booleanPreferencesKey("scanner_haptic_enabled")

    val themeMode: Flow<AppThemeMode> = context.uiPrefsDataStore.data.map { prefs ->
        val saved = prefs[themeKey]
        AppThemeMode.entries.firstOrNull { it.name == saved } ?: AppThemeMode.DARK
    }

    val scannerHapticEnabled: Flow<Boolean> = context.uiPrefsDataStore.data.map { prefs ->
        prefs[hapticScanKey] ?: true
    }

    suspend fun setThemeMode(mode: AppThemeMode) {
        context.uiPrefsDataStore.edit { prefs ->
            prefs[themeKey] = mode.name
        }
    }

    suspend fun setScannerHapticEnabled(enabled: Boolean) {
        context.uiPrefsDataStore.edit { prefs ->
            prefs[hapticScanKey] = enabled
        }
    }
}
