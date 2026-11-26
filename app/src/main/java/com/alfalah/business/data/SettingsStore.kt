package com.alfalah.business.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.alfalah.business.domain.AppLanguage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "bizkhata_settings")

/** Language, theme and active-profile preferences (DataStore, not the database). */
class SettingsStore(context: Context) {
    private val store = context.dataStore

    private val LANGUAGE = stringPreferencesKey("language")
    private val THEME_MODE = stringPreferencesKey("theme_mode")
    private val ACTIVE_PROFILE = longPreferencesKey("active_profile_id")
    private val PIN_HASH = stringPreferencesKey("pin_hash")
    private val MOBILE = stringPreferencesKey("mobile")
    private val DISABLED_MODULES = stringPreferencesKey("disabled_modules")

    /** Theme mode: LIGHT, DARK or SYSTEM (default SYSTEM — follows the phone). */
    enum class ThemeMode { LIGHT, DARK, SYSTEM }

    val themeMode: Flow<ThemeMode> = store.data.map {
        when (it[THEME_MODE]) {
            "LIGHT" -> ThemeMode.LIGHT
            "DARK" -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        store.edit { it[THEME_MODE] = mode.name }
    }

    val language: Flow<AppLanguage> = store.data.map {
        when (it[LANGUAGE]) {
            "HINDI" -> AppLanguage.HINDI
            "HINGLISH" -> AppLanguage.HINGLISH
            else -> AppLanguage.ENGLISH // default: English
        }
    }

    val activeProfileId: Flow<Long> = store.data.map { it[ACTIVE_PROFILE] ?: -1L }

    suspend fun setLanguage(language: AppLanguage) {
        store.edit { it[LANGUAGE] = language.name }
    }

    suspend fun setActiveProfile(id: Long) {
        store.edit { it[ACTIVE_PROFILE] = id }
    }

    // --- Local mobile + PIN login (v2 spec §A, single-owner local-first) ---
    // Only a SHA-256 hash of the 4-digit PIN is stored — never the PIN
    // itself, and never a password. No PIN set = no lock screen.

    val hasPin: Flow<Boolean> = store.data.map { !it[PIN_HASH].isNullOrBlank() }
    val mobile: Flow<String> = store.data.map { it[MOBILE] ?: "" }

    suspend fun setPin(mobileNumber: String, pin: String) {
        require(pin.length == 4 && pin.all { it.isDigit() }) { "PIN must be 4 digits" }
        val hash = java.security.MessageDigest.getInstance("SHA-256")
            .digest(pin.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        store.edit {
            it[PIN_HASH] = hash
            it[MOBILE] = mobileNumber.trim()
        }
    }

    suspend fun verifyPin(pin: String): Boolean {
        val hash = java.security.MessageDigest.getInstance("SHA-256")
            .digest(pin.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val stored = store.data.first()[PIN_HASH]
        return stored != null && stored == hash
    }

    suspend fun clearPin() {
        store.edit { it.remove(PIN_HASH) }
    }

    // --- Customization Studio: modules the owner disabled ---
    // Stored as a comma-separated list of module keys; everything is
    // enabled by default and the drawer/dashboard hide disabled modules.

    val disabledModules: Flow<Set<String>> = store.data.map {
        it[DISABLED_MODULES]?.split(",")?.filter { s -> s.isNotBlank() }?.toSet() ?: emptySet()
    }

    suspend fun setModuleEnabled(key: String, enabled: Boolean) {
        store.edit { prefs ->
            val current = prefs[DISABLED_MODULES]?.split(",")?.filter { s -> s.isNotBlank() }?.toMutableSet()
                ?: mutableSetOf()
            if (enabled) current.remove(key) else current.add(key)
            prefs[DISABLED_MODULES] = current.joinToString(",")
        }
    }
}
