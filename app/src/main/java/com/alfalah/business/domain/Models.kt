package com.alfalah.business.domain

/** Payment mode. Cash and UPI are ALWAYS separate accounts. */
enum class PaymentMode { CASH, UPI, OTHER }

/** How a job was paid / is to be paid. */
enum class PaymentStatus { UNPAID, PARTIAL, PAID }

/** Work status of a service job (BizKhata v2: New → In Progress →
 *  Submitted → Pending → Completed → Delivered, or Cancelled).
 *  Agent assignment is a separate field on the job, not a status. */
enum class JobStatus { NEW, IN_PROGRESS, SUBMITTED, PENDING, COMPLETED, DELIVERED, CANCELLED }

/** A service the shop offers. CSC is the primary category; the other
 *  services below belong to the CSC ready-made setup. Other business
 *  categories add their own services through CategorySetup. */
enum class ServiceType(val label: String) {
    PAN("PAN Card"),
    AADHAAR("Aadhaar Services"),
    VOTER_ID("Voter ID"),
    AYUSHMAN("Ayushman Card"),
    XEROX("Xerox"),
    PRINTING("Printing"),
    SMART_CARD("Smart Card"),
    DOCUMENT_WORK("Document Work"),
    MONEY_TRANSFER("Money Transfer"),
    OTHER("Other Service")
}

/** Agent types. PAN is NEVER an agent service — ayan makes PAN cards himself. */
enum class AgentType(val label: String) {
    AADHAAR_NAME_CORRECTION("Aadhaar Name Correction"),
    AADHAAR_MOBILE_UPDATE("Aadhaar Mobile Update"),
    AADHAAR_BIOMETRIC("Aadhaar Biometric"),
    AADHAAR_AAVAK_DHAKLA("Aadhaar Aavak Dhakla"),
    LICENCE("Licence"),
    OTHER("Other Agent Work")
}

/** Business categories offered at signup. The app is for EVERY business,
 *  not only the owner's CSC shop. CSC is the first/primary category and
 *  its setup is built fully first; every other category gets its own
 *  ready-made setup from [CategorySetup]. */
enum class BusinessCategory(val label: String) {
    CSC("Cyber Cafe / CSC Center"),
    MOBILE_SHOP("Mobile Shop"),
    GROCERY("Grocery / Kirana Store"),
    CLOTHING("Clothing Store"),
    ELECTRONICS("Electronics Shop"),
    PRINTING_SHOP("Printing Shop"),
    HARDWARE("Hardware Store"),
    MEDICAL("Medical Store"),
    RESTAURANT("Restaurant / Cafe"),
    SALON("Salon / Beauty Parlour"),
    AUTOMOBILE("Automobile / Garage"),
    WHOLESALE("Wholesale Business"),
    GENERAL_RETAIL("General Retail"),
    SERVICE("Service Business"),
    OTHER("Other Business")
}

/** App language. English is the default; Hinglish uses natural
 *  Hindi-English; Hindi uses proper Hindi. All three are offered on the
 *  language screen after login (BizKhata v2). */
enum class AppLanguage { ENGLISH, HINDI, HINGLISH }

/** Money-transfer transaction status. */
enum class TransferStatus { PENDING, COMPLETED, FAILED }

/** Soft-delete / audit state of a record. */
enum class RecordState { ACTIVE, DELETED }
