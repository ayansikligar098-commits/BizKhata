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

/** Dashboard totals, derived ONLY from recorded entries — never typed by hand.
 *  Billing, received, due, balance and profit are kept as separate figures. */
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
    val recentTransactions: List<TransactionEntity> = emptyList()
)

class DashboardViewModel(
    private val profileId: Long,
    private val repository: BusinessRepository
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()

    init {
        viewModelScope.launch {
            combine(
                repository.observeTransactions(profileId),
                repository.observeMoneyTransfers(profileId),
                repository.observeAgents(profileId)
            ) { txs, transfers, _ -> Triple(txs, transfers, Unit) }.collect { (txs, transfers, _) ->
                val todayTxs = txs.filter { it.dateEpochDay == today && it.kind != "INTERNAL_TRANSFER" }
                val income = todayTxs.filter { it.kind == "INCOME" }.sumOf { it.amountPaise }
                val expenses = todayTxs.filter { it.kind == "EXPENSE" }.sumOf { it.amountPaise }

                // Cash / UPI balances: opening 0 in v1 (opening balances are
                // entered in Settings; see README). Derived from the books.
                val cashIn = txs.filter { it.mode.name == "CASH" && it.kind == "INCOME" }.sumOf { it.amountPaise }
                val cashOut = txs.filter { it.mode.name == "CASH" && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
                val upiIn = txs.filter { it.mode.name == "UPI" && it.kind == "INCOME" }.sumOf { it.amountPaise }
                val upiOut = txs.filter { it.mode.name == "UPI" && it.kind == "EXPENSE" }.sumOf { it.amountPaise }
                // Internal transfers move money between accounts, net zero overall.
                val cashToUpi = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode.name == "CASH" }.sumOf { it.amountPaise }
                val upiToCash = txs.filter { it.kind == "INTERNAL_TRANSFER" && it.mode.name == "UPI" }.sumOf { it.amountPaise }

                val mtToday = transfers.filter { it.dateEpochDay == today }
                val mtProfit = AccountingEngine.moneyTransferProfit(
                    commissionPaise = mtToday.sumOf { it.commissionPaise },
                    transferChargesPaise = mtToday.sumOf { it.chargesPaise },
                    moneyTransferExpensesPaise = 0
                )
                val mtPrincipal = mtToday.sumOf { it.amountPaise }

                // Customer Due and Agent Payable come from their own ledgers,
                // read here (collect is a suspend context) so they refresh
                // whenever the underlying data changes.
                val due = repository.customerDue(profileId)
                val payable = repository.agentPayable(profileId)
                _state.value = DashboardState(
                    todayIncomePaise = income + mtToday.sumOf { it.commissionPaise },
                    todayExpensesPaise = expenses,
                    netProfitPaise = AccountingEngine.netProfit(income, mtProfit, expenses),
                    cashBalancePaise = cashIn - cashOut - cashToUpi + upiToCash,
                    upiBalancePaise = upiIn - upiOut + cashToUpi - upiToCash,
                    customerDuePaise = due,
                    agentPayablePaise = payable,
                    moneyTransferProfitPaise = mtProfit,
                    todayMoneyTransferPrincipalPaise = mtPrincipal,
                    recentTransactions = txs.take(10)
                )
            }
        }
    }
}
