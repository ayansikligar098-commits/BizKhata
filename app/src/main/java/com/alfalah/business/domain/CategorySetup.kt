package com.alfalah.business.domain

/**
 * Ready-made setup for one business category. When a shopkeeper picks a
 * category at signup, the app applies this setup: which modules appear,
 * which income/expense categories exist, and which services are offered.
 * The owner can add services, categories and fields afterwards
 * (Customization — per business profile, never affecting other profiles).
 *
 * CSC is built fully first. The other categories below ship with their
 * ready-made setup (modules + categories); their specialised screens are
 * built on the same generic Job / Transaction / Khata engine, so no
 * category ever needs a second accounting engine.
 */
data class CategorySetup(
    val category: BusinessCategory,
    /** Route ids of the modules shown for this category. */
    val modules: List<String>,
    val services: List<ServiceType>,
    val incomeCategories: List<String>,
    val expenseCategories: List<String>,
    val dashboardCards: List<String>
)

object CategorySetups {

    private val commonExpenses = listOf(
        "Electricity", "Internet", "Rent", "Staff Expenses", "Transport", "Other Expenses"
    )

    /** The CSC / Cyber Cafe setup — the fully built v1 core. */
    val csc = CategorySetup(
        category = BusinessCategory.CSC,
        modules = listOf(
            "dashboard", "cash_book", "upi_book", "money_transfer",
            "pan", "aadhaar", "voter_id", "ayushman", "xerox", "printing",
            "smart_card", "passport_photo", "scanning", "document_work", "customers", "khata",
            "agents", "agent_payments", "expenses", "maintenance",
            "receipts", "daily_business", "reports", "difference_finder", "settings"
        ),
        services = listOf(
            ServiceType.PAN, ServiceType.AADHAAR, ServiceType.VOTER_ID,
            ServiceType.AYUSHMAN, ServiceType.XEROX, ServiceType.PRINTING,
            ServiceType.SMART_CARD, ServiceType.PASSPORT_PHOTO, ServiceType.SCANNING,
            ServiceType.DOCUMENT_WORK, ServiceType.MONEY_TRANSFER
        ),
        incomeCategories = listOf(
            "PAN Card", "Aadhaar Services", "Voter ID", "Ayushman Card",
            "Xerox", "Printing", "Smart Card", "Passport Size Photo", "Scanning",
            "Document Work",
            "Money Transfer Commission", "Other Services"
        ),
        expenseCategories = listOf(
            "Machine Repair", "Printer Repair", "Servicing", "Ink", "Toner",
            "Cartridge", "Paper", "Printhead", "Spare Parts"
        ) + commonExpenses,
        dashboardCards = listOf(
            "today_income", "today_expenses", "net_profit", "cash_balance",
            "upi_balance", "customer_due", "agent_payable", "service_income",
            "recent_transactions", "daily_summary", "cash_vs_upi"
        )
    )

    val mobileShop = CategorySetup(
        category = BusinessCategory.MOBILE_SHOP,
        modules = listOf(
            "dashboard", "cash_book", "upi_book", "customers", "khata",
            "expenses", "receipts", "daily_business", "reports", "settings"
        ),
        services = listOf(ServiceType.OTHER),
        incomeCategories = listOf(
            "Mobile Sales", "Mobile Repair", "Accessories",
            "Recharge", "Other Services"
        ),
        expenseCategories = listOf(
            "Purchases", "Spare Parts", "Accessories Stock"
        ) + commonExpenses,
        dashboardCards = listOf(
            "today_income", "today_expenses", "net_profit", "cash_balance",
            "upi_balance", "customer_due", "recent_transactions", "daily_summary"
        )
    )

    val grocery = CategorySetup(
        category = BusinessCategory.GROCERY,
        modules = listOf(
            "dashboard", "cash_book", "upi_book", "customers", "khata",
            "expenses", "receipts", "daily_business", "reports", "settings"
        ),
        services = listOf(ServiceType.OTHER),
        incomeCategories = listOf("Sales", "Other Income"),
        expenseCategories = listOf(
            "Purchases", "Stock", "Wastage"
        ) + commonExpenses,
        dashboardCards = listOf(
            "today_income", "today_expenses", "net_profit", "cash_balance",
            "upi_balance", "customer_due", "recent_transactions", "daily_summary"
        )
    )

    val printingShop = CategorySetup(
        category = BusinessCategory.PRINTING_SHOP,
        modules = listOf(
            "dashboard", "cash_book", "upi_book", "xerox", "printing",
            "customers", "khata", "expenses", "maintenance", "receipts",
            "daily_business", "reports", "settings"
        ),
        services = listOf(ServiceType.XEROX, ServiceType.PRINTING, ServiceType.SMART_CARD, ServiceType.PASSPORT_PHOTO, ServiceType.SCANNING),
        incomeCategories = listOf("Xerox", "Printing", "Smart Card", "Passport Size Photo", "Scanning", "Other Services"),
        expenseCategories = listOf(
            "Machine Repair", "Printer Repair", "Servicing", "Ink", "Toner",
            "Cartridge", "Paper", "Printhead", "Spare Parts"
        ) + commonExpenses,
        dashboardCards = listOf(
            "today_income", "today_expenses", "net_profit", "cash_balance",
            "upi_balance", "customer_due", "service_income", "daily_summary"
        )
    )

    /** Generic ready-made setup used by every remaining category until its
     *  specialised setup is added. The owner can customise it freely. */
    fun generic(category: BusinessCategory) = CategorySetup(
        category = category,
        modules = listOf(
            "dashboard", "cash_book", "upi_book", "customers", "khata",
            "expenses", "receipts", "daily_business", "reports", "settings"
        ),
        services = listOf(ServiceType.OTHER),
        incomeCategories = listOf("Sales", "Services", "Other Income"),
        expenseCategories = listOf("Purchases", "Stock") + commonExpenses,
        dashboardCards = listOf(
            "today_income", "today_expenses", "net_profit", "cash_balance",
            "upi_balance", "customer_due", "recent_transactions", "daily_summary"
        )
    )

    fun forCategory(category: BusinessCategory): CategorySetup = when (category) {
        BusinessCategory.CSC -> csc
        BusinessCategory.MOBILE_SHOP -> mobileShop
        BusinessCategory.GROCERY -> grocery
        BusinessCategory.PRINTING_SHOP -> printingShop
        else -> generic(category)
    }

    val all: List<CategorySetup>
        get() = BusinessCategory.values().map { forCategory(it) }
}
