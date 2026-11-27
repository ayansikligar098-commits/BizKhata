package com.alfalah.business.domain

/**
 * UPDATE 24 — login/account mirror (2026-11-27).
 * Pure, JVM-testable auth helpers shared by SettingsStore and AuthScreen,
 * so the mobile number is normalised IDENTICALLY everywhere it is read,
 * stored or compared. The PIN hash is SHA-256 of the PIN alone — it is
 * NOT salted with the mobile — so normalising the mobile can never break
 * an existing PIN. (Verified in SettingsStore: setPin/verifyPin hash
 * only the PIN; see AuthUtilsTest for the cases.)
 *
 * One account per mobile, on this device: the app is single-owner and
 * local-first, so there is exactly one stored owner (one PIN hash + one
 * mobile in DataStore). Re-registration must never silently replace it.
 */
object AuthUtils {

    /**
     * Normalise an Indian mobile number to its 10 digits.
     * Strips spaces, dashes, brackets and any other non-digit, then keeps
     * the last 10 digits — so "+91 98123 45670", "91-98123-45670",
     * "09812345670" and "9812345670" are all the same number.
     * Returns "" when fewer than 10 digits remain (not a valid number).
     * A genuine 10-digit number is returned unchanged — a leading "91"
     * inside the 10 digits is NOT stripped.
     */
    fun normalizeMobile(raw: String): String {
        val digits = raw.filter { it.isDigit() }
        if (digits.length < 10) return ""
        return digits.takeLast(10)
    }

    /** SHA-256 hex of the 4-digit PIN. The PIN itself is never stored. */
    fun hashPin(pin: String): String {
        return java.security.MessageDigest.getInstance("SHA-256")
            .digest(pin.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    /** Masked mobile for display, e.g. "••••••5670". "" when not 10 digits. */
    fun maskMobile(normalized: String): String {
        if (normalized.length != 10) return ""
        return "••••••" + normalized.takeLast(4)
    }
}
