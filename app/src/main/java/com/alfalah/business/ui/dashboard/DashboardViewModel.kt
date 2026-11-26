package com.alfalah.business.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.data.repository.BusinessRepository
import com.alfalah.business.domain.AccountingEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset

/** Periods on the Dashboard pills (reference screen 1). */
enum class DashboardPeriod(val label: String, val days: Long) {
    TODAY("Today", 1),
    WEEK("Week", 7),
    MONTH("Month", 30),
    YEAR("Year", 365)
}

/**
 * Dashboard totals, derived ONLY from recorded entries — never typed by hand.
 * Billing, received, due, balance and profit are kept as separate figures.
 * [todayIncomePaise] etc. always describe the SELECTED period; the Cash/UPI
 * balances, Customer Due and Agent Payable are all-time (they are balances,
 * not period totals) and never change with the period pill.
 */
data class DashboardState(
    val todayIncomePaise: Long = 0,
    val todayExpensesPaise: Long = 0,
    val netProfitPaise: Long = 0,
    val cashBalancePaise: Long = 0,
    val upiBalancePaise: Long = 0,
    val customerDuePaise: Long = 0,
    val agentPayablePaise: Long = 0,
    val moneyTransferProfitPaise: Long = 0,
    val todayMoneyTransferPrincipalPaise: Long = 0, // shown for tracking, NEVER profit
    /** Service-wise received income in the selected period (donut chart). */
    val serviceIncomePaise: Map<String, Long> = emptyMap(),
    val recentTransactions: List<TransactionEntity> = emptyList()
)

class DashboardViewModel(
    private val profileId: Long,
    private val repository: BusinessRepository
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state

    /** The selected period pill; the screen writes it, the totals recompute. */
    val period = MutableStateFlow(DashboardPeriod.TODAY)

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    init {
        viewModelScope.launch {
            combine(
                repository.observeTransactions(profileId),
                repository.observeMoneyTransfers(profileId),
                repository.observeAgents(profileId),
                period
            ) { txs, transfers, _, selected -> Quad(txs, transfers, selected) }
                .collect { (txs, transfers, selected) ->
                    val fromDay = today - (selected.days - 1)
                    val periodTxs = txs.filter { it.dateEpochDay in fromDay..today && it.kind != "INTERNAL_TRANSFER" }
                    val income = periodTxs.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
                    val expenses = periodTxs.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }

                    // Cash / UPI balances (all time): opening 0 in v1 (opening
                    // balances are entered in Settings; see README). Derived
                    // from the books, internal transfers netted correctly.
                    val cashIn = txs.filter { it.mode.name == "CASH" && it.kind == "INCOME" }.sumOf { it.amountPaise }
                    val cashOut = txs.filter { it.mode.name == "CASH" && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
                    val upiIn = txs.filter { it.mode.name == "UPI" && it.kind == "INCOME" }.sumOf { it.amountPaise }
                    val upiOut = txs.filter { it.mode.name == "UPI" && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
                    val cashToUpi = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode.name == "CASH" }.sumOf { it.amountPaise }
                    val upiToCash = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode.name == "UPI" }.sumOf { it.amountPaise }

                    val mtPeriod = transfers.filter { it.dateEpochDay in fromDay..today }
                    val mtProfit = AccountingEngine.moneyTransferProfit(
                        commissionPaise = mtPeriod.sumOf { it.commissionPaise },
                        transferChargesPaise = mtPeriod.sumOf { it.chargesPaise },
                        moneyTransferExpensesPaise = 0
                    )
                    val mtPrincipal = mtPeriod.sumOf { it.amountPaise }

                    // Service-wise received income for the donut. MT commission
                    // is its own slice (labelled as commission, never principal).
                    val byService = periodTxs.filter { it.kind == "INCOME" }
                        .groupBy { it.category }
                        .mapValues { (_, list) -> list.sumOf { it.amountPaise } }
                        .toList().sortedByDescending { it.second }.take(6).toMap()

                    // Customer Due and Agent Payable come from their own ledgers.
                    val due = repository.customerDue(profileId)
                    val payable = repository.agentPayable(profileId)
                    _state.value = DashboardState(
                        todayIncomePaise = income + mtPeriod.sumOf { it.commissionPaise },
                        todayExpensesPaise = expenses,
                        netProfitPaise = AccountingEngine.netProfit(income, mtProfit, expenses),
                        cashBalancePaise = cashIn - cashOut - cashToUpi + upiToCash,
                        upiBalancePaise = upiIn - upiOut + cashToUpi - upiToCash,
                        customerDuePaise = due,
                        agentPayablePaise = payable,
                        moneyTransferProfitPaise = mtProfit,
                        todayMoneyTransferPrincipalPaise = mtPrincipal,
                        serviceIncomePaise = byService,
                        recentTransactions = txs.take(10)
                    )
                }
        }
    }

    fun selectPeriod(p: DashboardPeriod) {
        period.value = p
    }

    private data class Quad(
        val txs: List<com.alfalah.business.data.entity.TransactionEntity>,
        val transfers: List<com.alfalah.business.data.entity.MoneyTransferEntity>,
        val selected: DashboardPeriod
    )
}
