package com.alfalah.business.data

import androidx.room.TypeConverter
import com.alfalah.business.domain.AgentType
import com.alfalah.business.domain.BusinessCategory
import com.alfalah.business.domain.JobStatus
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.RecordState
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.domain.TransferStatus

/** Room type converters for the enums used in entities. */
class Converters {
    @TypeConverter fun fromService(v: ServiceType) = v.name
    @TypeConverter fun toService(v: String) = ServiceType.valueOf(v)

    @TypeConverter fun fromPaymentMode(v: PaymentMode) = v.name
    @TypeConverter fun toPaymentMode(v: String) = PaymentMode.valueOf(v)

    @TypeConverter fun fromJobStatus(v: JobStatus) = v.name
    @TypeConverter fun toJobStatus(v: String) = JobStatus.valueOf(v)

    @TypeConverter fun fromAgentType(v: AgentType) = v.name
    @TypeConverter fun toAgentType(v: String) = AgentType.valueOf(v)

    @TypeConverter fun fromCategory(v: BusinessCategory) = v.name
    @TypeConverter fun toCategory(v: String) = BusinessCategory.valueOf(v)

    @TypeConverter fun fromTransferStatus(v: TransferStatus) = v.name
    @TypeConverter fun toTransferStatus(v: String) = TransferStatus.valueOf(v)

    @TypeConverter fun fromRecordState(v: RecordState) = v.name
    @TypeConverter fun toRecordState(v: String) = RecordState.valueOf(v)
}
