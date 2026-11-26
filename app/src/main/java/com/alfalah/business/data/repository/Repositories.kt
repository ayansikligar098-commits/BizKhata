package com.alfalah.business.data.repository

import com.alfalah.business.data.AppDatabase
import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.entity.AuditLogEntity
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.KhataEntryEntity
import com.alfalah.business.data.entity.MoneyTransferClosingEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.entity.ReceiptEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import kotlinx.coroutines.flow.Flow

/**
 * Repository layer (MVVM). ViewModels talk only to repositories, never to
 * DAOs directly. Every write runs inside a Room transaction where two
 * tables change together, so a payment can never update a job without also
 * writing its Khata entry (and vice versa) — the "never count a payment
 * twice" rule is enforced here, not in the UI.
 */
class BusinessRepository(private val db: AppDatabase) {
    private val profiles = db.businessProfileDao()
    private val jobs = db.serviceJobDao()
    private val khata = db.khataDao()
    private val txs = db.transactionDao()
    private val mt = db.moneyTransferDao()
    private val mtFund = db.moneyTransferFundDao()
    private val agents = db.agentDao()
    private val expenses = db.expenseDao()
    private val receipts = db.receiptDao()
    private val audit = db.auditLogDao()
    private val customers = db.customerDao()

    fun observeProfiles(): Flow<List<BusinessProfileEntity>> = profiles.observeAll()
    suspend fun addProfile(profile: BusinessProfileEntity): Long = profiles.insert(profile)

    fun jobsForService(profileId: Long, service: ServiceType) =
        jobs.observeByService(profileId, service)

    fun customersForService(profileId: Long, service: ServiceType) =
        customers.observeByService(profileId, service)

    /**
     * Record a payment received for a job. ONE database transaction:
     *   1. Khata entry (payment history)
     *   2. Job's amountReceived increases
     *   3. Cash/UPI book income entry — ONLY the received amount.
     *      The remaining due is never written to any cash/UPI balance.
     */
    suspend fun receivePayment(
        profileId: Long,
        job: ServiceJobEntity,
        amountPaise: Long,
        mode: PaymentMode,
        dayEpoch: Long
    ) {
        require(amountPaise > 0) { "Payment must be more than zero" }
        val due = AccountingEngine.customerDue(job.totalFeesPaise, job.amountReceivedPaise)
        require(amountPaise <= due) { "Payment (₹${amountPaise / 100}) is more than the due (₹${due / 100})" }
        db.runInTransaction {
            khata.insert(
                KhataEntryEntity(
                    profileId = profileId, jobId = job.id,
                    amountPaise = amountPaise, mode = mode, dateEpochDay = dayEpoch
                )
            )
            jobs.update(job.copy(amountReceivedPaise = job.amountReceivedPaise + amountPaise))
            txs.insert(
                TransactionEntity(
                    profileId = profileId, kind = "INCOME",
                    category = job.service.label, amountPaise = amountPaise,
                    mode = mode, dateEpochDay = dayEpoch,
                    description = "Payment for ${job.service.label} job #${job.id}",
                    relatedJobId = job.id
                )
            )
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "ServiceJob", entityId = job.id,
                    action = "EDITED",
                    oldValue = "received=${job.amountReceivedPaise}",
                    newValue = "received=${job.amountReceivedPaise + amountPaise}"
                )
            )
        }
    }

    /** Soft-delete a job (Recycle Bin). The row stays in the database
     *  and can be restored; financial data is never silently erased. */
    suspend fun deleteJob(profileId: Long, jobId: Long) {
        db.runInTransaction {
            jobs.softDelete(jobId)
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "ServiceJob", entityId = jobId,
                    action = "DELETED", oldValue = "ACTIVE", newValue = "DELETED"
                )
            )
        }
    }

    suspend fun restoreJob(jobId: Long) = jobs.restore(jobId)

    /** Add a new service job (customer + job in one step when the customer is new). */
    suspend fun addJob(profileId: Long, customer: CustomerEntity, job: ServiceJobEntity): Long {
        var jobId = 0L
        db.runInTransaction {
            val customerId = customers.insert(customer)
            jobId = jobs.insert(job.copy(customerId = customerId))
        }
        return jobId
    }

    /** Add an expense. Direct costs linked to a service stay linked (§13). */
    suspend fun addExpense(expense: ExpenseEntity) {
        db.runInTransaction {
            expenses.insert(expense)
            txs.insert(
                TransactionEntity(
                    profileId = expense.profileId, kind = "EXPENSE",
                    category = expense.category, amountPaise = expense.amountPaise,
                    mode = expense.mode, dateEpochDay = expense.dateEpochDay,
                    description = expense.description
                )
            )
        }
    }

    /** Record a Cash ⇄ UPI internal transfer. NOT income, NOT expense (§22 rule 10).
     *  One DB transaction writes both the transfer record and the two
     *  Cash/UPI book postings, so the record and the balances can never disagree. */
    suspend fun internalTransfer(
        profileId: Long,
        amountPaise: Long,
        from: PaymentMode,
        dayEpoch: Long
    ) {
        require(from == PaymentMode.CASH || from == PaymentMode.UPI)
        val to = if (from == PaymentMode.CASH) PaymentMode.UPI else PaymentMode.CASH
        db.runInTransaction {
            db.internalTransferDao().insert(
                InternalTransferEntity(
                    profileId = profileId, amountPaise = amountPaise,
                    fromMode = from, toMode = to, dateEpochDay = dayEpoch
                )
            )
            txs.insert(
                TransactionEntity(
                    profileId = profileId, kind = "INTERNAL_TRANSFER",
                    category = "Cash-UPI Transfer", amountPaise = amountPaise,
                    mode = from, dateEpochDay = dayEpoch,
                    description = "Internal transfer ${from.name} → ${to.name}"
                )
            )
        }
    }

    /**
     * Record a Money Transfer in its OWN ledger. The principal is stored
     * for tracking only; profit is commission-only (AccountingEngine).
     * The customer's payment also enters the Cash/UPI book as received
     * money — the transfer-out is a separate MT-ledger movement, never
     * shop income.
     */
    suspend fun addMoneyTransfer(transfer: MoneyTransferEntity) {
        db.runInTransaction {
            mt.insert(transfer)
            txs.insert(
                TransactionEntity(
                    profileId = transfer.profileId, kind = "INCOME",
                    category = "Money Transfer Commission",
                    amountPaise = transfer.commissionPaise,
                    mode = transfer.mode, dateEpochDay = transfer.dateEpochDay,
                    description = "MT commission ${transfer.transactionId}"
                )
            )
        }
    }

    suspend fun closeMoneyTransferDay(closing: MoneyTransferClosingEntity) =
        mt.insertClosing(closing)

    /** Fund received for Money Transfer (from ayan's brother, by UPI). */
    fun observeFunds(profileId: Long) = mtFund.observeAll(profileId)
    suspend fun addFund(fund: MoneyTransferFundEntity): Long = mtFund.insert(fund)
    suspend fun totalFundReceived(profileId: Long): Long = mtFund.totalFund(profileId)

    suspend fun addAgent(agent: AgentEntity): Long = agents.insert(agent)

    /** Assign an agent + their charges to a job. PAN is NEVER assignable
     *  to an agent — ayan does PAN himself; the guard lives here, not in
     *  the UI, so no screen can bypass it. */
    suspend fun setJobAgent(profileId: Long, job: ServiceJobEntity, agentId: Long, chargesPaise: Long) {
        require(job.service != ServiceType.PAN) { "PAN work is never assigned to an agent" }
        require(chargesPaise >= 0) { "Agent charges cannot be negative" }
        db.runInTransaction {
            jobs.update(job.copy(agentId = agentId, agentChargesPaise = chargesPaise))
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "ServiceJob", entityId = job.id,
                    action = "EDITED",
                    oldValue = "agent=${job.agentId} charges=${job.agentChargesPaise}",
                    newValue = "agent=$agentId charges=$chargesPaise"
                )
            )
        }
    }

    /** Change a job's status (New → In Progress → … → Delivered/Cancelled). */
    suspend fun updateJobStatus(profileId: Long, job: ServiceJobEntity, newStatus: com.alfalah.business.domain.JobStatus) {
        db.runInTransaction {
            jobs.update(job.copy(status = newStatus, updatedAtEpochMs = System.currentTimeMillis()))
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "ServiceJob", entityId = job.id,
                    action = "EDITED",
                    oldValue = "status=${job.status}", newValue = "status=$newStatus"
                )
            )
        }
    }

    /**
     * A direct Cash/UPI book entry (Cash Book FAB: "Add Income" / "Add
     * Expense"). Only INCOME or EXPENSE — internal Cash ⇄ UPI transfers
     * go through [internalTransfer] and are never income/expense.
     */
    suspend fun addCashBookEntry(
        profileId: Long,
        kind: String,
        category: String,
        amountPaise: Long,
        mode: PaymentMode,
        dayEpoch: Long,
        description: String = ""
    ) {
        require(kind == "INCOME" || kind == "EXPENSE") { "Cash book entries are income or expense only" }
        require(amountPaise > 0) { "Amount must be more than zero" }
        txs.insert(
            TransactionEntity(
                profileId = profileId, kind = kind, category = category,
                amountPaise = amountPaise, mode = mode,
                dateEpochDay = dayEpoch, description = description
            )
        )
    }

    /** Pay an agent. Agent payable is its own ledger — never netted with customer due. */
    suspend fun payAgent(payment: AgentPaymentEntity) {
        db.runInTransaction {
            agents.insertPayment(payment)
            txs.insert(
                TransactionEntity(
                    profileId = payment.profileId, kind = "EXPENSE",
                    category = "Agent Payment", amountPaise = payment.amountPaise,
                    mode = payment.mode, dateEpochDay = payment.dateEpochDay,
                    description = "Agent payment #${payment.agentId}"
                )
            )
        }
    }

    suspend fun addReceipt(receipt: ReceiptEntity): Long = receipts.insert(receipt)

    /** Total customer due for a profile = sum of (total fees − received)
     *  over all active jobs. Due is never counted as received cash. */
    suspend fun customerDue(profileId: Long): Long = jobs.totalCustomerDue(profileId)

    /** Total agent payable for a profile = total agent charges on active
     *  jobs − total payments made to agents. Separate ledger from customer due. */
    suspend fun agentPayable(profileId: Long): Long = agents.totalAgentPayable(profileId)

    fun observeReceipts(profileId: Long) = receipts.observeAll(profileId)
    fun observeTransactions(profileId: Long) = txs.observeAll(profileId)
    fun observeMoneyTransfers(profileId: Long) = mt.observeAll(profileId)
    fun observeAgents(profileId: Long) = agents.observeAll(profileId)
    fun observeExpenses(profileId: Long) = expenses.observeAll(profileId)
    fun observeEquipment(profileId: Long) = expenses.observeEquipment(profileId)
    fun observeAudit(profileId: Long) = audit.observeRecent(profileId)
    fun observeAllJobs(profileId: Long) = jobs.observeAll(profileId)
    fun observeDeletedJobs(profileId: Long) = jobs.observeDeleted(profileId)
    fun searchCustomers(profileId: Long, query: String) = customers.search(profileId, query)
    fun observeJobsByAgent(profileId: Long, agentId: Long) = jobs.observeByAgent(profileId, agentId)
    fun observeAgentPayments(agentId: Long) = agents.observePayments(agentId)
    fun observeJobsByCustomer(profileId: Long, customerId: Long) = jobs.observeByCustomer(profileId, customerId)
    fun observeKhataByProfile(profileId: Long) = khata.observeByProfile(profileId)
    fun observeKhataByJob(jobId: Long) = khata.observeByJob(jobId)
    fun observeDocumentsByCustomer(customerId: Long) = db.documentDao().observeByCustomer(customerId)
    suspend fun getCustomer(id: Long) = customers.getById(id)
    suspend fun getAgent(id: Long) = agents.getById(id)
    suspend fun getJob(id: Long) = jobs.getById(id)
    fun observeMaintenanceByEquipment(equipmentId: Long) = db.maintenanceDao().observeByEquipment(equipmentId)
    suspend fun lifetimeCost(equipmentId: Long): Long = db.maintenanceDao().lifetimeCost(equipmentId)
    suspend fun addMaintenance(maintenance: com.alfalah.business.data.entity.MaintenanceEntity) =
        db.maintenanceDao().insert(maintenance)

    suspend fun addEquipment(equipment: com.alfalah.business.data.entity.EquipmentEntity): Long =
        expenses.insertEquipment(equipment)

    /** Agent charges / payments per agent — used by the chatbot to list
     *  exactly who is owed what. Charges and payments stay separate. */
    suspend fun chargesForAgent(profileId: Long, agentId: Long): Long =
        agents.totalChargesForAgent(profileId, agentId)

    suspend fun paidToAgent(agentId: Long): Long = agents.totalPaidToAgent(agentId)
}
