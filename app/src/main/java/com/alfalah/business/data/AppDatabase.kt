package com.alfalah.business.data

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.alfalah.business.data.dao.AgentDao
import com.alfalah.business.data.dao.AuditLogDao
import com.alfalah.business.data.dao.BusinessProfileDao
import com.alfalah.business.data.dao.CustomerDao
import com.alfalah.business.data.dao.DocumentDao
import com.alfalah.business.data.dao.ExpenseDao
import com.alfalah.business.data.dao.InternalTransferDao
import com.alfalah.business.data.dao.MaintenanceDao
import com.alfalah.business.data.dao.MoneyTransferDao
import com.alfalah.business.data.dao.MoneyTransferFundDao
import com.alfalah.business.data.dao.ReceiptDao
import com.alfalah.business.data.dao.ServiceJobDao
import com.alfalah.business.data.dao.TransactionDao
import com.alfalah.business.data.entity.AgentEntity
import com.alfalah.business.data.entity.AgentPaymentEntity
import com.alfalah.business.data.entity.AuditLogEntity
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.data.entity.CustomerEntity
import com.alfalah.business.data.entity.DocumentEntity
import com.alfalah.business.data.entity.EquipmentEntity
import com.alfalah.business.data.entity.ExpenseEntity
import com.alfalah.business.data.entity.KhataEntryEntity
import com.alfalah.business.data.entity.MoneyTransferClosingEntity
import com.alfalah.business.data.entity.MoneyTransferEntity
import com.alfalah.business.data.entity.MoneyTransferFundEntity
import com.alfalah.business.data.entity.InternalTransferEntity
import com.alfalah.business.data.entity.MaintenanceEntity
import com.alfalah.business.data.entity.UserEntity
import com.alfalah.business.data.entity.ServiceJobEntity
import com.alfalah.business.data.entity.TransactionEntity

/**
 * Local Room database (version 2 — v2 adds money_transfer_funds, the
 * Money Transfer fund received from ayan's brother by UPI; auto-migrated
 * from v1). Offline-first: the shopkeeper can add transactions without
 * internet. Server sync (PostgreSQL + shared API) is Phase 6 and is
 * pending a Section 28 backend decision — the entity field names are
 * designed to map 1:1 to the future server tables.
 */
@Database(
    entities = [
        BusinessProfileEntity::class,
        CustomerEntity::class,
        ServiceJobEntity::class,
        KhataEntryEntity::class,
        TransactionEntity::class,
        MoneyTransferEntity::class,
        MoneyTransferFundEntity::class,
        MoneyTransferClosingEntity::class,
        AgentEntity::class,
        AgentPaymentEntity::class,
        ExpenseEntity::class,
        EquipmentEntity::class,
        DocumentEntity::class,
        ReceiptEntity::class,
        AuditLogEntity::class,
        UserEntity::class,
        InternalTransferEntity::class,
        MaintenanceEntity::class
    ],
    version = 2,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun businessProfileDao(): BusinessProfileDao
    abstract fun customerDao(): CustomerDao
    abstract fun serviceJobDao(): ServiceJobDao
    abstract fun khataDao(): KhataDao
    abstract fun transactionDao(): TransactionDao
    abstract fun moneyTransferDao(): MoneyTransferDao
    abstract fun moneyTransferFundDao(): MoneyTransferFundDao
    abstract fun agentDao(): AgentDao
    abstract fun expenseDao(): ExpenseDao
    abstract fun documentDao(): DocumentDao
    abstract fun receiptDao(): ReceiptDao
    abstract fun auditLogDao(): AuditLogDao
    abstract fun maintenanceDao(): MaintenanceDao
    abstract fun internalTransferDao(): InternalTransferDao

    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "bizkhata.db"
                )
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .build()
                    .also { INSTANCE = it }
            }
    }
}
