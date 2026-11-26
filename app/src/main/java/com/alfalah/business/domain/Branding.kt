package com.alfalah.business.domain

/**
 * THE single place the app name lives. Change it here and it changes
 * everywhere: app label (via strings.xml), dashboard header, business
 * profile, receipts and Settings.
 *
 * CONFIRMED by ayan on 2026-11-26: the app name is "BizKhata".
 * The business profile inside the app is a different thing — it stays
 * "Al Falah Communication — CSC Center" (that is the shop's name, not the
 * app name). Do NOT use "Al Falah Business" as the app name anywhere.
 */
object Branding {
    /** Confirmed app name. */
    const val APP_NAME = "BizKhata"

    /** Display name of the owner's own shop (this is a business name, not the app name). */
    const val OWNER_BUSINESS_NAME = "Al Falah Communication"
    const val OWNER_BUSINESS_TYPE = "CSC Center"

    const val APP_NAME_PENDING_CONFIRMATION = false
}
