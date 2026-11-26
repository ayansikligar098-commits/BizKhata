package com.alfalah.business.domain

/**
 * Daily Business (Daily Dhandha) — the central hub for the shop's mixed
 * daily work (brief 2026-11-26 22:04 IST). The owner does NOT want to open
 * a separate module for every small daily transaction, so this screen is
 * the one place for: Xerox, Money Transfer commission, Smart Card,
 * Passport Size Photo, Printing, Scanning, Document Work and Other
 * Services — plus anything the owner adds himself.
 *
 * SINGLE SOURCE OF TRUTH (rule E of the brief): Daily Business NEVER
 * keeps a second copy of a transaction. Every figure on the screen is
 * DERIVED from the same tables the modules write:
 *  - `transactions` (kind INCOME / EXPENSE) — job payments written by
 *    [com.alfalah.business.data.repository.BusinessRepository.receivePayment],
 *    MT commission written by `addMoneyTransfer`, cash-book entries and
 *    quick daily entries written by `addDailyEntry`. One real transaction
 *    = one row = visible in both its module and Daily Business.
 *  - `money_transfers` — the MT ledger itself, used only to show the
 *    principal separately and to compute commission-based profit.
 * A job created in a module therefore appears in Daily Business
 * automatically, with no extra write and no chance of double counting.
 * Money Transfer principal is NEVER an income row (only the commission
 * row is), and customer dues are never income rows — only money actually
 * received is.
 */
object DailyBusiness {

    /** The category label of the Money Transfer commission income row.
     *  This exact string is what the repository writes for MT commission
     *  (see BusinessRepository.addMoneyTransfer) and what Daily Business,
     *  Reports and the Dashboard group on — one constant, one spelling. */
    const val MONEY_TRANSFER_COMMISSION_LABEL = "Money Transfer Commission"

    /**
     * Services offered as categories in the Quick Daily Entry form.
     * Money Transfer is deliberately NOT here: MT money must go through
     * the Money Transfer module (principal is never income, only the
     * commission is) — its commission still appears in the summary below.
     * PAN / Aadhaar / Voter ID / Ayushman keep their own job modules with
     * customer records; their received payments appear in the summary
     * automatically via their income rows.
     */
    val quickEntryServices: List<ServiceType> = listOf(
        ServiceType.XEROX,
        ServiceType.PRINTING,
        ServiceType.SMART_CARD,
        ServiceType.PASSPORT_PHOTO,
        ServiceType.SCANNING,
        ServiceType.DOCUMENT_WORK,
        ServiceType.OTHER
    )

    /**
     * Every service shown in the Combined Service Summary, in brief order.
     * Each row always shows — ₹0 when nothing was recorded — so the owner
     * can see at a glance which services earned today and which did not.
     * Any other income category with entries in the period (PAN, Aadhaar,
     * Voter ID, Ayushman, a custom service) is appended after these.
     */
    val summaryServiceLabels: List<String> = listOf(
        ServiceType.XEROX.label,
        MONEY_TRANSFER_COMMISSION_LABEL,
        ServiceType.SMART_CARD.label,
        ServiceType.PASSPORT_PHOTO.label,
        ServiceType.PRINTING.label,
        ServiceType.SCANNING.label,
        ServiceType.DOCUMENT_WORK.label,
        ServiceType.OTHER.label
    )
}
