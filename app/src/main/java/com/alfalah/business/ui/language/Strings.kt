package com.alfalah.business.ui.language

import com.alfalah.business.domain.AppLanguage

/**
 * UI strings in English and Hinglish. English is the default and must stay
 * proper, simple English — labels a person with little English can understand.
 * Hinglish uses natural Hindi-English combinations.
 * (Hindi is a Section 28 / Record B discussion item — not in v1.)
 *
 * Every label in the app comes from here, never hard-coded in a screen,
 * so the whole app changes language from one place.
 */
object Strings {

    private val en = mapOf(
        "app_name" to "BizKhata",
        "dashboard" to "Dashboard",
        "today_income" to "Today's Income",
        "today_expenses" to "Today's Expenses",
        "net_profit" to "Net Profit",
        "cash_balance" to "Cash Balance",
        "upi_balance" to "UPI Balance",
        "customer_due" to "Customer Due",
        "agent_payable" to "Agent Payable",
        "cash_book" to "Cash Book",
        "upi_book" to "UPI Book",
        "money_transfer" to "Money Transfer",
        "customers" to "Customers",
        "customer_khata" to "Customer Khata",
        "agents" to "Agents",
        "expenses" to "Expenses",
        "receipts" to "Receipts",
        "daily_business" to "Daily Business",
        "reports" to "Reports",
        "difference_finder" to "Difference Finder",
        "settings" to "Settings",
        "add" to "Add",
        "edit" to "Edit",
        "delete" to "Delete",
        "payment_received" to "Payment Received",
        "payment_remaining" to "Payment Remaining",
        "total_income" to "Total Income",
        "total_expenses" to "Total Expenses",
        "check_balance" to "Check Balance",
        "search" to "Search",
        "save" to "Save",
        "cancel" to "Cancel"
    )

    private val hinglish = mapOf(
        "app_name" to "BizKhata",
        "dashboard" to "Dashboard",
        "today_income" to "Aaj Ki Kamai",
        "today_expenses" to "Aaj Ka Kharcha",
        "net_profit" to "Net Profit",
        "cash_balance" to "Cash Balance",
        "upi_balance" to "UPI Balance",
        "customer_due" to "Customer Se Lena Baki",
        "agent_payable" to "Agent Ko Dena Baki",
        "cash_book" to "Cash Book",
        "upi_book" to "UPI Book",
        "money_transfer" to "Money Transfer",
        "customers" to "Customers",
        "customer_khata" to "Customer Khata",
        "agents" to "Agents",
        "expenses" to "Kharcha",
        "receipts" to "Receipt",
        "daily_business" to "Daily Dhandha",
        "reports" to "Reports",
        "difference_finder" to "Difference Finder",
        "settings" to "Settings",
        "add" to "Add Karo",
        "edit" to "Edit Karo",
        "delete" to "Delete Karo",
        "payment_received" to "Payment Mila",
        "payment_remaining" to "Payment Baki",
        "total_income" to "Total Income",
        "total_expenses" to "Total Kharcha",
        "check_balance" to "Balance Dekho",
        "search" to "Search Karo",
        "save" to "Save Karo",
        "cancel" to "Cancel Karo"
    )

    private val hindi = mapOf(
        "app_name" to "BizKhata",
        "dashboard" to "डैशबोर्ड",
        "today_income" to "आज की कमाई",
        "today_expenses" to "आज का खर्चा",
        "net_profit" to "शुद्ध लाभ",
        "cash_balance" to "नकद बैलेंस",
        "upi_balance" to "UPI बैलेंस",
        "customer_due" to "ग्राहक से लेना बाकी",
        "agent_payable" to "एजेंट को देना बाकी",
        "cash_book" to "कैश बुक",
        "upi_book" to "UPI बुक",
        "money_transfer" to "मनी ट्रांसफर",
        "customers" to "ग्राहक",
        "customer_khata" to "ग्राहक खाता",
        "agents" to "एजेंट",
        "expenses" to "खर्चा",
        "receipts" to "रसीद",
        "daily_business" to "दैनिक धंधा",
        "reports" to "रिपोर्ट",
        "difference_finder" to "हिसाब अंतर खोजें",
        "settings" to "सेटिंग्स",
        "add" to "जोड़ें",
        "edit" to "बदलें",
        "delete" to "हटाएं",
        "payment_received" to "भुगतान मिला",
        "payment_remaining" to "भुगतान बाकी",
        "total_income" to "कुल आय",
        "total_expenses" to "कुल खर्चा",
        "check_balance" to "बैलेंस देखें",
        "search" to "खोजें",
        "save" to "सहेजें",
        "cancel" to "रद्द करें"
    )

    fun get(key: String, language: AppLanguage): String =
        when (language) {
            AppLanguage.ENGLISH -> en[key] ?: key
            AppLanguage.HINDI -> hindi[key] ?: en[key] ?: key
            AppLanguage.HINGLISH -> hinglish[key] ?: en[key] ?: key
        }
}
