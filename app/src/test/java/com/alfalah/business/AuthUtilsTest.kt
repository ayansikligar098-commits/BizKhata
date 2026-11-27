package com.alfalah.business

import com.alfalah.business.domain.AuthUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * UPDATE 24 — login/account mirror: mobile normalisation + PIN hash.
 * Pure JVM tests (no DataStore/Robolectric): the same normalisation runs
 * in AuthScreen and in SettingsStore, so these cases pin the contract
 * both sides share. The DataStore guard itself (setPin refusing when a
 * PIN exists, resetPin requiring the registered mobile) cannot run on
 * the JVM — it is covered by verify-android.py §15 + code inspection.
 */
class AuthUtilsTest {

    @Test
    fun plainTenDigits_unchanged() {
        assertEquals("9812345670", AuthUtils.normalizeMobile("9812345670"))
    }

    @Test
    fun plus91WithSpacesAndDashes_sameNumber() {
        assertEquals("9812345670", AuthUtils.normalizeMobile("+91 98123 45670"))
        assertEquals("9812345670", AuthUtils.normalizeMobile("91-98123-45670"))
        assertEquals("9812345670", AuthUtils.normalizeMobile("+919812345670"))
    }

    @Test
    fun leadingZero_sameNumber() {
        assertEquals("9812345670", AuthUtils.normalizeMobile("09812345670"))
        assertEquals("9812345670", AuthUtils.normalizeMobile("0 98123 45670"))
    }

    @Test
    fun bracketsAndSpaces_sameNumber() {
        assertEquals("9812345670", AuthUtils.normalizeMobile("(98123) 45670"))
    }

    @Test
    fun tooShort_isInvalid() {
        assertEquals("", AuthUtils.normalizeMobile("981234567"))
        assertEquals("", AuthUtils.normalizeMobile(""))
        assertEquals("", AuthUtils.normalizeMobile("abcd"))
    }

    @Test
    fun tenDigitsStartingWith91_notStripped() {
        // A genuine 10-digit number that happens to start with 91 must
        // survive untouched — only a prefix BEYOND 10 digits is dropped.
        assertEquals("9198123456", AuthUtils.normalizeMobile("9198123456"))
    }

    @Test
    fun hashPin_isDeterministicSha256Hex() {
        val hash = AuthUtils.hashPin("1234")
        assertEquals(64, hash.length)
        assertTrue(hash.all { it in '0'..'9' || it in 'a'..'f' })
        assertEquals(hash, AuthUtils.hashPin("1234"))
        assertNotEquals(hash, AuthUtils.hashPin("4321"))
        // The hash must never contain the PIN itself.
        assertTrue(!hash.contains("1234"))
    }

    @Test
    fun maskMobile_showsLastFourOnly() {
        assertEquals("••••••5670", AuthUtils.maskMobile("9812345670"))
        assertEquals("", AuthUtils.maskMobile(""))
        assertEquals("", AuthUtils.maskMobile("98123"))
    }
}
