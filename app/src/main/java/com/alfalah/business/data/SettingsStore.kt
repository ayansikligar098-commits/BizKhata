package com.alfalah.business.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.AuthUtils
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
    private val AI_KEY = stringPreferencesKey("ai_key")
    // KEY MIGRATION (UPDATE 17 check, 2026-11-27): the AI key was
    // first stored under a different, provider-named DataStore key
    // ("gemini_api_key") in the builds pushed
    // 2026-11-26 16:09–17:04 IST (commits eaac99ae35bc,
    // 9ace8cbddfdc). UPDATE 12 (commit e116f6105199, 17:04 IST)
    // renamed the field to the neutral "ai_key" (flow aiKey) but
    // added NO migration — so a key the owner entered early, under
    // the old name, became invisible to the app: aiKey read empty,
    // AI summary stayed OFF and cloud streaming never ran, even
    // though the key was still sitting in the SAME DataStore file
    // ("bizkhata_settings" — the file name never changed). The
    // constant below is the old storage key, kept ONLY so the
    // one-time migration can find it. It is never shown in the UI,
    // never logged, and the key VALUE is never read into a log or a
    // message — it is copied opaquely from one DataStore entry to
    // the other. The old entry is left in place by the migration
    // itself; clearAiKey() removes BOTH entries, so clearing the key
    // can never be undone by a later migration run.
    private val LEGACY_AI_KEY = stringPreferencesKey("gemini_api_key")
    private val AI_LANGUAGE_PREF = stringPreferencesKey("ai_language_pref")
    private val CUSTOM_SERVICES = stringPreferencesKey("custom_services")
    private val VOICE_RESPONSES = booleanPreferencesKey("voice_responses_enabled")
    private val VOICE_RATE = floatPreferencesKey("voice_speech_rate")
    private val VOICE_PITCH = floatPreferencesKey("voice_speech_pitch")
    private val VOICE_CONTINUOUS = booleanPreferencesKey("voice_continuous_mode")

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
    //
    // UPDATE 24 — login/account mirror (2026-11-27, owner report:
    // "Login Save Nahi Rehta, Ek Number Se Kai Account Bana Rahe Hai" /
    // "Kal Account Banaya Tha, Aaj No Account Found Bata Rha Hai").
    // Website bugs checked against Android, and what was found:
    //  (1) Re-registration overwrote the owner — setPin() blindly
    //      replaced PIN_HASH + MOBILE, so Settings → Remove PIN Lock →
    //      restart → create-PIN silently made a "second account" from
    //      any number, changing the PIN/identity. FIXED: setPin() now
    //      refuses (returns false, writes nothing) when a PIN already
    //      exists — the check runs INSIDE store.edit, so it is atomic.
    //      The only way to replace a PIN is the explicit resetPin()
    //      (Forgot PIN), which requires the registered mobile.
    //  (2) No mobile normalisation — the mobile was stored raw
    //      (trim only), and AuthScreen truncated input to 10 digits,
    //      so "+91 98123 45670" was stored as the WRONG number
    //      "9198123456". FIXED: every mobile goes through
    //      AuthUtils.normalizeMobile (strip non-digits, drop +91/91/0,
    //      keep last 10) before it is stored or compared. The PIN hash
    //      is SHA-256 of the PIN alone, never salted with the mobile,
    //      so normalising cannot break an existing PIN.
    //      LIMIT: a mobile mangled by the old truncation (stored as a
    //      wrong 10-digit number) cannot be recovered by normalising —
    //      the lost digit is gone. The PIN still works (hash is
    //      PIN-only), so the owner can always unlock with the PIN and
    //      remove/re-create it; only PIN-forgotten + mangled-mobile
    //      together has no in-app recovery.
    //  (3) Login persistence — DIFFERS from the website, nothing to
    //      mirror: there is no session/token/cookie here at all. The
    //      owner (PIN hash + mobile) lives in the DataStore file
    //      "bizkhata_settings", which survives app restart and process
    //      death — no localStorage split, no refresh-token rotation,
    //      no multi-tab race. The per-process "unlocked" flag resetting
    //      on restart is the intended PIN lock (re-prompt), not
    //      account loss; no code path drops the owner on restart.
    //  (4) "No account" wording — the create screen used to appear
    //      with no explanation whenever no PIN was stored, even when
    //      business data already existed. AuthScreen now says so
    //      (see hasExistingData), and resetPin() distinguishes a
    //      wrong number from no account at all.
    //  (5) Forgot PIN — there was NO reset flow: the old hint was
    //      "remove the PIN from Settings after unlocking, or clear app
    //      data (erases everything)" — a catch-22 when the PIN itself
    //      is forgotten. FIXED: resetPin() below + Forgot PIN in
    //      AuthScreen; on success the user is logged in immediately.
    //      LIMIT: v1 is local-first with no OTP/SMS (free-only build),
    //      so the gate is knowing the registered mobile number.
    //  (6) Data preservation — VERIFIED: setPin/clearPin touch only
    //      DataStore keys, never Room; registration only inserts a
    //      profile. No wipe path exists in the auth flow.

    val hasPin: Flow<Boolean> = store.data.map { !it[PIN_HASH].isNullOrBlank() }
    val mobile: Flow<String> = store.data.map { it[MOBILE] ?: "" }

    /**
     * Create the owner account (first run, or after the PIN was removed
     * in Settings). Returns false — writing NOTHING — when a PIN already
     * exists: one account per mobile, re-registration is refused, never
     * an overwrite. Callers show "Is number par account pehle se hai —
     * login karo ya Forgot PIN use karo". The mobile is normalised
     * before storing; throws when the PIN/number is malformed.
     */
    suspend fun setPin(mobileNumber: String, pin: String): Boolean {
        require(pin.length == 4 && pin.all { it.isDigit() }) { "PIN must be 4 digits" }
        val mobile = AuthUtils.normalizeMobile(mobileNumber)
        require(mobile.length == 10) { "Enter a valid 10-digit mobile number." }
        var created = false
        store.edit { prefs ->
            if (prefs[PIN_HASH].isNullOrBlank()) {
                prefs[PIN_HASH] = AuthUtils.hashPin(pin)
                prefs[MOBILE] = mobile
                created = true
            }
        }
        return created
    }

    /**
     * Forgot PIN: replace the PIN only when an account exists AND the
     * entered mobile matches the registered mobile (both normalised, so
     * a stored number written before UPDATE 24 still matches when it
     * was stored correctly). Returns false on a wrong number or when
     * there is no account at all — the caller tells those apart.
     * On success the caller logs the user in immediately.
     */
    suspend fun resetPin(mobileNumber: String, pin: String): Boolean {
        require(pin.length == 4 && pin.all { it.isDigit() }) { "PIN must be 4 digits" }
        val mobile = AuthUtils.normalizeMobile(mobileNumber)
        require(mobile.length == 10) { "Enter a valid 10-digit mobile number." }
        var reset = false
        store.edit { prefs ->
            val storedHash = prefs[PIN_HASH]
            val storedMobile = AuthUtils.normalizeMobile(prefs[MOBILE] ?: "")
            if (!storedHash.isNullOrBlank() && storedMobile == mobile) {
                prefs[PIN_HASH] = AuthUtils.hashPin(pin)
                prefs[MOBILE] = mobile
                reset = true
            }
        }
        return reset
    }

    suspend fun verifyPin(pin: String): Boolean {
        val hash = AuthUtils.hashPin(pin)
        val stored = store.data.first()[PIN_HASH]
        return stored != null && stored == hash
    }

    /**
     * Remove the PIN lock (deliberate owner action from Settings, only
     * reachable while unlocked). The MOBILE is deliberately KEPT: when
     * the owner creates a new PIN afterwards, AuthScreen enforces the
     * same registered number, so a removed PIN can never be used to
     * silently re-register the account under a different number. Room
     * data is never touched here.
     */
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

    // --- Custom services (Daily Business / Customization Studio) ---
    // Services the owner adds himself ("Lamintion", "Photo Print"...).
    // Stored as a comma-separated list, so a name may not contain a comma.
    // They appear as categories in the Quick Daily Entry form and in the
    // Daily Business service summary, and are saved as the transaction
    // category — so their income is grouped under their own name. Renaming
    // a service only affects NEW entries: historical transactions keep the
    // name they were saved with (never rewrite history, §16/§17).
    // NOTE: like disabled modules, this is stored app-wide in v1; making
    // it per business profile is remaining work alongside per-profile
    // Customization Studio settings.

    val customServices: Flow<Set<String>> = store.data.map {
        it[CUSTOM_SERVICES]?.split(",")?.map { s -> s.trim() }?.filter { s -> s.isNotBlank() }?.toSet()
            ?: emptySet()
    }

    suspend fun addCustomService(name: String) {
        val clean = name.trim()
        require(clean.isNotBlank()) { "Enter a service name." }
        require(',' !in clean) { "A service name cannot contain a comma." }
        store.edit { prefs ->
            val current = prefs[CUSTOM_SERVICES]?.split(",")?.map { s -> s.trim() }
                ?.filter { s -> s.isNotBlank() }?.toMutableSet() ?: mutableSetOf()
            current.add(clean)
            prefs[CUSTOM_SERVICES] = current.joinToString(",")
        }
    }

    suspend fun renameCustomService(oldName: String, newName: String) {
        val clean = newName.trim()
        require(clean.isNotBlank()) { "Enter a service name." }
        require(',' !in clean) { "A service name cannot contain a comma." }
        store.edit { prefs ->
            val current = prefs[CUSTOM_SERVICES]?.split(",")?.map { s -> s.trim() }
                ?.filter { s -> s.isNotBlank() }?.toMutableSet() ?: mutableSetOf()
            current.remove(oldName)
            current.add(clean)
            prefs[CUSTOM_SERVICES] = current.joinToString(",")
        }
    }

    suspend fun removeCustomService(name: String) {
        store.edit { prefs ->
            val current = prefs[CUSTOM_SERVICES]?.split(",")?.map { s -> s.trim() }
                ?.filter { s -> s.isNotBlank() }?.toMutableSet() ?: mutableSetOf()
            current.remove(name)
            prefs[CUSTOM_SERVICES] = current.joinToString(",")
        }
    }

    // --- BizKhata AI Assistant key (UPDATE 12, owner order 2026-11-26) ---
    // The owner's own AI key, entered by him in Settings under the neutral
    // label "AI key". No provider name appears anywhere in the UI, the key
    // VALUE is never displayed (password-masked field only), and no key is
    // invented, embedded or shipped in the app. Stored in the app-private
    // DataStore (never in code, never in git); the owner can remove it at
    // any time, which switches the AI summary off. Without a key the
    // assistant still answers from real data with its built-in responder.

    val aiKey: Flow<String> = store.data.map { it[AI_KEY] ?: "" }

    /** One-time key migration (see LEGACY_AI_KEY above). If the new
     *  "ai_key" entry is empty and the legacy entry holds a value,
     *  copy it opaquely into "ai_key" and leave the legacy entry in
     *  place. Returns true only when a copy happened — the VALUE is
     *  never logged, displayed or returned. Idempotent and safe to
     *  call on every launch; a per-process guard keeps it to one
     *  DataStore read per app start. */
    private val migrationDone = java.util.concurrent.atomic.AtomicBoolean(false)

    suspend fun migrateLegacyAiKey(): Boolean {
        if (!migrationDone.compareAndSet(false, true)) return false
        val prefs = store.data.first()
        val legacy = prefs[LEGACY_AI_KEY].orEmpty()
        if (prefs[AI_KEY].isNullOrBlank() && legacy.isNotBlank()) {
            store.edit { it[AI_KEY] = legacy }
            return true
        }
        return false
    }

    suspend fun setAiKey(key: String) {
        store.edit { it[AI_KEY] = key.trim() }
    }

    suspend fun clearAiKey() {
        // Remove BOTH entries: otherwise the next launch's migration
        // would resurrect a key the owner deliberately cleared.
        store.edit {
            it.remove(AI_KEY)
            it.remove(LEGACY_AI_KEY)
        }
    }

    // --- BizKhata AI Assistant language (UPDATE 13) ---
    // Manual preference for the language the assistant replies in and
    // listens with (voice input). "AUTO" (default) = detect it from each
    // message — the user is NEVER forced to pick a language before
    // chatting, and mid-conversation switching still works. Any other
    // value is an AiLanguage code ("gu", "ta", "en", "hinglish", …).
    // Stored app-wide in v1, like the UI language.

    val aiLanguagePref: Flow<String> = store.data.map { it[AI_LANGUAGE_PREF] ?: "AUTO" }

    suspend fun setAiLanguagePref(code: String) {
        store.edit { it[AI_LANGUAGE_PREF] = code.trim().ifBlank { "AUTO" } }
    }

    // --- BizKhata AI Assistant voice (UPDATE 18) ---
    // Speak replies aloud (default ON), speech rate / pitch, and
    // continuous conversation mode. Stored app-wide in v1, like the
    // AI-language preference above — the same values apply whichever
    // business profile is active; profile isolation of the RECORDS
    // is unaffected (every voice action still goes through the
    // pipeline with this profile's id). No audio is ever stored.
    // Speech rate 1.0 = normal; 0.8 slow, 1.25 fast.

    val voiceResponsesEnabled: Flow<Boolean> = store.data.map { it[VOICE_RESPONSES] ?: true }

    suspend fun setVoiceResponsesEnabled(enabled: Boolean) {
        store.edit { it[VOICE_RESPONSES] = enabled }
    }

    val voiceSpeechRate: Flow<Float> = store.data.map { (it[VOICE_RATE] ?: 1.0f).coerceIn(0.5f, 2.0f) }

    suspend fun setVoiceSpeechRate(rate: Float) {
        store.edit { it[VOICE_RATE] = rate.coerceIn(0.5f, 2.0f) }
    }

    val voiceSpeechPitch: Flow<Float> = store.data.map { (it[VOICE_PITCH] ?: 1.0f).coerceIn(0.5f, 2.0f) }

    suspend fun setVoiceSpeechPitch(pitch: Float) {
        store.edit { it[VOICE_PITCH] = pitch.coerceIn(0.5f, 2.0f) }
    }

    val voiceContinuousMode: Flow<Boolean> = store.data.map { it[VOICE_CONTINUOUS] ?: false }

    suspend fun setVoiceContinuousMode(enabled: Boolean) {
        store.edit { it[VOICE_CONTINUOUS] = enabled }
    }
}
