package com.alfalah.business.data.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.alfalah.business.domain.AgentType
import com.alfalah.business.domain.BusinessCategory
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.PaymentStatus
import com.alfalah.business.domain.RecordState
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.domain.TransferStatus

/**
 * Room entities. Money is stored as paise (Long) — never floats.
 * Every table carries profileId: records NEVER mix between business profiles.
 * Every financial table carries a soft-delete flag + audit fields instead of
 * hard deletion (Record A §16: no silent erasure of financial data).
 *
 * NOTE (Section 28, pending): the final backend is PostgreSQL with a shared
 * API. These Room entities are the local data model; field names and
 * relationships are designed to map 1:1 onto the future server tables, so
 * the sync layer can reuse them without a remodel.
 */
@Entity(tableName = "business_profiles")
data class BusinessProfileEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,                       // e.g. "Al Falah Communication"
    val category: BusinessCategory,
    val ownerName: String = "",
    val phone: String = "",
    val address: String = "",
    val gstNumber: String = "",
    val upiId: String = "",
    val isActive: Boolean = true,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "customers",
    indices = [Index("profileId"), Index("service")],
    foreignKeys = [ForeignKey(
        entity = BusinessProfileEntity::class,
        parentColumns = ["id"], childColumns = ["profileId"],
        onDelete = ForeignKey.CASCADE
    )]
)
data class CustomerEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val mobile: String,
    /** The service this customer belongs to on THIS page. A customer using
     *  two services has one identity + one job row per service (§9). */
    val service: ServiceType,
    val notes: String = "",
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** One job = one service done for one customer. Its own record and its own
 *  financial calculation. Money Transfer jobs live in their own table. */
@Entity(
    tableName = "service_jobs",
    indices = [Index("profileId"), Index("customerId"), Index("service")],
    foreignKeys = [
        ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = CustomerEntity::class, parentColumns = ["id"], childColumns = ["customerId"], onDelete = ForeignKey.CASCADE)
    ]
)
data class ServiceJobEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val customerId: Long,
    val service: ServiceType,
    val workDetails: String,
    val referenceNumber: String = "",
    val submissionDateEpochDay: Long,
    val status: JobStatus = JobStatus.NEW,
    val totalFeesPaise: Long,
    val amountReceivedPaise: Long = 0,
    val agentId: Long? = null,      // null for PAN — ayan does PAN himself
    val agentChargesPaise: Long = 0,
    val deliveryStatus: String = "",
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis(),
    val updatedAtEpochMs: Long = System.currentTimeMillis()
)

/** One payment against a job (Khata entry). Only RECEIVED money goes here. */
@Entity(
    tableName = "khata_entries",
    indices = [Index("jobId"), Index("profileId")],
    foreignKeys = [ForeignKey(entity = ServiceJobEntity::class, parentColumns = ["id"], childColumns = ["jobId"], onDelete = ForeignKey.CASCADE)]
)
data class KhataEntryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val jobId: Long,
    val amountPaise: Long,
    val mode: PaymentMode,
    val dateEpochDay: Long,
    val note: String = "",
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** A cash/UPI book entry: income, expense, or an internal transfer.
 *  Internal transfers (Cash ⇄ UPI) are flagged and excluded from income/expense. */
@Entity(
    tableName = "transactions",
    indices = [Index("profileId"), Index("dateEpochDay")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class TransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    /** INCOME, EXPENSE, or INTERNAL_TRANSFER (Cash ⇄ UPI — not income/expense). */
    val kind: String,
    val category: String,           // service name or expense category
    val amountPaise: Long,
    val mode: PaymentMode,
    val dateEpochDay: Long,
    val description: String = "",
    val relatedJobId: Long? = null,
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** Money Transfer has its OWN ledger — never mixed with shop accounting (§18). */
@Entity(
    tableName = "money_transfers",
    indices = [Index("profileId"), Index("dateEpochDay")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class MoneyTransferEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val transactionId: String,      // unique, shown on receipts
    val customerName: String,
    val receiverName: String,
    val receiverMobile: String = "",
    val amountPaise: Long,          // principal — NEVER counted as profit
    val commissionPaise: Long,      // only this is profit (minus charges/expenses)
    val chargesPaise: Long = 0,
    val mode: PaymentMode,          // how the customer paid (Cash/UPI)
    val sentMode: PaymentMode,      // how the money was sent (Cash/UPI/Online)
    val status: TransferStatus = TransferStatus.COMPLETED,
    val referenceNumber: String = "",
    val dateEpochDay: Long,
    val note: String = "",
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/**
 * Money Transfer fund received — the fund ayan's BROTHER gives him, by
 * UPI (turn 2–3 of the original chat). The fund is the float the shop
 * sends transfers from; hisab went wrong after 1–2 days because fund
 * received, transferred, spent and balance left were never tracked
 * together. One row per fund receipt. This is MT-ledger money only —
 * it never enters the general shop Cash/UPI books.
 */
@Entity(tableName = "money_transfer_funds")
data class MoneyTransferFundEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val amountPaise: Long,          // fund received
    val source: String = "Brother", // who gave the fund
    val mode: PaymentMode = PaymentMode.UPI, // fund comes by UPI
    val dateEpochDay: Long,
    val note: String = "",
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** Money Transfer daily closing: opening/closing cash & UPI for MT only. */@Entity(
    tableName = "money_transfer_closings",
    indices = [Index("profileId"), Index("dateEpochDay")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class MoneyTransferClosingEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val dateEpochDay: Long,
    val openingCashPaise: Long,
    val openingUpiPaise: Long,
    val closingCashPaise: Long,
    val closingUpiPaise: Long,
    val fundReceivedPaise: Long = 0, // e.g. fund from ayan's brother
    val otherExpensesPaise: Long = 0,
    val pendingSettlementsPaise: Long = 0,
    val note: String = ""
)

@Entity(
    tableName = "agents",
    indices = [Index("profileId")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class AgentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,
    val mobile: String,
    val type: AgentType,
    val contactDetails: String = "",
    val documentsRequired: String = "",
    val notes: String = "",
    val isActive: Boolean = true,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** One payment to an agent. Agent payable is its own ledger. */
@Entity(
    tableName = "agent_payments",
    indices = [Index("agentId"), Index("profileId")],
    foreignKeys = [ForeignKey(entity = AgentEntity::class, parentColumns = ["id"], childColumns = ["agentId"], onDelete = ForeignKey.CASCADE)]
)
data class AgentPaymentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val agentId: Long,
    val jobId: Long? = null,
    val amountPaise: Long,
    val mode: PaymentMode,
    val dateEpochDay: Long,
    val note: String = "",
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "expenses",
    indices = [Index("profileId"), Index("dateEpochDay"), Index("equipmentId")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class ExpenseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val category: String,           // Machine Repair, Ink, Electricity, Rent…
    val equipmentId: Long? = null,  // links a direct cost to its machine/service
    val service: ServiceType? = null, // direct cost linked to a service (§13)
    val description: String,
    val amountPaise: Long,
    val mode: PaymentMode,
    val vendor: String = "",
    val dateEpochDay: Long,
    val note: String = "",
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "equipment",
    indices = [Index("profileId")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class EquipmentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val name: String,               // "Xerox Machine", "Epson L805", "Computer"…
    val purchaseDateEpochDay: Long? = null,
    val notes: String = ""
)

/** A document file attached to a customer/job. Only metadata is stored in
 *  Room; the file itself lives in private app storage (never public).
 *  Aadhaar/sensitive documents: store as little as possible, mask numbers. */
@Entity(
    tableName = "documents",
    indices = [Index("jobId"), Index("profileId")],
    foreignKeys = [ForeignKey(entity = ServiceJobEntity::class, parentColumns = ["id"], childColumns = ["jobId"], onDelete = ForeignKey.CASCADE)]
)
data class DocumentEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val jobId: Long,
    val fileName: String,
    val category: String = "",
    val mimeType: String = "",
    val relativePath: String,       // private internal storage path
    val note: String = "",
    val uploadedAtEpochMs: Long = System.currentTimeMillis(),
    val state: RecordState = RecordState.ACTIVE
)

@Entity(
    tableName = "receipts",
    indices = [Index("profileId"), Index("jobId")],
    foreignKeys = [ForeignKey(entity = ServiceJobEntity::class, parentColumns = ["id"], childColumns = ["jobId"], onDelete = ForeignKey.CASCADE)]
)
data class ReceiptEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val receiptNumber: String,      // unique, e.g. BIZ-2026-0001
    val jobId: Long,
    val customerName: String,
    val customerMobile: String,
    val service: ServiceType,
    val totalFeesPaise: Long,
    val amountPaidPaise: Long,
    val mode: PaymentMode,
    val dateEpochDay: Long,
    val note: String = "",
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** Audit log — who changed what, old value → new value, when (§16). */
@Entity(tableName = "audit_log", indices = [Index("profileId"), Index("entityId")])
data class AuditLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val entityType: String,         // "ServiceJob", "Transaction", …
    val entityId: Long,
    val action: String,             // CREATED / EDITED / DELETED / RESTORED
    val oldValue: String = "",
    val newValue: String = "",
    val atEpochMs: Long = System.currentTimeMillis()
)

/** App user (local account). Server auth (Google Sign-In + mobile login)
 *  is Phase A of the backend; locally the account is the profile owner.
 *  Passwords are NEVER stored here — only the auth provider's user id. */
@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val displayName: String,
    val gmail: String = "",
    val mobile: String = "",
    val authProviderUserId: String = "",
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** An internal Cash ⇄ UPI transfer record (its own table, v2 spec §A).
 *  The Cash/UPI book postings for the same transfer live in `transactions`
 *  (kind INTERNAL_TRANSFER) and are written in the same DB transaction —
 *  the transfer table is the record, the book rows are the balances. */
@Entity(
    tableName = "internal_transfers",
    indices = [Index("profileId"), Index("dateEpochDay")],
    foreignKeys = [ForeignKey(entity = BusinessProfileEntity::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)]
)
data class InternalTransferEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val amountPaise: Long,
    val fromMode: PaymentMode,      // CASH or UPI
    val toMode: PaymentMode,        // the other one
    val dateEpochDay: Long,
    val note: String = "",
    val createdAtEpochMs: Long = System.currentTimeMillis()
)

/** One maintenance event for a piece of equipment (v2 spec §F).
 *  Lifetime cost = sum of all maintenance rows for the equipment. */
@Entity(
    tableName = "maintenance",
    indices = [Index("equipmentId"), Index("profileId")],
    foreignKeys = [ForeignKey(entity = EquipmentEntity::class, parentColumns = ["id"], childColumns = ["equipmentId"], onDelete = ForeignKey.CASCADE)]
)
data class MaintenanceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val profileId: Long,
    val equipmentId: Long,
    val dateEpochDay: Long,
    val workDone: String,           // "Servicing", "Printhead replaced"…
    val partsReplaced: String = "",
    val costPaise: Long,
    val mode: PaymentMode = PaymentMode.CASH,
    val nextMaintenanceEpochDay: Long? = null, // reminder date
    val vendor: String = "",
    val note: String = "",
    val state: RecordState = RecordState.ACTIVE,
    val createdAtEpochMs: Long = System.currentTimeMillis()
)
