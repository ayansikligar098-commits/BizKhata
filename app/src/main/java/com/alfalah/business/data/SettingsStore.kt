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
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "bizkhata_settings")

/** Language, theme and active-profile preferences (DataStore, not the database). */
class SettingsStore(context: Context) {
    private val store = context.dataStore

    private val LANGUAGE = stringPreferencesKey("language")
    private val THEME_MODE = stringPreferencesKey("theme_mode")
    private val ACTIVE_PROFILE = longPreferencesKey("active_profile_id")

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
}
