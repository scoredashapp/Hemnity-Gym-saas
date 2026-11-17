package com.example.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.domain.model.NotificationPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.uiPrefsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "hemnity_ui_preferences"
)

class PreferencesRepository(private val context: Context) {
    private val keyPushEnabled = booleanPreferencesKey("push_enabled")
    private val keyMembershipAlerts = booleanPreferencesKey("membership_alerts")
    private val keyPaymentAlerts = booleanPreferencesKey("payment_alerts")
    private val keyGymAnnouncements = booleanPreferencesKey("gym_announcements")
    private val keyDevicePushToken = stringPreferencesKey("device_push_token")

    val notificationPreferencesFlow: Flow<NotificationPreferences> =
        context.uiPrefsDataStore.data.map { prefs ->
            NotificationPreferences(
                pushEnabled = prefs[keyPushEnabled] ?: true,
                membershipAlerts = prefs[keyMembershipAlerts] ?: true,
                paymentAlerts = prefs[keyPaymentAlerts] ?: true,
                gymAnnouncements = prefs[keyGymAnnouncements] ?: true,
            )
        }

    suspend fun saveNotificationPreferences(prefs: NotificationPreferences) {
        context.uiPrefsDataStore.edit { store ->
            store[keyPushEnabled] = prefs.pushEnabled
            store[keyMembershipAlerts] = prefs.membershipAlerts
            store[keyPaymentAlerts] = prefs.paymentAlerts
            store[keyGymAnnouncements] = prefs.gymAnnouncements
        }
    }

    suspend fun saveDevicePushToken(token: String) {
        context.uiPrefsDataStore.edit { it[keyDevicePushToken] = token }
    }

    suspend fun getDevicePushToken(): String? =
        context.uiPrefsDataStore.data.first()[keyDevicePushToken]

    suspend fun clearDevicePushToken() {
        context.uiPrefsDataStore.edit { it.remove(keyDevicePushToken) }
    }
}
