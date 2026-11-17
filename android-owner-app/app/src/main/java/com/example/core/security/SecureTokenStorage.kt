package com.example.core.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.example.domain.model.AuthSession
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface SecureTokenStorage {
    fun saveSession(session: AuthSession)
    fun getSession(): AuthSession?
    fun clearSession()
}

class KeystoreSecureTokenStorage(context: Context) : SecureTokenStorage {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    @Synchronized
    override fun saveSession(session: AuthSession) {
        val raw = json.encodeToString(session)
        val encrypted = encrypt(raw)
        prefs.edit().putString(KEY_ENCRYPTED_SESSION, encrypted).apply()
    }

    @Synchronized
    override fun getSession(): AuthSession? {
        val encoded = prefs.getString(KEY_ENCRYPTED_SESSION, null) ?: return null
        return runCatching {
            val decrypted = decrypt(encoded)
            json.decodeFromString<AuthSession>(decrypted)
        }.getOrElse {
            clearSession()
            null
        }
    }

    @Synchronized
    override fun clearSession() {
        prefs.edit().remove(KEY_ENCRYPTED_SESSION).apply()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existingKey != null) return existingKey

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            ANDROID_KEYSTORE
        )
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))
        val ivB64 = Base64.encodeToString(iv, Base64.NO_WRAP)
        val cipherB64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP)
        return "$ivB64:$cipherB64"
    }

    private fun decrypt(payload: String): String {
        val parts = payload.split(":")
        require(parts.size == 2) { "Corrupt encrypted payload" }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val spec = GCMParameterSpec(128, iv)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), spec)
        val decrypted = cipher.doFinal(ciphertext)
        return String(decrypted, StandardCharsets.UTF_8)
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "hemnity_gym_session_aes_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val PREFS_NAME = "hemnity_secure_auth"
        private const val KEY_ENCRYPTED_SESSION = "encrypted_session_v1"
    }
}

class InMemorySecureTokenStorage : SecureTokenStorage {
    private var current: AuthSession? = null

    override fun saveSession(session: AuthSession) {
        current = session
    }

    override fun getSession(): AuthSession? = current

    override fun clearSession() {
        current = null
    }
}
