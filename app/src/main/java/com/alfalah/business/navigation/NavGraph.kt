package com.alfalah.business.navigation

/** One route per module — no crowded single screen (Record A §7).
 *  Service screens take the service as an argument, so PAN, Aadhaar,
 *  Voter ID, Ayushman, Xerox, Printing, Smart Card and Document Work each
 *  have their own page and their own customer list. */
object Routes {
    const val LANGUAGE = "language"
    const val DASHBOARD = "dashboard"
    const val CASH_BOOK = "cash_book"
    const val UPI_BOOK = "upi_book"
    const val MONEY_TRANSFER = "money_transfer"
    const val SERVICE = "service/{service}"          // e.g. service/PAN
    const val CUSTOMER_DETAIL = "customer/{customerId}"
    const val KHATA = "khata"
    const val AGENTS = "agents"
    const val AGENT_DETAIL = "agent/{agentId}"
    const val EXPENSES = "expenses"
    const val MAINTENANCE = "maintenance"
    const val RECEIPTS = "receipts"
    const val DAILY_BUSINESS = "daily_business"
    const val REPORTS = "reports"
    const val DIFFERENCE_FINDER = "difference_finder"
    const val SETTINGS = "settings"
    const val CATEGORY_PICK = "category_pick"

    fun service(service: String) = "service/$service"
    fun customerDetail(customerId: Long) = "customer/$customerId"
    fun agentDetail(agentId: Long) = "agent/$agentId"
}
