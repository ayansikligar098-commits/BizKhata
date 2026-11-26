package com.alfalah.business.data.repository

import com.alfalah.business.data.AppDatabase
import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.entity.AuditLogEntity
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.InternalTransferEntity
import com.alfalah.business.data.entity.KhataEntryEntity
import com.alfalah.business.data.entity.MoneyTransferClosingEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.entity.ReceiptEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.domain.AccountingEngine
import com.alfalah.business.domain.AiAssistantParser
import com.alfalah.business.domain.DailyBusiness
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

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

    /**
     * Quick Daily Entry (Daily Business hub). ONE database transaction
     * writes exactly ONE income row for the entry — the same
     * `transactions` table the service modules write to, with the service
     * category as its category and no linked job (relatedJobId = null:
     * this is a walk-in daily sale, not a customer job). Because Daily
     * Business DERIVES its totals from `transactions`, the entry shows up
     * there automatically — no second copy is ever written, so it can
     * never be counted twice.
     *
     * A direct expense on the same entry (e.g. paper bought for that
     * printing job) is written in the SAME transaction as an Expense row
     * + its one EXPENSE book row — exactly as [addExpense] does — so the
     * expense appears once in Daily Business expenses and once in the
     * Expenses module, and the income and the expense can never disagree.
     * The expense is paid from the same Cash/UPI account as the entry.
     */
    suspend fun addDailyEntry(
        profileId: Long,
        service: ServiceType?,
        serviceLabel: String,
        description: String,
        quantity: Long,
        ratePaise: Long,
        totalPaise: Long,
        mode: PaymentMode,
        dayEpoch: Long,
        createdAtEpochMs: Long,
        directExpensePaise: Long,
        notes: String
    ) {
        require(serviceLabel.isNotBlank()) { "Choose a service category." }
        require(quantity >= 1) { "Quantity must be at least 1." }
        require(ratePaise >= 0) { "Rate cannot be negative." }
        require(totalPaise > 0) { "Total amount must be more than zero." }
        require(directExpensePaise >= 0) { "Direct expense cannot be negative." }
        // No cap on the expense vs the total: a job can legitimately cost
        // more than it earned (a loss shows up as negative net earnings).
        val detail = buildString {
            append(description.trim())
            append(" — Qty $quantity @ ${rupeesText(ratePaise)}")
            if (notes.isNotBlank()) append(" — ${notes.trim()}")
        }
        db.runInTransaction {
            val txId = txs.insert(
                TransactionEntity(
                    profileId = profileId, kind = "INCOME",
                    category = serviceLabel.trim(), amountPaise = totalPaise,
                    mode = mode, dateEpochDay = dayEpoch,
                    description = detail, relatedJobId = null,
                    createdAtEpochMs = createdAtEpochMs
                )
            )
            if (directExpensePaise > 0) {
                expenses.insert(
                    ExpenseEntity(
                        profileId = profileId, category = "Direct Expense",
                        service = service, description = "Direct expense for $serviceLabel: ${description.trim()}",
                        amountPaise = directExpensePaise, mode = mode,
                        dateEpochDay = dayEpoch, note = notes.trim()
                    )
                )
                txs.insert(
                    TransactionEntity(
                        profileId = profileId, kind = "EXPENSE",
                        category = "Direct Expense", amountPaise = directExpensePaise,
                        mode = mode, dateEpochDay = dayEpoch,
                        description = "Direct expense for $serviceLabel: ${description.trim()}",
                        createdAtEpochMs = createdAtEpochMs
                    )
                )
            }
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "Transaction", entityId = txId,
                    action = "CREATED",
                    newValue = "Daily entry $serviceLabel ${rupeesText(totalPaise)} ${mode.name}"
                )
            )
        }
    }

    /** Paise → "₹12.50" / "₹12" text for stored descriptions (integer maths only). */
    private fun rupeesText(amountPaise: Long): String {
        val rupees = amountPaise / 100
        val paise = amountPaise % 100
        return if (paise == 0L) "₹$rupees" else "₹$rupees.${paise.toString().padStart(2, '0')}"
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
                    category = DailyBusiness.MONEY_TRANSFER_COMMISSION_LABEL,
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
    fun observeAllMaintenance(profileId: Long) = db.maintenanceDao().observeAll(profileId)
    fun observeAllAgentPayments(profileId: Long) = agents.observeAllPayments(profileId)
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

    // ------------------------------------------------------------------
    // AI BUSINESS ASSISTANT — controlled action execution (UPDATE 9 §13,
    // UPDATE 11 §§3–5, §12). The AI NEVER writes to the database itself:
    // it produces a structured [AiAssistantParser.AiAction], the user
    // confirms it, and ONLY then does this executor run it — through the
    // same validated repository methods the screens use, in ONE Room
    // transaction, with an audit row carrying the idempotency key.
    //
    // 12 steps, enforced here: understand → structured request (parser)
    // → validate (require()s + ledger checks below) → authorisation is
    // the signed-in owner (local-first, single-owner app) → profile is
    // checked on EVERY write (profileId is a parameter, never inferred)
    // → existing records checked (due/payable caps, agent/customer
    // resolution) → preview (built by the ViewModel from the same action)
    // → confirmation (ViewModel, before this is called) → execute here
    // → verify (the returned ids / counts) → accurate response (the
    // ViewModel reports only [AiExecuteResult], never a guess).
    //
    // IDEMPOTENCY: before writing, the audit log is checked for the key.
    // If it is already there the action was executed — the call returns
    // [AiExecuteResult.Duplicate] and writes NOTHING. A retry, a double
    // tap or a network retry therefore cannot duplicate a transaction.
    // ------------------------------------------------------------------
    sealed interface AiExecuteResult {
        /** Backend confirmed the write. [message] states what was saved. */
        data class Saved(val message: String, val ids: List<Long> = emptyList()) : AiExecuteResult
        /** Already executed under this key — nothing written this time. */
        data class Duplicate(val message: String) : AiExecuteResult
        /** Validation or DB failure — NOTHING was written (the Room
         *  transaction rolled back). The message is user-friendly, never
         *  a stack trace or an internal code. */
        data class Failed(val message: String) : AiExecuteResult
    }

    /** Execute one confirmed AI action. Never call this without the
     *  user having confirmed the preview (ViewModel enforces that). */
    suspend fun executeAiAction(
        profileId: Long,
        action: AiAssistantParser.AiAction,
        idempotencyKey: String
    ): AiExecuteResult {
        return try {
            when (action) {
                is AiAssistantParser.AiAction.DailyEntries -> executeAiDailyEntries(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.Expense -> executeAiExpense(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.AgentPayment -> executeAiAgentPayment(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.MoneyTransfer -> executeAiMoneyTransfer(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.InternalTransfer -> executeAiInternalTransfer(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.CustomerPayment -> executeAiCustomerPayment(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.RecordCustomerDue -> executeAiCustomerDue(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.DeleteTransaction -> executeAiDeleteTransaction(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.CorrectTransaction -> executeAiCorrectTransaction(profileId, action, idempotencyKey)
                is AiAssistantParser.AiAction.AddCustomer -> executeAiAddCustomer(profileId, action, idempotencyKey)
            }
        } catch (e: IllegalArgumentException) {
            AiExecuteResult.Failed(e.message ?: "Ye entry save nahi ho payi — details check karein.")
        } catch (e: Exception) {
            AiExecuteResult.Failed("Save nahi ho paya — phir se try karein. Kuch bhi galat save nahi hua hai.")
        }
    }

    private suspend fun alreadyExecuted(profileId: Long, key: String): Boolean =
        audit.countWithKey(profileId, key) > 0

    private suspend fun markExecuted(profileId: Long, key: String, summary: String) {
        audit.insert(
            AuditLogEntity(
                profileId = profileId, entityType = "AiAction", entityId = 0,
                action = "CREATED", newValue = "AI key=$key $summary"
            )
        )
    }

    /** Daily entries via the Daily Business seam [addDailyEntry] — ONE
     *  income row per entry in the `transactions` table (UPDATE 11 §1).
     *  Daily Business, Cash/UPI Book, service reports and Dashboard all
     *  DERIVE from those rows, so the entry appears everywhere at once
     *  and can never be counted twice. */
    private suspend fun executeAiDailyEntries(
        profileId: Long,
        action: AiAssistantParser.AiAction.DailyEntries,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye entries pehle hi save ho chuki hain — dobara save nahi ki gayi.")
        }
        val ids = mutableListOf<Long>()
        db.runInTransaction {
            action.entries.forEach { entry ->
                addDailyEntry(
                    profileId = profileId,
                    service = entry.service,
                    serviceLabel = entry.serviceLabel,
                    description = entry.serviceLabel,
                    quantity = 1,
                    ratePaise = entry.amountPaise,
                    totalPaise = entry.amountPaise,
                    mode = entry.mode,
                    dayEpoch = action.dayEpoch,
                    createdAtEpochMs = System.currentTimeMillis(),
                    directExpensePaise = 0,
                    notes = "AI Assistant se add ki gayi"
                )
            }
            markExecuted(profileId, key, "daily entries total=${action.entries.sumOf { it.amountPaise }}")
        }
        // Verify: re-read the rows just written (the backend result, not a guess).
        val savedToday = txs.search(profileId, "AI Assistant")
            .filter { it.dateEpochDay == action.dayEpoch && it.kind == "INCOME" }
        ids.addAll(savedToday.map { it.id })
        return AiExecuteResult.Saved(
            "Save ho gaya: ${action.entries.joinToString(", ") { "${it.serviceLabel} ${rupeesText(it.amountPaise)} (${it.mode.name})" }}. " +
                "Total ${rupeesText(action.entries.sumOf { it.amountPaise })}. " +
                "Daily Business, Cash/UPI Book aur Dashboard me dikhne laga hai.",
            ids = savedToday.map { it.id }
        )
    }

    private suspend fun executeAiExpense(
        profileId: Long,
        action: AiAssistantParser.AiAction.Expense,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye kharcha pehle hi save ho chuka hai — dobara save nahi kiya gaya.")
        }
        val mode = action.draft.mode ?: return AiExecuteResult.Failed("Kharcha Cash se hua ya UPI se — mode bataye bina save nahi kar sakta.")
        db.runInTransaction {
            addExpense(
                ExpenseEntity(
                    profileId = profileId, category = action.draft.category,
                    service = action.draft.service, description = action.draft.description,
                    amountPaise = action.draft.amountPaise, mode = mode,
                    dateEpochDay = action.dayEpoch, note = "AI Assistant se add kiya gaya"
                )
            )
            markExecuted(profileId, key, "expense ${action.draft.category} ${action.draft.amountPaise}")
        }
        return AiExecuteResult.Saved(
            "Kharcha save ho gaya: ${action.draft.category} — ${rupeesText(action.draft.amountPaise)} (${mode.name}). " +
                "Expenses aur Daily Business me dikhne laga hai."
        )
    }

    private suspend fun executeAiAgentPayment(
        profileId: Long,
        action: AiAssistantParser.AiAction.AgentPayment,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye agent payment pehle hi save ho chuka hai — dobara save nahi kiya gaya.")
        }
        val agent = findAgentByName(profileId, action.agentName)
            ?: return AiExecuteResult.Failed("Agent \"${action.agentName}\" nahi mila — pehle Agents page se agent add karein.")
        val mode = action.mode ?: return AiExecuteResult.Failed("Agent ko Cash se diye ya UPI se — mode bataye bina save nahi kar sakta.")
        val payable = AccountingEngine.agentPayable(chargesForAgent(profileId, agent.id), paidToAgent(agent.id))
        if (action.amountPaise > payable) {
            return AiExecuteResult.Failed(
                "${agent.name} ko sirf ${rupeesText(payable)} dena baaki hai — " +
                    "${rupeesText(action.amountPaise)} usse zyada hai, isliye payment save nahi ki gayi."
            )
        }
        db.runInTransaction {
            payAgent(
                AgentPaymentEntity(
                    profileId = profileId, agentId = agent.id, amountPaise = action.amountPaise,
                    mode = mode, dateEpochDay = action.dayEpoch, note = "AI Assistant se add kiya gaya"
                )
            )
            markExecuted(profileId, key, "agent payment ${agent.id} ${action.amountPaise}")
        }
        val remaining = AccountingEngine.agentPayable(chargesForAgent(profileId, agent.id), paidToAgent(agent.id))
        return AiExecuteResult.Saved(
            "Agent payment save ho gaya: ${agent.name} ko ${rupeesText(action.amountPaise)} (${mode.name}). " +
                "Abhi baaki payable: ${rupeesText(remaining)}."
        )
    }

    private suspend fun executeAiMoneyTransfer(
        profileId: Long,
        action: AiAssistantParser.AiAction.MoneyTransfer,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye Money Transfer pehle hi save ho chuka hai — dobara save nahi kiya gaya.")
        }
        val mode = action.mode ?: return AiExecuteResult.Failed("Customer ne Cash diya ya UPI se — mode bataye bina save nahi kar sakta.")
        val transactionId = "MT-AI-" + key.take(8).uppercase()
        db.runInTransaction {
            addMoneyTransfer(
                MoneyTransferEntity(
                    profileId = profileId, transactionId = transactionId,
                    customerName = action.customerName.ifBlank { "Walk-in" },
                    receiverName = "", amountPaise = action.principalPaise,
                    commissionPaise = action.commissionPaise, mode = mode, sentMode = mode,
                    dateEpochDay = action.dayEpoch, note = "AI Assistant se add kiya gaya"
                )
            )
            markExecuted(profileId, key, "money transfer $transactionId principal=${action.principalPaise} commission=${action.commissionPaise}")
        }
        return AiExecuteResult.Saved(
            "Money Transfer save ho gaya (ID: $transactionId): principal ${rupeesText(action.principalPaise)} bheja gaya, " +
                "commission ${rupeesText(action.commissionPaise)} profit me juda. Principal kabhi profit nahi hota."
        )
    }

    private suspend fun executeAiInternalTransfer(
        profileId: Long,
        action: AiAssistantParser.AiAction.InternalTransfer,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye internal transfer pehle hi save ho chuka hai — dobara save nahi kiya gaya.")
        }
        db.runInTransaction {
            internalTransfer(profileId, action.amountPaise, action.from, action.dayEpoch)
            markExecuted(profileId, key, "internal transfer ${action.amountPaise} from=${action.from}")
        }
        return AiExecuteResult.Saved(
            "Internal transfer save ho gaya: ${rupeesText(action.amountPaise)} ${action.from.name} → " +
                "${if (action.from == PaymentMode.CASH) "UPI" else "Cash"}. Ye income ya kharcha nahi hai."
        )
    }

    private suspend fun executeAiCustomerPayment(
        profileId: Long,
        action: AiAssistantParser.AiAction.CustomerPayment,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye customer payment pehle hi save ho chuka hai — dobara save nahi kiya gaya.")
        }
        val customer = findCustomerByName(profileId, action.customerName)
            ?: return AiExecuteResult.Failed("Customer \"${action.customerName}\" nahi mila.")
        val mode = action.mode ?: return AiExecuteResult.Failed("Payment Cash me mila ya UPI se — mode bataye bina save nahi kar sakta.")
        val jobList = jobs.observeByCustomer(profileId, customer.id).first()
        val job = jobList.firstOrNull {
            AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) >= action.amountPaise
        } ?: return AiExecuteResult.Failed(
            "${customer.name} ka ${rupeesText(action.amountPaise)} ka due nahi hai — payment due se zyada hai ya koi pending job nahi hai."
        )
        db.runInTransaction {
            receivePayment(profileId, job, action.amountPaise, mode, action.dayEpoch)
            markExecuted(profileId, key, "customer payment job=${job.id} ${action.amountPaise}")
        }
        val updated = jobs.getById(job.id)
        val remaining = updated?.let { AccountingEngine.customerDue(it.totalFeesPaise, it.amountReceivedPaise) } ?: 0L
        return AiExecuteResult.Saved(
            "Payment save ho gaya: ${customer.name} se ${rupeesText(action.amountPaise)} (${mode.name}) mile. " +
                "Uska baaki due: ${rupeesText(remaining)}."
        )
    }

    /** A due is a JOB — never an income row by itself. A part-payment
     *  that came with the job (receivedPaise > 0) is recorded through
     *  [receivePayment], so it lands in the Khata + Cash/UPI Book as
     *  real income with its mode, and the job's received/due stay
     *  consistent. receivedPaise > 0 without a mode is refused here
     *  (the parser asks for the mode first). */
    private suspend fun executeAiCustomerDue(
        profileId: Long,
        action: AiAssistantParser.AiAction.RecordCustomerDue,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye due pehle hi record ho chuka hai — dobara record nahi kiya gaya.")
        }
        val name = action.customerName ?: return AiExecuteResult.Failed("Customer ka naam bataye bina due record nahi kar sakta.")
        val service = action.service ?: return AiExecuteResult.Failed("Kaunsi service ka due hai — service bataye bina record nahi kar sakta.")
        if (action.receivedPaise > 0L && action.receivedMode == null) {
            return AiExecuteResult.Failed("₹${action.receivedPaise / 100} mile — Cash ya UPI, mode bataye bina save nahi kar sakta.")
        }
        var jobId = 0L
        db.runInTransaction {
            val existing = findCustomerByName(profileId, name)
            val customerId = existing?.id ?: customers.insert(
                CustomerEntity(profileId = profileId, name = name, mobile = "", service = service)
            )
            jobId = jobs.insert(
                ServiceJobEntity(
                    profileId = profileId, customerId = customerId, service = service,
                    workDetails = "AI Assistant se due record",
                    submissionDateEpochDay = AccountingEngine.todayEpochDay(),
                    totalFeesPaise = action.amountPaise, amountReceivedPaise = 0,
                    status = JobStatus.NEW
                )
            )
            markExecuted(profileId, key, "customer due job=$jobId $name ${action.amountPaise}")
        }
        if (action.receivedPaise > 0L) {
            val job = jobs.getById(jobId)
                ?: return AiExecuteResult.Failed("Due record ho gaya, lekin received payment save nahi ho payi — job nahi mila.")
            receivePayment(
                profileId, job, action.receivedPaise,
                action.receivedMode!!,
                if (action.dayEpoch != 0L) action.dayEpoch else AccountingEngine.todayEpochDay()
            )
            val due = AccountingEngine.customerDue(action.amountPaise, action.receivedPaise)
            return AiExecuteResult.Saved(
                "Due record ho gaya (income NAHI): $name — ${service.label} total ${rupeesText(action.amountPaise)}, " +
                    "${rupeesText(action.receivedPaise)} mile (${action.receivedMode.name}), ${rupeesText(due)} baaki."
            )
        }
        return AiExecuteResult.Saved(
            "Due record ho gaya (income NAHI): $name — ${service.label} ${rupeesText(action.amountPaise)} baaki. " +
                "Cash tabhi badhega jab payment milega."
        )
    }

    private suspend fun executeAiDeleteTransaction(
        profileId: Long,
        action: AiAssistantParser.AiAction.DeleteTransaction,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye entry pehle hi delete ho chuki hai.")
        }
        val tx = txs.getById(action.transactionId)
            ?: return AiExecuteResult.Failed("Wo entry nahi mili — shayad pehle hi delete ho chuki hai.")
        if (tx.profileId != profileId) {
            return AiExecuteResult.Failed("Ye entry is business profile ki nahi hai.")
        }
        if (tx.relatedJobId != null) {
            return AiExecuteResult.Failed(
                "Ye entry ek customer job se judi hai — use seedha delete nahi kar sakte. " +
                    "Customer Khata se us job ko sahi karein."
            )
        }
        db.runInTransaction {
            txs.update(tx.copy(state = com.alfalah.business.domain.RecordState.DELETED))
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "Transaction", entityId = tx.id,
                    action = "DELETED",
                    oldValue = "${tx.category} ${tx.amountPaise}",
                    newValue = "AI key=$key DELETED"
                )
            )
        }
        return AiExecuteResult.Saved(
            "Entry delete ho gayi: ${tx.category} ${rupeesText(tx.amountPaise)} (${tx.mode.name}). " +
                "Audit log me record hai; job wali entries Recycle Bin se restore hoti hain."
        )
    }

    private suspend fun executeAiCorrectTransaction(
        profileId: Long,
        action: AiAssistantParser.AiAction.CorrectTransaction,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye correction pehle hi apply ho chuka hai.")
        }
        val tx = txs.getById(action.transactionId)
            ?: return AiExecuteResult.Failed("Wo entry nahi mili.")
        if (tx.profileId != profileId) {
            return AiExecuteResult.Failed("Ye entry is business profile ki nahi hai.")
        }
        if (tx.relatedJobId != null) {
            return AiExecuteResult.Failed(
                "Ye entry ek customer job se judi hai — amount seedha badalne se job ka hisab bigad jayega. " +
                    "Customer Khata se us job ki payment sahi karein."
            )
        }
        if (action.newAmountPaise <= 0) {
            return AiExecuteResult.Failed("Sahi amount zero se zyada hona chahiye.")
        }
        val old = tx.amountPaise
        db.runInTransaction {
            txs.update(tx.copy(amountPaise = action.newAmountPaise))
            audit.insert(
                AuditLogEntity(
                    profileId = profileId, entityType = "Transaction", entityId = tx.id,
                    action = "EDITED",
                    oldValue = "${tx.category} $old",
                    newValue = "AI key=$key ${tx.category} ${action.newAmountPaise}"
                )
            )
        }
        return AiExecuteResult.Saved(
            "Entry sahi ho gayi: ${tx.category} ${rupeesText(old)} → ${rupeesText(action.newAmountPaise)}. " +
                "Purani value audit log me safe hai."
        )
    }

    private suspend fun executeAiAddCustomer(
        profileId: Long,
        action: AiAssistantParser.AiAction.AddCustomer,
        key: String
    ): AiExecuteResult {
        if (alreadyExecuted(profileId, key)) {
            return AiExecuteResult.Duplicate("Ye customer pehle hi add ho chuka hai.")
        }
        val existing = findCustomerByName(profileId, action.name)
        if (existing != null && existing.service == action.service) {
            return AiExecuteResult.Failed(
                "Customer \"${action.name}\" (${action.service.label}) pehle se hai — naya add nahi kiya gaya."
            )
        }
        var id = 0L
        db.runInTransaction {
            id = customers.insert(
                CustomerEntity(
                    profileId = profileId, name = action.name,
                    mobile = action.mobile ?: "", service = action.service
                )
            )
            markExecuted(profileId, key, "add customer $id ${action.name}")
        }
        return AiExecuteResult.Saved(
            "Customer add ho gaya: ${action.name} (${action.service.label}). Ab uske liye job add kar sakte hain.",
            ids = listOf(id)
        )
    }

    // --- AI lookups (profile-scoped, read-only) ---------------------------
    suspend fun findAgentByName(profileId: Long, name: String): AgentEntity? {
        val clean = name.trim()
        if (clean.isEmpty()) return null
        return observeAgents(profileId).first()
            .firstOrNull { it.name.equals(clean, ignoreCase = true) }
            ?: observeAgents(profileId).first()
                .firstOrNull { it.name.lowercase().startsWith(clean.lowercase()) }
    }

    suspend fun findCustomerByName(profileId: Long, name: String): CustomerEntity? {
        val clean = name.trim()
        if (clean.isEmpty()) return null
        return searchCustomers(profileId, clean).first()
            .firstOrNull { it.name.equals(clean, ignoreCase = true) }
            ?: searchCustomers(profileId, clean).first().firstOrNull()
    }

    suspend fun agentNames(profileId: Long): List<String> =
        observeAgents(profileId).first().map { it.name }

    suspend fun customerNames(profileId: Long): List<String> =
        searchCustomers(profileId, "").first().map { it.name }.distinct()

    /** UPDATE 11 §5 — possible-duplicate WARNING, not a block. Two
     *  legitimate entries can have the same amount; the assistant shows
     *  "aaj ye entry pehle se hai — phir bhi save karu?" and the USER
     *  decides. Only an identical idempotency key is ever auto-rejected. */
    suspend fun possibleDuplicateDailyEntry(
        profileId: Long,
        entry: AiAssistantParser.AiDailyEntry,
        dayEpoch: Long
    ): Boolean {
        val same = txs.search(profileId, entry.serviceLabel).first()
            .filter {
                it.dateEpochDay == dayEpoch && it.kind == "INCOME" &&
                    it.category == entry.serviceLabel &&
                    it.amountPaise == entry.amountPaise && it.mode == entry.mode
            }
        return same.isNotEmpty()
    }

    /** Find today's transactions matching an amount/service, so a
     *  correction/delete request can identify the EXACT record. */
    suspend fun findTransactionsForCorrection(
        profileId: Long,
        dayEpoch: Long,
        amountPaise: Long?,
        serviceLabel: String?
    ): List<TransactionEntity> {
        val all = observeTransactions(profileId).first()
        return all.filter {
            it.dateEpochDay == dayEpoch &&
                (amountPaise == null || it.amountPaise == amountPaise) &&
                (serviceLabel == null || it.category == serviceLabel)
        }.take(5)
    }

    suspend fun documentCountForProfile(profileId: Long): Long =
        db.documentDao().countForProfile(profileId)
}
