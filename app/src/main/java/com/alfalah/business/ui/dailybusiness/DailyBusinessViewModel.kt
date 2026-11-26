package com.alfalah.business.ui.dailybusiness

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.DailyBusiness
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** Periods on the Daily Business screen (same spans as Reports). */
enum class DailyBusinessPeriod(val label: String, val days: Long) {
    TODAY("Today", 1),
    WEEK("This Week", 7),
    MONTH("This Month", 30),
    YEAR("This Year", 365)
}

/** One row of the Combined Service Summary. */
data class ServiceCollection(
    val label: String,
    val amountPaise: Long,
    val count: Int
)

data class DailyBusinessState(
    val period: DailyBusinessPeriod = DailyBusinessPeriod.TODAY,
    /** The day the period ends on (default today). ‹ › moves it. */
    val selectedDay: Long = LocalDate.now(ZoneOffset.UTC).toEpochDay(),
    val fromDay: Long = LocalDate.now(ZoneOffset.UTC).toEpochDay(),
    val totals: AccountingEngine.DailyBusinessTotals = AccountingEngine.DailyBusinessTotals(),
    /** Combined Service Summary — every brief service first (₹0 if none),
     *  then the owner's custom services, then any other income category
     *  with entries in the period (PAN, Aadhaar, …). */
    val serviceWise: List<ServiceCollection> = emptyList(),
    /** Recent entries in the period, newest first (max 25). */
    val recentEntries: List<TransactionEntity> = emptyList(),
    /** MT principal in the period — tracked, NEVER income. */
    val moneyTransferPrincipalPaise: Long = 0,
    val moneyTransferCommissionPaise: Long = 0,
    /** Service filter: "All" or one category label. */
    val filterService: String = "All",
    val customServices: Set<String> = emptySet()
)

/**
 * Daily Business ViewModel. EVERY figure is derived from the single
 * source of truth — the `transactions` table the modules already write
 * (job payments, MT commission rows, cash-book entries, quick daily
 * entries) plus the `money_transfers` ledger for the MT principal /
 * commission split. Nothing is stored a second time for this screen,
 * so a module entry can never be counted twice here and a quick daily
 * entry can never be missed.
 *
 * Correctness notes (the double-count traps):
 *  - The MT commission already sits inside the INCOME rows, so it is
 *    subtracted once before the commission-based MT profit is added —
 *    otherwise the ₹50 commission on a ₹10,000 transfer would count twice.
 *  - Customer dues are never income rows, so they can never appear in
 *    the collection. Only money actually received is collected.
 *  - INTERNAL_TRANSFER rows are excluded: moving Cash ⇄ UPI is not
 *    income and not an expense.
 */
class DailyBusinessViewModel(
    private val profileId: Long,
    private val repository: BusinessRepository,
    settings: SettingsStore
) : ViewModel() {

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    private val _state = MutableStateFlow(DailyBusinessState(selectedDay = today, fromDay = today))
    val state: StateFlow<DailyBusinessState> = _state

    private val period = MutableStateFlow(DailyBusinessPeriod.TODAY)
    private val selectedDay = MutableStateFlow(today)
    private val filterService = MutableStateFlow("All")

    init {
        viewModelScope.launch {
            combine(
                repository.observeTransactions(profileId),
                repository.observeMoneyTransfers(profileId),
                settings.customServices,
                period,
                selectedDay,
                filterService
            ) { txs, transfers, customServices, selectedPeriod, day, filter ->
                DailyInputs(txs, transfers, customServices, selectedPeriod, day, filter)
            }.collect { input ->
                val fromDay = input.day - (input.period.days - 1)
                val periodTxs = input.txs.filter {
                    it.dateEpochDay in fromDay..input.day && it.kind != "INTERNAL_TRANSFER"
                }
                val income = periodTxs.filter { it.kind == "INCOME" }
                val expenses = periodTxs.filter { it.kind == "EXPENSE" }
                val mtPeriod = input.transfers.filter { it.dateEpochDay in fromDay..input.day }
                val mtCommission = mtPeriod.sumOf { it.commissionPaise }
                val mtCharges = mtPeriod.sumOf { it.chargesPaise }
                val mtProfit = AccountingEngine.moneyTransferProfit(mtCommission, mtCharges, 0)
                val mtCommissionInIncome =
                    income.filter { it.category == DailyBusiness.MONEY_TRANSFER_COMMISSION_LABEL }
                        .sumOf { it.amountPaise }
                val totals = AccountingEngine.computeDailyBusiness(
                    income = income.map { AccountingEngine.MoneyEntry(it.amountPaise, it.mode) },
                    expenses = expenses.map { AccountingEngine.MoneyEntry(it.amountPaise, it.mode) },
                    moneyTransferProfitPaise = mtProfit,
                    moneyTransferCommissionPaise = mtCommissionInIncome
                )
                val byService = income.groupBy { it.category }
                    .mapValues { (_, list) -> list.sumOf { it.amountPaise } to list.size }
                val orderedLabels = (DailyBusiness.summaryServiceLabels +
                    input.customServices.sorted() +
                    byService.keys.filter { it !in DailyBusiness.summaryServiceLabels && it !in input.customServices }
                        .sorted())
                    .distinct()
                val serviceWise = orderedLabels.map { label ->
                    val (amount, count) = byService[label] ?: (0L to 0)
                    ServiceCollection(label, amount, count)
                }
                val recent = periodTxs
                    .filter { input.filter == "All" || it.category == input.filter }
                    .sortedWith(
                        compareByDescending<TransactionEntity> { it.dateEpochDay }
                            .thenByDescending { it.createdAtEpochMs }
                    )
                    .take(25)
                _state.value = DailyBusinessState(
                    period = input.period,
                    selectedDay = input.day,
                    fromDay = fromDay,
                    totals = totals,
                    serviceWise = serviceWise,
                    recentEntries = recent,
                    moneyTransferPrincipalPaise = mtPeriod.sumOf { it.amountPaise },
                    moneyTransferCommissionPaise = mtCommission,
                    filterService = input.filter,
                    customServices = input.customServices
                )
            }
        }
    }

    fun selectPeriod(p: DailyBusinessPeriod) {
        period.value = p
    }

    /** Move the period's end day (‹ › on the screen). Never past today. */
    fun stepDay(deltaDays: Long) {
        val next = (selectedDay.value + deltaDays).coerceAtMost(today)
        selectedDay.value = next
    }

    fun goToday() {
        selectedDay.value = today
    }

    fun selectServiceFilter(label: String) {
        filterService.value = label
    }

    private data class DailyInputs(
        val txs: List<TransactionEntity>,
        val transfers: List<com.alfalah.business.data.entity.MoneyTransferEntity>,
        val customServices: Set<String>,
        val period: DailyBusinessPeriod,
        val day: Long,
        val filter: String
    )
}
