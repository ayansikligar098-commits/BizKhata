package com.alfalah.business.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.entity.AuditLogEntity
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.DocumentEntity
import com.alfalah.business.data.entity.EquipmentEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.InternalTransferEntity
import com.alfalah.business.data.entity.KhataEntryEntity
import com.alfalah.business.data.entity.MaintenanceEntity
import com.alfalah.business.data.entity.MoneyTransferClosingEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.entity.ReceiptEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.domain.ServiceType
import kotlinx.coroutines.flow.Flow

/**
 * DAOs. Every query is scoped by profileId — a profile can never see
 * another profile's data. Financial reads always filter state = 'ACTIVE'
 * (soft-deleted rows stay in the database for the audit trail / recycle bin).
 */
@Dao
interface BusinessProfileDao {
    @Query("SELECT * FROM business_profiles ORDER BY id")
    fun observeAll(): Flow<List<BusinessProfileEntity>>

    @Query("SELECT * FROM business_profiles WHERE id = :id")
    suspend fun getById(id: Long): BusinessProfileEntity?

    @Insert suspend fun insert(profile: BusinessProfileEntity): Long
    @Update suspend fun update(profile: BusinessProfileEntity)
}

@Dao
interface CustomerDao {
    /** Service-wise list: Aadhaar page shows Aadhaar customers only (§9). */
    @Query("SELECT * FROM customers WHERE profileId = :profileId AND service = :service ORDER BY name")
    fun observeByService(profileId: Long, service: ServiceType): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE profileId = :profileId AND (name LIKE '%' || :query || '%' OR mobile LIKE '%' || :query || '%') ORDER BY name")
    fun search(profileId: Long, query: String): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE id = :id")
    suspend fun getById(id: Long): CustomerEntity?

    @Insert suspend fun insert(customer: CustomerEntity): Long
    @Update suspend fun update(customer: CustomerEntity)
}

@Dao
interface ServiceJobDao {
    @Query("SELECT * FROM service_jobs WHERE profileId = :profileId AND service = :service AND state = 'ACTIVE' ORDER BY submissionDateEpochDay DESC")
    fun observeByService(profileId: Long, service: ServiceType): Flow<List<ServiceJobEntity>>

    @Query("SELECT * FROM service_jobs WHERE profileId = :profileId AND customerId = :customerId AND state = 'ACTIVE' ORDER BY submissionDateEpochDay DESC")
    fun observeByCustomer(profileId: Long, customerId: Long): Flow<List<ServiceJobEntity>>

    @Query("SELECT * FROM service_jobs WHERE profileId = :profileId AND state = 'ACTIVE' ORDER BY submissionDateEpochDay DESC")
    fun observeAll(profileId: Long): Flow<List<ServiceJobEntity>>

    @Query("SELECT * FROM service_jobs WHERE id = :id")
    suspend fun getById(id: Long): ServiceJobEntity?

    @Query("SELECT * FROM service_jobs WHERE profileId = :profileId AND agentId = :agentId AND state = 'ACTIVE' ORDER BY submissionDateEpochDay DESC")
    fun observeByAgent(profileId: Long, agentId: Long): Flow<List<ServiceJobEntity>>

    /** Customer due across a profile: sum of (total − received) over active jobs. */
    @Query("SELECT COALESCE(SUM(totalFeesPaise - amountReceivedPaise), 0) FROM service_jobs WHERE profileId = :profileId AND state = 'ACTIVE'")
    suspend fun totalCustomerDue(profileId: Long): Long

    @Insert suspend fun insert(job: ServiceJobEntity): Long
    @Update suspend fun update(job: ServiceJobEntity)

    @Query("UPDATE service_jobs SET state = 'DELETED', updatedAtEpochMs = :now WHERE id = :id")
    suspend fun softDelete(id: Long, now: Long = System.currentTimeMillis())

    @Query("UPDATE service_jobs SET state = 'ACTIVE', updatedAtEpochMs = :now WHERE id = :id")
    suspend fun restore(id: Long, now: Long = System.currentTimeMillis())

    /** Recycle Bin: soft-deleted jobs for a profile, newest first. */
    @Query("SELECT * FROM service_jobs WHERE profileId = :profileId AND state = 'DELETED' ORDER BY updatedAtEpochMs DESC")
    fun observeDeleted(profileId: Long): Flow<List<ServiceJobEntity>>
}

@Dao
interface KhataDao {
    @Query("SELECT * FROM khata_entries WHERE jobId = :jobId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeByJob(jobId: Long): Flow<List<KhataEntryEntity>>

    /** Whole-profile ledger (Customer Khata detail: payments across a customer's jobs). */
    @Query("SELECT * FROM khata_entries WHERE profileId = :profileId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeByProfile(profileId: Long): Flow<List<KhataEntryEntity>>

    @Insert suspend fun insert(entry: KhataEntryEntity): Long
}

@Dao
interface TransactionDao {
    @Query("SELECT * FROM transactions WHERE profileId = :profileId AND mode = :mode AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeByMode(profileId: Long, mode: String): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE profileId = :profileId AND kind = :kind AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeByKind(profileId: Long, kind: String): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE profileId = :profileId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeAll(profileId: Long): Flow<List<TransactionEntity>>

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM transactions WHERE profileId = :profileId AND kind = 'INCOME' AND mode = :mode AND state = 'ACTIVE' AND dateEpochDay = :day")
    suspend fun incomeOnDay(profileId: Long, mode: String, day: Long): Long

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM transactions WHERE profileId = :profileId AND kind = 'EXPENSE' AND mode = :mode AND state = 'ACTIVE' AND dateEpochDay = :day")
    suspend fun expenseOnDay(profileId: Long, mode: String, day: Long): Long

    @Insert suspend fun insert(tx: TransactionEntity): Long
    @Update suspend fun update(tx: TransactionEntity)
}

@Dao
interface MoneyTransferDao {
    @Query("SELECT * FROM money_transfers WHERE profileId = :profileId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeAll(profileId: Long): Flow<List<MoneyTransferEntity>>

    @Query("SELECT COALESCE(SUM(commissionPaise), 0) FROM money_transfers WHERE profileId = :profileId AND state = 'ACTIVE' AND dateEpochDay = :day")
    suspend fun commissionOnDay(profileId: Long, day: Long): Long

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM money_transfers WHERE profileId = :profileId AND state = 'ACTIVE' AND dateEpochDay = :day")
    suspend fun principalOnDay(profileId: Long, day: Long): Long

    @Insert suspend fun insert(transfer: MoneyTransferEntity): Long

    @Insert suspend fun insertClosing(closing: MoneyTransferClosingEntity): Long

    @Query("SELECT * FROM money_transfer_closings WHERE profileId = :profileId AND dateEpochDay = :day LIMIT 1")
    suspend fun closingOnDay(profileId: Long, day: Long): MoneyTransferClosingEntity?
}

/** Fund receipts for Money Transfer (from ayan's brother, by UPI). */
@Dao
interface MoneyTransferFundDao {
    @Query("SELECT * FROM money_transfer_funds WHERE profileId = :profileId ORDER BY dateEpochDay DESC")
    fun observeAll(profileId: Long): Flow<List<MoneyTransferFundEntity>>

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM money_transfer_funds WHERE profileId = :profileId")
    suspend fun totalFund(profileId: Long): Long

    @Insert suspend fun insert(fund: MoneyTransferFundEntity): Long
}

@Dao
interface AgentDao {
    @Query("SELECT * FROM agents WHERE profileId = :profileId ORDER BY name")
    fun observeAll(profileId: Long): Flow<List<AgentEntity>>

    @Query("SELECT * FROM agents WHERE id = :id")
    suspend fun getById(id: Long): AgentEntity?

    @Insert suspend fun insert(agent: AgentEntity): Long
    @Update suspend fun update(agent: AgentEntity)

    @Query("SELECT COALESCE(SUM(agentChargesPaise), 0) FROM service_jobs WHERE profileId = :profileId AND agentId = :agentId AND state = 'ACTIVE'")
    suspend fun totalChargesForAgent(profileId: Long, agentId: Long): Long

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM agent_payments WHERE agentId = :agentId AND state = 'ACTIVE'")
    suspend fun totalPaidToAgent(agentId: Long): Long

    /** Total agent payable for a profile = agent charges on active jobs
     *  minus payments made to agents. One query, so the two ledgers can
     *  never drift apart. */
    @Query(
        "SELECT COALESCE((SELECT SUM(agentChargesPaise) FROM service_jobs " +
        "WHERE profileId = :profileId AND agentId IS NOT NULL AND state = 'ACTIVE'), 0) " +
        "- COALESCE((SELECT SUM(amountPaise) FROM agent_payments " +
        "WHERE profileId = :profileId AND state = 'ACTIVE'), 0)"
    )
    suspend fun totalAgentPayable(profileId: Long): Long

    @Insert suspend fun insertPayment(payment: AgentPaymentEntity): Long

    @Query("SELECT * FROM agent_payments WHERE agentId = :agentId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observePayments(agentId: Long): Flow<List<AgentPaymentEntity>>
}

@Dao
interface ExpenseDao {
    @Query("SELECT * FROM expenses WHERE profileId = :profileId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeAll(profileId: Long): Flow<List<ExpenseEntity>>

    @Query("SELECT * FROM expenses WHERE profileId = :profileId AND equipmentId = :equipmentId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeByEquipment(profileId: Long, equipmentId: Long): Flow<List<ExpenseEntity>>

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM expenses WHERE profileId = :profileId AND equipmentId = :equipmentId AND state = 'ACTIVE'")
    suspend fun totalForEquipment(profileId: Long, equipmentId: Long): Long

    @Query("SELECT COALESCE(SUM(amountPaise), 0) FROM expenses WHERE profileId = :profileId AND state = 'ACTIVE' AND dateEpochDay = :day")
    suspend fun totalOnDay(profileId: Long, day: Long): Long

    @Insert suspend fun insert(expense: ExpenseEntity): Long

    @Insert suspend fun insertEquipment(equipment: EquipmentEntity): Long

    @Query("SELECT * FROM equipment WHERE profileId = :profileId ORDER BY name")
    fun observeEquipment(profileId: Long): Flow<List<EquipmentEntity>>
}

@Dao
interface DocumentDao {
    @Query("SELECT * FROM documents WHERE jobId = :jobId AND state = 'ACTIVE' ORDER BY uploadedAtEpochMs DESC")
    fun observeByJob(jobId: Long): Flow<List<DocumentEntity>>

    /** All documents belonging to one customer's jobs (Khata → Documents tab). */
    @Query(
        "SELECT d.* FROM documents d JOIN service_jobs j ON d.jobId = j.id " +
        "WHERE j.customerId = :customerId AND d.state = 'ACTIVE' ORDER BY d.uploadedAtEpochMs DESC"
    )
    fun observeByCustomer(customerId: Long): Flow<List<DocumentEntity>>

    @Insert suspend fun insert(document: DocumentEntity): Long

    @Query("UPDATE documents SET state = 'DELETED' WHERE id = :id")
    suspend fun softDelete(id: Long)
}

@Dao
interface ReceiptDao {
    @Query("SELECT * FROM receipts WHERE profileId = :profileId ORDER BY createdAtEpochMs DESC")
    fun observeAll(profileId: Long): Flow<List<ReceiptEntity>>

    @Query("SELECT COUNT(*) FROM receipts WHERE profileId = :profileId")
    suspend fun countForProfile(profileId: Long): Long

    @Insert suspend fun insert(receipt: ReceiptEntity): Long
}

@Dao
interface MaintenanceDao {
    @Query("SELECT * FROM maintenance WHERE equipmentId = :equipmentId AND state = 'ACTIVE' ORDER BY dateEpochDay DESC")
    fun observeByEquipment(equipmentId: Long): Flow<List<MaintenanceEntity>>

    @Query("SELECT COALESCE(SUM(costPaise), 0) FROM maintenance WHERE equipmentId = :equipmentId AND state = 'ACTIVE'")
    suspend fun lifetimeCost(equipmentId: Long): Long

    @Query("SELECT * FROM maintenance WHERE profileId = :profileId AND nextMaintenanceEpochDay IS NOT NULL AND nextMaintenanceEpochDay <= :upToDay AND state = 'ACTIVE' ORDER BY nextMaintenanceEpochDay")
    fun observeDueReminders(profileId: Long, upToDay: Long): Flow<List<MaintenanceEntity>>

    @Insert suspend fun insert(maintenance: MaintenanceEntity): Long
}

@Dao
interface InternalTransferDao {
    @Query("SELECT * FROM internal_transfers WHERE profileId = :profileId ORDER BY dateEpochDay DESC")
    fun observeAll(profileId: Long): Flow<List<InternalTransferEntity>>

    @Insert suspend fun insert(transfer: InternalTransferEntity): Long
}

@Dao
interface AuditLogDao {
    @Query("SELECT * FROM audit_log WHERE profileId = :profileId ORDER BY atEpochMs DESC LIMIT 200")
    fun observeRecent(profileId: Long): Flow<List<AuditLogEntity>>

    @Insert suspend fun insert(log: AuditLogEntity): Long
}
