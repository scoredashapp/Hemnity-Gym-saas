package com.example.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.squareup.moshi.Moshi
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private val Context.secureSessionDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "hemnity_secure_session"
)

class AndroidKeystoreTokenStorage(
    private val context: Context,
    private val moshi: Moshi,
) : TokenStorage {

    private val mutex = Mutex()
    private val _sessionFlow = MutableStateFlow<SessionTokens?>(null)
    override val sessionFlow: StateFlow<SessionTokens?> = _sessionFlow.asStateFlow()

    private val sessionAdapter = moshi.adapter(SessionTokens::class.java)
    private val encryptedPayloadKey = stringPreferencesKey("encrypted_session_v1")

    override suspend fun initialize() {
        mutex.withLock {
            val prefs = context.secureSessionDataStore.data.first()
            val encoded = prefs[encryptedPayloadKey]
            if (encoded.isNullOrBlank()) {
                _sessionFlow.value = null
                return
            }
            val decrypted = runCatching { decrypt(encoded) }.getOrNull()
            val parsed = decrypted?.let { runCatching { sessionAdapter.fromJson(it) }.getOrNull() }
            if (parsed != null && RoleGuard.isAllowedMemberRole(parsed.role) && parsed.accessToken.isNotBlank()) {
                _sessionFlow.value = parsed
            } else {
                context.secureSessionDataStore.edit { it.remove(encryptedPayloadKey) }
                _sessionFlow.value = null
            }
        }
    }

    override fun currentSession(): SessionTokens? = _sessionFlow.value

    override suspend fun saveSession(session: SessionTokens) {
        require(RoleGuard.isAllowedMemberRole(session.role)) {
            RoleGuard.rejectionMessageFor(session.role)
        }
        mutex.withLock {
            val json = sessionAdapter.toJson(session)
            val encrypted = encrypt(json)
            context.secureSessionDataStore.edit { prefs ->
                prefs[encryptedPayloadKey] = encrypted
            }
            _sessionFlow.value = session
        }
    }

    override suspend fun updateSelectedGymId(gymId: String) {
        mutex.withLock {
            val existing = _sessionFlow.value ?: return
            val updated = existing.copy(selectedGymId = gymId)
            val json = sessionAdapter.toJson(updated)
            val encrypted = encrypt(json)
            context.secureSessionDataStore.edit { prefs ->
                prefs[encryptedPayloadKey] = encrypted
            }
            _sessionFlow.value = updated
        }
    }

    override suspend fun clearSession() {
        mutex.withLock {
            context.secureSessionDataStore.edit { prefs ->
                prefs.remove(encryptedPayloadKey)
            }
            _sessionFlow.value = null
        }
    }

    private fun getOrCreateAesKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existingKey != null) return existingKey

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE,
        )
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateAesKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        val combined = ByteBuffer.allocate(4 + iv.size + ciphertext.size)
            .putInt(iv.size)
            .put(iv)
            .put(ciphertext)
            .array()
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String {
        val raw = Base64.decode(encoded, Base64.NO_WRAP)
        val buffer = ByteBuffer.wrap(raw)
        val ivLen = buffer.int
        require(ivLen in 12..32) { "Invalid GCM IV length" }
        val iv = ByteArray(ivLen)
        buffer.get(iv)
        val ciphertext = ByteArray(buffer.remaining())
        buffer.get(ciphertext)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateAesKey(), GCMParameterSpec(128, iv))
        val plaintext = cipher.doFinal(ciphertext)
        return String(plaintext, Charsets.UTF_8)
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "hemnity_member_session_aes_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
