package com.alfalah.business.domain

import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * BizKhata AI Business Assistant — language understanding + structured
 * actions (UPDATE 9, 2026-11-26; UPDATE 13 multilingual, 2026-11-26).
 * This file is PURE Kotlin: no Android, no Room, no network — so every
 * rule here is unit-testable (see AiAssistantTest, MultilingualAiTest)
 * and mirrored in docs/ai_assistant_mirror.py. UPDATE 13: every message
 * is first canonicalised by [Multilingual] (all 22 scheduled languages
 * + English, native script + Romanized + mixed), then this pipeline
 * runs unchanged; replies use [MultilingualReplies] in the user's
 * language.
 *
 * PIPELINE (the AI never touches the database directly):
 *   user text → [AiAssistantParser.parse] → [AiParseResult]
 *     → Action: show a preview, user confirms/edits/cancels
 *     → [BusinessRepository] executor validates + writes in ONE Room
 *       transaction, with an idempotency key in the audit log
 *     → executor returns the ACTUAL result (ids / Duplicate / error)
 *     → assistant reports only what the backend confirmed.
 *     → Factual / Help: answered by [BusinessKnowledge] from real
 *       ledger data (UPDATE 10), or by the built-in responder.
 *
 * NON-NEGOTIABLE RULES (Record A §§22/25/27, UPDATE 9 §5):
 *  1. Money is paise (Long). Never Double/float.
 *  2. Customer due is NEVER income — only money actually received is.
 *  3. Money Transfer profit = commission only; principal is fund movement.
 *  4. Cash ⇄ UPI is an internal transfer, never income/expense.
 *  5. Agent payment is an agent-ledger payment, never a customer expense.
 *  6. A refund is a REVERSAL, never an ordinary expense.
 *  7. NEVER invent payment mode, service, date, customer/agent identity,
 *     amount or classification. If it cannot be determined reliably, the
 *     parser returns [AiParseResult.Clarify] and asks one short question.
 *  8. PAN is never assignable to an agent (repository-enforced, §12).
 */
object AiAssistantParser {

    /** Whole rupees -> paise, integer Long maths only. Every rupees*100
     *  conversion in the assistant goes through here, so no call site
     *  does its own multiplication. */
    fun rupeesToPaise(rupees: Long): Long = rupees * 100

    // ------------------------------------------------------------------
    // Conversation context — what the assistant remembers within a chat.
    // ------------------------------------------------------------------
    data class AiConversationContext(
        val lastService: ServiceType? = null,
        val lastServiceLabel: String? = null,
        val lastMode: PaymentMode? = null,
        val dayEpoch: Long = LocalDate.now(ZoneOffset.UTC).toEpochDay(),
        /** Last knowledge question (UPDATE 10 follow-ups). */
        val lastKnowledgeService: ServiceType? = null,
        val lastKnowledgePeriod: AiPeriod? = null,
        val lastKnowledgeKind: String? = null,
        val lastCustomerName: String? = null,
        val lastAgentName: String? = null,
        /** Language the user last wrote in (UPDATE 13) — replies and the
         *  voice recogniser follow it until the user switches language
         *  mid-conversation, which re-detects automatically. */
        val lastLanguage: AiLanguage = AiLanguage.HINGLISH,
        /** UPDATE 14/15/16 — conversation memory (ConversationMemory).
         *  NEVER overrides the ledgers; it only fills in what the user
         *  did not repeat. */
        val runsCscCentre: Boolean = false,
        val lastTopic: String? = null,
        val lastIntent: String? = null,
        /** The user's stated plan ("kal PAN Card banane hai") — topic
         *  + the day it is for, so follow-ups ("uski checklist banao")
         *  resolve against it. */
        val lastPlanTopic: String? = null,
        val lastPlanDayEpoch: Long? = null,
        /** UPDATE 20 (BUG A) — a checklist the assistant just offered
         *  to build, mirroring the website's ChatContext.pendingOffer
         *  (knowledge.ts PendingOffer): kind is always "checklist";
         *  [topic] is the buildChecklist topic ("pan", "work", …);
         *  [whenLabel] is "kal" / "parso" / "aaj". Lives for ONE turn:
         *  a new message on any other topic clears it; a bare "Ha" /
         *  "Bana do" while it is pending EXECUTES it (build + save the
         *  real checklist) instead of becoming a financial confirm. */
        val pendingChecklistOffer: PendingChecklistOffer? = null,
        /** UPDATE 21 — a question the assistant just asked that a
         *  short follow-up can answer. kind "count" is set when a plan
         *  reply asks "Kitne applications hain?" — a bare number ("5")
         *  then means 5 applications for [topic], and a correction
         *  ("Nahi, 3 the, 5 nahi") replaces the stored count. */
        val pendingQuestion: PendingQuestion? = null,
        /** UPDATE 21 — the checklist currently active in this
         *  conversation (built items + topic + language + count), so
         *  follow-ups can edit it ("Isme documents bhi add karo"),
         *  re-show it ("PAN wali checklist phir dikhao") or convert
         *  it ("Aur English mein likho") with the content preserved. */
        val activeChecklist: ActiveChecklist? = null,
        /** UPDATE 22 — a proposed app change the assistant just showed
         *  as a spec and is waiting for confirmation on ("Haan,
         *  banao"). Lives for ONE turn like the checklist offer; a
         *  bare yes while it is pending CONFIRMS it (queue the
         *  development request, or perform the service add). */
        val pendingAppChange: AppChangeRequest? = null
    )

    /** UPDATE 22 — a proposed change to BizKhata itself (module /
     *  service / feature / category / field / report / modify), as
     *  understood from the user's words. [kind] is one of "module",
     *  "service", "feature", "category", "field", "report", "modify";
     *  [title] is the name of the thing; [detail] is the spec body
     *  (fields / pages / integrations / what changes). A queued
     *  development request is a RECORD of this — never a claim that
     *  the thing exists or is ready. */
    data class AppChangeRequest(
        val kind: String,
        val title: String,
        val detail: String
    )

    /** Mirror of website knowledge.ts PendingOffer. */
    data class PendingChecklistOffer(
        val kind: String = "checklist",
        val topic: String,
        val whenLabel: String
    )

    /** Mirror of the website's pending-question mechanism (UPDATE 21):
     *  what the bot last asked, so a bare follow-up resolves against
     *  it instead of falling through to a fixed "not understood". */
    data class PendingQuestion(
        val kind: String,
        val topic: String?,
        val detail: String? = null
    )

    /** The checklist active in this conversation (UPDATE 21). */
    data class ActiveChecklist(
        val topic: String,
        val items: List<String>,
        val lang: AiLanguage,
        val whenLabel: String,
        val count: Int? = null
    )

    // ------------------------------------------------------------------
    // Parsed entries / drafts — the structured action request.
    // ------------------------------------------------------------------
    data class AiDailyEntry(
        val service: ServiceType,
        val serviceLabel: String,
        val amountPaise: Long,
        val mode: PaymentMode,
        val description: String
    )

    data class AiExpenseDraft(
        val category: String,
        val amountPaise: Long,
        val mode: PaymentMode?,
        val service: ServiceType?,
        val description: String
    )

    sealed interface AiAction {
        /** One or more walk-in daily income entries (one DB row each). */
        data class DailyEntries(val entries: List<AiDailyEntry>, val dayEpoch: Long) : AiAction

        /** One business expense (Expense row + one EXPENSE book row). */
        data class Expense(val draft: AiExpenseDraft, val dayEpoch: Long) : AiAction

        /** Payment to an agent (agent ledger + one EXPENSE book row). */
        data class AgentPayment(
            val agentName: String,
            val agentId: Long?,
            val amountPaise: Long,
            val mode: PaymentMode?,
            val dayEpoch: Long
        ) : AiAction

        /** Money Transfer: principal (MT ledger only) + commission (income). */
        data class MoneyTransfer(
            val principalPaise: Long,
            val commissionPaise: Long,
            val customerName: String,
            val mode: PaymentMode?,
            val dayEpoch: Long
        ) : AiAction

        /** Cash ⇄ UPI internal transfer — never income/expense. */
        data class InternalTransfer(
            val amountPaise: Long,
            val from: PaymentMode,
            val dayEpoch: Long
        ) : AiAction

        /** Payment received from a customer against one of their jobs. */
        data class CustomerPayment(
            val customerName: String,
            val jobId: Long?,
            val amountPaise: Long,
            val mode: PaymentMode?,
            val dayEpoch: Long
        ) : AiAction

        /** Customer OWES money — a due record (job with received = 0),
         *  NEVER an income row. `receivedPaise` is the part-payment that
         *  came WITH the job ("bill 500, 200 mile" → total 500, received
         *  200, due 300); `receivedMode` is its Cash/UPI home, required
         *  whenever receivedPaise > 0, so the money is never recorded
         *  without a mode. `dayEpoch` is the job's day. */
        data class RecordCustomerDue(
            val customerName: String?,
            val amountPaise: Long,
            val service: ServiceType?,
            val receivedPaise: Long = 0L,
            val receivedMode: PaymentMode? = null,
            val dayEpoch: Long = 0L
        ) : AiAction

        /** Soft-delete a transaction (Recycle Bin + audit, confirm first). */
        data class DeleteTransaction(val transactionId: Long, val label: String) : AiAction

        /** Correct a walk-in/cash-book transaction amount (audit, confirm
         *  first). Job-linked rows are NOT correctable here — their job
         *  would desync; those go through the Khata payment flow. */
        data class CorrectTransaction(
            val transactionId: Long,
            val newAmountPaise: Long,
            val label: String
        ) : AiAction

        /** Add a new customer (service-wise, §9). */
        data class AddCustomer(
            val name: String,
            val service: ServiceType,
            val mobile: String?
        ) : AiAction
    }

    sealed interface AiParseResult {
        /** A financial action, ready for preview + confirmation. */
        data class Action(val action: AiAction, val preview: String) : AiParseResult

        /** Something is missing or ambiguous — ask ONE short question.
         *  [partial] keeps what was already understood, so the answer to
         *  the question completes it instead of starting over. */
        data class Clarify(
            val question: String,
            val partial: AiAction? = null,
            val missing: List<String> = emptyList()
        ) : AiParseResult

        /** A factual business question — answer from the ledgers. */
        data class Factual(val question: String) : AiParseResult

        /** "How do I …?" — app help, with a deep link to the screen. */
        data class Help(val topic: String) : AiParseResult

        /** UPDATE 14/15/16 — a conversational reply, composed by
         *  [ConversationEngine] from the message's actual meaning +
         *  conversation context (casual, statement, plan, general
         *  question, language switch, checklist). NEVER a financial
         *  action: normal conversation can never write to the ledgers.
         *  [needsCloud] means the local engine could not genuinely
         *  answer — the ViewModel must ask the cloud AI or answer
         *  honestly, never invent a forced business question.
         *  [checklist] carries a real checklist (UPDATE 16 do-it). */
        data class Conversational(
            val text: String,
            val intent: String,
            val deepLinkRoute: String? = null,
            val deepLinkLabel: String? = null,
            val checklist: List<String> = emptyList(),
            val needsCloud: Boolean = false,
            /** UPDATE 21 — topic/count of a built checklist, so the
             *  ViewModel can store the active checklist at delivery. */
            val checklistTopic: String? = null,
            val checklistCount: Int? = null,
            /** UPDATE 22 — the proposed app change (spec / confirmed);
             *  the ViewModel executes a confirmed service add or saves
             *  the queued development request. */
            val appChangeSpec: AppChangeRequest? = null,
            val appChangeConfirmed: Boolean = false
        ) : AiParseResult

        /** Nothing understood — fall through to knowledge / built-in. */
        object Unknown : AiParseResult
    }

    // ------------------------------------------------------------------
    // Normalisation: Devanagari digits, Hindi number words, punctuation.
    // UPDATE 13: digit conversion for ALL Indic scripts now lives in
    // [Multilingual.asciiDigits] (called from normalise via canonicalise).
    // ------------------------------------------------------------------
    private val hindiOnes = mapOf(
        "ek" to 1L, "do" to 2L, "teen" to 3L, "chaar" to 4L, "paanch" to 5L,
        "chhe" to 6L, "saat" to 7L, "aath" to 8L, "nau" to 9L, "das" to 10L,
        "gyarah" to 11L, "barah" to 12L, "bees" to 20L, "pachaas" to 50L,
        "sau" to 100L, "hazaar" to 1000L
    )

    /** Normalise digits + lower-case + collapse whitespace. UPDATE 13:
     *  the first step is [Multilingual.canonicalise] — every supported
     *  language, script and Romanized spelling maps to the canonical
     *  Hinglish tokens below, so the rest of this file never sees a
     *  Gujarati "થયા", a Tamil "வந்தது" or a Bengali "টাকা" — it sees
     *  "hue", "aaya" and "rupaye". Keeps the original words (service /
     *  mode keywords are matched on this form). */
    fun normalise(text: String): String {
        var out = Multilingual.canonicalise(text)
        out = out.replace("₹", " rs ")
        // Hindi word-numbers -> digits ("teen sau" -> "300"), so every
        // amount is a digit hit for the positional parser below.
        // (Multilingual already converted the cross-language equivalents;
        // these stay for the Hindi forms it also covers.)
        for ((word, value) in hindiOnes) {
            out = out.replace(Regex("\\b$word\\s+sau\\b"), (value * 100).toString())
            out = out.replace(Regex("\\b$word\\s+hazaar\\b"), (value * 1000).toString())
        }
        out = out.replace(Regex("\\bsau\\b"), "100")
        // Comma followed by a letter separates phrases ("300 cash, UPI")
        // — keep it as a separator token. Any other comma is a thousands
        // separator ("10,000" -> "10000").
        out = out.replace(Regex(",\\s*(?=[a-z])"), " , ")
        out = out.replace(Regex("[,]+"), "")
        return out.replace(Regex("\\s+"), " ").trim()
    }

    /** All rupee amounts in the text, in order. A number counts as an
     *  amount when it is followed by a currency word (rs/rupaye/₹), or
     *  when it is the largest number, or the last number in the text.
     *  Hindi words ("teen sau" = 300, "do hazaar" = 2000) are recognised.
     *  Returns amounts in RUPEES (whole); callers convert to paise. */
    fun findAmounts(normalised: String): List<Long> {
        val found = mutableListOf<Long>()
        // Hindi word numbers: "<one> sau|hazaar".
        var text = normalised
        for ((word, value) in hindiOnes) {
            val regex = Regex("\\b$word\\s+sau\\b")
            if (regex.containsMatchIn(text)) {
                found.add(value * 100)
                text = regex.replace(text, " ")
            }
            val regex2 = Regex("\\b$word\\s+hazaar\\b")
            if (regex2.containsMatchIn(text)) {
                found.add(value * 1000)
                text = regex2.replace(text, " ")
            }
        }
        if (Regex("\\bsau\\b").containsMatchIn(text)) {
            found.add(100)
            text = text.replace(Regex("\\bsau\\b"), " ")
        }
        // Digit amounts, preferring currency-marked ones. UPDATE 20 —
        // a marked amount must NOT hide a bare money number: "10000
        // rupaye ... commission 50" lost the 50, and the principal was
        // then recorded as commission income (₹10,000 instead of ₹50).
        // Bare numbers that are counts (5 applications, 3 customers)
        // are still excluded.
        val marked = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:rs\\.?|rupaye|rupee|rupay)\\b")
            .findAll(text).map { it.groupValues[1].toBigDecimal().toLong() }.toList()
        val all = Regex("\\d+(?:\\.\\d+)?").findAll(text)
            .map { it.value.toBigDecimal().toLong() }.toList()
        if (marked.isNotEmpty()) {
            val counts = Regex("(\\d+)\\s*(customer|customers|log|jobs|kaam|application|applications|card|cards)\\b")
                .findAll(text).map { it.groupValues[1].toBigDecimal().toLong() }.toSet()
            val extra = all.filter { it !in marked && it !in counts }
            return (found + marked + extra).sorted()
        }
        return (found + all).sorted()
    }

    /** The amount a message is about: currency-marked amount first,
     *  else the largest number that is not a small customer/job count.
     *  Returns null when no usable amount exists. */
    fun mainAmount(normalised: String): Long? {
        val amounts = findAmounts(normalised)
        if (amounts.isEmpty()) return null
        // "5 customers aaye, total 1000 rupaye" — 5 is a count, not money.
        val countWords = listOf("customer", "customers", "log", "jobs", "kaam")
        val countNumbers = countWords.flatMap { w ->
            Regex("(\\d+)\\s*$w").findAll(normalised).map { it.groupValues[1].toLong() }
        }
        val money = amounts.filter { it !in countNumbers || amounts.size == 1 }
        if (money.isEmpty()) return null
        // Prefer a currency-marked amount, else the largest (totals beat counts).
        val marked = Regex("(\\d+(?:\\.\\d+)?)\\s*(?:rs\\.?|rupaye|rupee|rupay)\\b")
            .findAll(normalised).map { it.groupValues[1].toBigDecimal().toLong() }.toList()
        return marked.maxOrNull() ?: money.maxOrNull()
    }

    // ------------------------------------------------------------------
    // Keyword maps — service, mode, expense category.
    // ------------------------------------------------------------------
    fun detectService(text: String): ServiceType? = when {
        text.contains("money transfer") || text.contains("moneytransfer") -> ServiceType.MONEY_TRANSFER
        text.contains("smart card") || text.contains("smartcard") -> ServiceType.SMART_CARD
        text.contains("passport") -> ServiceType.PASSPORT_PHOTO
        text.contains("aadhaar") || text.contains("aadhar") || text.contains("adhar") -> ServiceType.AADHAAR
        text.contains("voter") -> ServiceType.VOTER_ID
        text.contains("ayushman") -> ServiceType.AYUSHMAN
        text.contains("xerox") || text.contains("झेरॉक्स") || text.contains("जेरॉक्स") -> ServiceType.XEROX
        text.contains("printing") || text.contains("print") -> ServiceType.PRINTING
        text.contains("scanning") || text.contains("scan") -> ServiceType.SCANNING
        text.contains("pan card") || text.contains("pan ") || text.endsWith("pan") -> ServiceType.PAN
        text.contains("document") -> ServiceType.DOCUMENT_WORK
        else -> null
    }

    fun detectMode(text: String): PaymentMode? = when {
        text.contains("cash") || text.contains("nagad") || text.contains("nakad") -> PaymentMode.CASH
        // "upi" needs a word boundary: "rupiya" contains "upi" as a
        // substring, and must NOT read as a UPI payment (UPDATE 13 —
        // this misread Gujarati "rupiya" messages as UPI).
        Regex("\\bupi\\b").containsMatchIn(text) || text.contains("online") || text.contains("gpay") ||
            text.contains("google pay") || text.contains("phonepe") || text.contains("paytm") ||
            text.contains("bhim") -> PaymentMode.UPI
        else -> null
    }

    fun detectExpenseCategory(text: String): Pair<String, ServiceType?> = when {
        text.contains("machine repair") || text.contains("machine kharab") ||
            text.contains("repair") || text.contains("marammat") -> "Machine Repair" to null
        text.contains("bijli") || text.contains("electricity") || text.contains("light bill") ->
            "Electricity" to null
        text.contains("internet") || text.contains("wifi") -> "Internet" to null
        text.contains("kiraya") || text.contains("rent") -> "Rent" to null
        text.contains("kagaz") || text.contains("paper") -> "Paper" to ServiceType.PRINTING
        text.contains("ink") || text.contains("toner") || text.contains("cartridge") -> "Ink" to ServiceType.PRINTING
        text.contains("transport") || text.contains("petrol") || text.contains("diesel") ||
            text.contains("gaadi") -> "Transport" to null
        text.contains("chai") || text.contains("khana") || text.contains("food") -> "Tea/Food" to null
        text.contains("salary") || text.contains("staff") -> "Staff" to null
        text.contains("servicing") || text.contains("service") && text.contains("machine") ->
            "Servicing" to null
        else -> "Other" to null
    }

    /** Split a multi-entry message into segments ("Xerox 300 cash, 200
     *  UPI aur Smart Card 500 cash" → 3 segments). A segment without a
     *  service inherits the previous segment's service; one without a
     *  mode is left mode-less (clarification asks for it). */
    fun splitSegments(normalised: String): List<String> {
        val split = normalised
            .split(Regex(",|\\baur\\b|\\band\\b|\\+"))
            .map { it.trim() }.filter { it.isNotEmpty() }
        return if (split.isEmpty()) listOf(normalised) else split
    }

    // ------------------------------------------------------------------
    // Idempotency — one key per confirmed action. The repository writes
    // the key into the audit log and refuses a second write with the
    // same key, so a double-tap / retry can never duplicate a transaction.
    // ------------------------------------------------------------------
    fun idempotencyKey(profileId: Long, dayEpoch: Long, canonical: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("$profileId|$dayEpoch|$canonical".toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }.take(16)
    }

    fun canonicalDaily(entries: List<AiDailyEntry>): String =
        entries.joinToString(";") { "${it.serviceLabel}:${it.amountPaise}:${it.mode}" }

    // ------------------------------------------------------------------
    // Main parse.
    // ------------------------------------------------------------------
    fun parse(
        rawText: String,
        context: AiConversationContext,
        knownAgents: List<String> = emptyList(),
        knownCustomers: List<String> = emptyList()
    ): AiParseResult {
        val q = normalise(rawText)
        if (q.isEmpty()) return AiParseResult.Unknown
        // UPDATE 13: detect the message's language (script + keywords,
        // Romanized included) and answer in it. A fresh detection wins
        // — mid-conversation switching just works; when the message
        // carries no language signal (e.g. a bare "300"), the last
        // language from the conversation context is kept.
        val detected = Multilingual.detectLanguage(rawText)
        val lang = if (detected.language != AiLanguage.UNKNOWN) detected.language
            else context.lastLanguage

        // --- UPDATE 14/15/16: understand the actual meaning FIRST.
        //     Casual / statement / plan / general / language-switch /
        //     checklist messages are answered conversationally HERE,
        //     before any business-data path — a greeting must never
        //     reach a "no records" answer, and a plan must never be
        //     forced into a money question ("Mujhe kal PAN Card banane
        //     hai" is a plan about tomorrow, not a transaction).
        //     Financial actions, business-data questions and app help
        //     fall through to the existing pipeline below, unchanged.
        val meaning = ConversationEngine.understand(rawText, context, lang)
        when (meaning.intent) {
            ConversationIntent.CASUAL, ConversationIntent.STATEMENT,
            ConversationIntent.PLAN, ConversationIntent.LANGUAGE_REQUEST,
            ConversationIntent.CHECKLIST, ConversationIntent.QUESTION_GENERAL,
            ConversationIntent.ACCEPT_OFFER, ConversationIntent.OFFER_DECLINED,
            ConversationIntent.APP_CHANGE, ConversationIntent.DO_IT_SUMMARY -> {
                val reply = ConversationEngine.composeLocal(meaning, context)
                return AiParseResult.Conversational(
                    text = reply.text,
                    intent = reply.intent,
                    deepLinkRoute = reply.deepLinkRoute,
                    deepLinkLabel = reply.deepLinkLabel,
                    checklist = reply.checklist,
                    needsCloud = reply.needsCloud,
                    checklistTopic = reply.checklistTopic,
                    checklistCount = reply.checklistCount,
                    appChangeSpec = reply.appChangeSpec,
                    appChangeConfirmed = reply.appChangeConfirmed
                )
            }
            else -> { /* business / help / navigation: existing pipeline */ }
        }

        // --- App help: "kaise …?" / "how to …?" / "kahan …?" -------------
        // UPDATE 20 — honour the meaning's APP_HELP topic FIRST: the
        // classifier may have recognised a help question the
        // keyword-based detectHelp cannot (e.g. video case 1 "kha
        // likhu" has no "kahan"/"kaise" — it must reach the Daily
        // Business guidance, never the daily-summary figures). Only
        // a topic that is a real AppHelpKnowledge key is used; anything
        // else falls through to detectHelp below.
        if (meaning.intent == ConversationIntent.APP_HELP) {
            val helpTopic = meaning.topic
            if (helpTopic != null && AppHelpKnowledge.topics.containsKey(helpTopic)) {
                return AiParseResult.Help(helpTopic)
            }
        }
        val help = detectHelp(q)
        if (help != null) return AiParseResult.Help(help)

        // --- Factual questions: kitna/kitne/kis/kaun/kya/kab/compare -----
        if (isFactualQuestion(q)) return AiParseResult.Factual(rawText)

        // --- Refund: a REVERSAL, never an ordinary expense ---------------
        if (q.contains("refund") || q.contains("wapas") || q.contains("return")) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "refund"),
                missing = listOf("refund entry", "amount", "mode")
            )
        }

        // --- Correction / deletion of an existing transaction ------------
        if (q.contains("galat") || q.contains("correct") || q.contains("sahi karo") ||
            q.contains("delete") || q.contains("hatao") || q.contains("remove") ||
            q.contains("badlo") || q.contains("change karo")
        ) {
            return parseCorrection(q, context)
        }

        // --- "Kal" (yesterday/tomorrow) is ambiguous — never guess a date.
        val dayEpoch = context.dayEpoch
        if (Regex("\\bkal\\b").containsMatchIn(q)) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "kal"),
                missing = listOf("date")
            )
        }

        // --- Internal transfer FIRST: "Cash se UPI transfer" must never
        //     be read as a Money Transfer (it has no commission at all).
        if (isInternalTransfer(q)) {
            val amount = mainAmount(q) ?: return AiParseResult.Clarify(
                "Kitne rupaye Cash se UPI (ya UPI se Cash) transfer kiye?",
                missing = listOf("amount")
            )
            val from = when {
                q.contains("cash se upi") || q.contains("cash to upi") || q.contains("cash -> upi") -> PaymentMode.CASH
                q.contains("upi se cash") || q.contains("upi to cash") -> PaymentMode.UPI
                else -> return AiParseResult.Clarify(
                    MultilingualReplies.get(lang, "askDirection"),
                    missing = listOf("direction")
                )
            }
            val action = AiAction.InternalTransfer(rupeesToPaise(amount), from, dayEpoch)
            return AiParseResult.Action(
                action,
                "Internal transfer: ${formatRupees(rupeesToPaise(amount))} ${from.name} → " +
                    "${if (from == PaymentMode.CASH) "UPI" else "Cash"}. Ye income ya kharcha NAHI hai — sirf paisa ek account se dusre me gaya."
            )
        }

        // --- Money Transfer ----------------------------------------------
        // "money transfer" / "mt" / "transfer + commission" / bare
        // "transfer" (a customer transfer always has a commission to ask
        // about). Internal Cash ⇄ UPI was already handled above.
        if (q.contains("money transfer") || q.contains("moneytransfer") ||
            Regex("\\bmt\\b").containsMatchIn(q) ||
            (q.contains("transfer") && q.contains("commission")) ||
            q.contains("transfer kiya") || q.contains("transfer kara")
        ) {
            return parseMoneyTransfer(q, context, lang)
        }

        // --- Agent payment: "Agent Ramesh ko 500 diye" -------------------
        if (q.contains("agent")) return parseAgentPayment(q, context, knownAgents, lang)

        // --- Expense: "… kharcha hua / kharch hue" -----------------------
        if (q.contains("kharch") || q.contains("expense") || q.contains("kharach")) {
            return parseExpense(q, context, lang)
        }

        // --- Collect a due: "Rahul ka baki 300 jama kar" — this is a
        //     customer PAYMENT (money coming in), not a new due record.
        //     It must be tried BEFORE the due branch below, which would
        //     otherwise record the same words as fresh udhaar.
        if (q.contains("jama kar") || q.contains("jama karo")) {
            val collected = parseCustomerPayment(q, context, knownCustomers, lang)
            if (collected != null) return collected
            val amt = mainAmount(q)
            if (amt != null) {
                return AiParseResult.Clarify(
                    MultilingualReplies.get(
                        lang, "askCustomer",
                        "amount" to formatRupees(rupeesToPaise(amt))
                    ),
                    missing = listOf("customer")
                )
            }
        }

        // --- Customer owes money — NEVER income ---------------------------
        // Also fires on a total + received pair ("500 rupaye, 200 mile")
        // even without a due-word — parseCustomerDue splits it into
        // total/received instead of summing the two amounts.
        val receivedMarker = Regex("\\b(mile|mila|mil gaye|mil gaya)\\b").containsMatchIn(q)
        val totalAndReceived = receivedMarker && findAmounts(q).size >= 2 &&
            knownCustomers.any { q.contains(it.lowercase()) }
        if (((q.contains("due") || q.contains("udhaar") || q.contains("udhar") ||
                q.contains("pending") || q.contains("baki hai") || q.contains("baaki") ||
                q.contains("lena hai")) &&
            mainAmount(q) != null) || totalAndReceived
        ) {
            return parseCustomerDue(q, context, knownCustomers, lang)
        }

        // --- Add a customer ----------------------------------------------
        if ((q.contains("customer") || q.contains("grahak")) &&
            (q.contains("add") || q.contains("naya") || q.contains("new"))
        ) {
            return parseAddCustomer(q, context, lang)
        }

        // --- Customer payment received: "<name> ne 500 diye / jama kiye" --
        val customerPayment = parseCustomerPayment(q, context, knownCustomers, lang)
        if (customerPayment != null) return customerPayment

        // --- Daily income entries (the most important path) --------------
        // A bare "Xerox 300 cash" (no verb — common in quick typing and
        // in voice-to-text output) is still an entry, as long as no known
        // customer name appears (that would make it a job payment, not a
        // walk-in entry, and must not be guessed).
        // UPDATE 18 — the same holds for a fragment WITHOUT a mode
        // ("Xerox 300"): it enters parseDailyEntries, which asks ONE
        // short question ("₹300 Cash mein mila ya UPI mein?") instead
        // of returning Unknown. The mode is never defaulted silently
        // (parseDailyEntries keeps a CASH placeholder only until the
        // clarification completes it).
        val bareEntry = detectService(q) != null && mainAmount(q) != null &&
            knownCustomers.none { q.contains(it.lowercase()) }
        if (hasIncomeSignal(q) || bareEntry) return parseDailyEntries(q, context, lang)

        return AiParseResult.Unknown
    }

    // ------------------------------------------------------------------
    // Intent detectors.
    // ------------------------------------------------------------------
    private fun detectHelp(q: String): String? {
        val how = q.contains("kaise") || q.contains("how to") || q.contains("how do") ||
            q.contains("kahan") || q.contains("where") || q.contains("tarika")
        if (!how) return null
        return when {
            q.contains("cash book") -> "cash_book"
            // Word boundary: "rupiya" contains "upi" and must not route
            // a help question to the UPI Book (UPDATE 13).
            Regex("\\bupi\\b").containsMatchIn(q) -> "upi_book"
            q.contains("customer") && (q.contains("add") || q.contains("khata")) -> "add_customer"
            q.contains("agent") -> "agent_payment"
            q.contains("receipt") || q.contains("rasid") || q.contains("bill") -> "receipt"
            q.contains("daily") || q.contains("report") -> "daily_report"
            q.contains("profile") -> "change_profile"
            q.contains("service") && (q.contains("add") || q.contains("new")) -> "new_service"
            q.contains("language") || q.contains("bhasha") -> "language"
            q.contains("difference") || q.contains("antar") || q.contains("hisab") -> "difference_finder"
            q.contains("money transfer") -> "money_transfer"
            q.contains("expense") || q.contains("kharch") -> "expense"
            q.contains("maintenance") || q.contains("machine") -> "maintenance"
            q.contains("backup") || q.contains("export") -> "backup"
            // UPDATE 20 — no specific topic matched: null, not a
            // placeholder "general" help. A "kaise" question about
            // something else (advice, ideas) must reach the general
            // path, never the fixed excuse "Is feature ki help abhi
            // taiyaar hai."
            else -> null
        }
    }

    private fun isFactualQuestion(q: String): Boolean {
        val questionWord = q.contains("kitna") || q.contains("kitne") || q.contains("kitni") ||
            q.contains("kis") || q.contains("kaun") || q.contains("kya") || q.contains("kab") ||
            q.contains("compare") || q.contains("batao") || q.contains("dikhao") ||
            q.contains("show") || q.contains("hoga") || q.contains("hua tha") || q.contains("hoga") ||
            q.endsWith("?") || q.contains("last month") || q.contains("pichhle") ||
            q.contains("summary") || q.contains("performance") || q.contains("sabse zyada")
        if (!questionWord) return false
        // …unless it is really a save instruction with an amount + a save verb.
        val saveVerb = q.contains("hue") || q.contains("hua") || q.contains("mile") ||
            q.contains("mila") || q.contains("aaye") || q.contains("diye") || q.contains("diya") ||
            q.contains("add kar") || q.contains("save kar")
        val amount = mainAmount(q)
        // "Aaj kitna dhandha hua?" — kitna + hua, but no amount to save → factual.
        if (amount == null) return true
        // "Xerox 300 cash hue" — amount + save verb, no question word → not factual.
        if (!q.contains("kitna") && !q.contains("kitne") && !q.contains("kitni") &&
            !q.contains("kis") && !q.contains("kaun") && !q.contains("compare") &&
            !q.endsWith("?")
        ) return false
        return !saveVerb
    }

    private fun hasIncomeSignal(q: String): Boolean =
        q.contains("hue") || q.contains("hua") || q.contains("hui") || q.contains("mile") || q.contains("mila") ||
            q.contains("aaye") || q.contains("aaya") || q.contains("collection") ||
            q.contains("kamaye") || q.contains("kamaya") || q.contains("income") ||
            q.contains("earning") || q.contains("bikri") || q.contains("sale") ||
            q.contains("add kar") || q.contains("entry") || q.contains("received")

    private fun isInternalTransfer(q: String): Boolean {
        val both = q.contains("cash") && Regex("\\bupi\\b").containsMatchIn(q)
        // Word boundaries: "total" contains "to", and "se" is a substring
        // of many words — a bare contains() misread multi-entry messages
        // ("Xerox 300 cash, 200 UPI total hua") as internal transfers.
        return both && Regex("\\b(transfer|badla|se|to)\\b").containsMatchIn(q)
    }

    // ------------------------------------------------------------------
    // Per-intent parsers.
    // ------------------------------------------------------------------
    /** One money amount found in the text, with its position.
     *  [amountPaise] is already paise (BigDecimal x 100, integer-safe). */
    private data class AmountHit(val amountPaise: Long, val start: Int, val end: Int)

    /** Money amounts in the text, in order. A number directly before a
     *  count word ("5 customers", "3 jobs") is a COUNT, not money, and is
     *  skipped — so "Smart Card ke 5 customers aaye, total 1000 rupaye"
     *  yields one entry (₹1,000), not two. */
    private fun findMoneyHits(q: String): List<AmountHit> {
        val countWords = setOf("customer", "customers", "log", "jobs", "kaam")
        return Regex("\\d+(?:\\.\\d+)?").findAll(q).mapNotNull { m ->
            val after = q.substring(m.range.last + 1, minOf(q.length, m.range.last + 16))
            val nextWord = Regex("^\\s*([a-z]+)").find(after)?.groupValues?.get(1) ?: ""
            if (nextWord in countWords) null
            else AmountHit(
                m.value.toBigDecimal().multiply(java.math.BigDecimal(100)).toLong(),
                m.range.first, m.range.last + 1
            )
        }.toList()
    }

    private fun parseDailyEntries(
        q: String,
        context: AiConversationContext,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult {
        // Positional parsing: every money amount starts one entry. The
        // service/mode for an entry are the keywords around ITS amount
        // (service usually before it — "Xerox 300"; mode usually after
        // it — "300 cash"). This handles commas, "aur" and "and" alike,
        // and a segment without a service inherits the previous entry's.
        val hits = findMoneyHits(q)
        if (hits.isEmpty()) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askAmount"),
                missing = listOf("service", "amount")
            )
        }
        val entries = mutableListOf<AiDailyEntry>()
        var currentService = context.lastService
        var currentLabel = context.lastServiceLabel
        var missingMode = false
        var missingService = false
        // The text between two amounts is split on "aur"/"," — the part
        // before the split belongs to the earlier amount (its mode), the
        // part after belongs to the later amount (its service). Without
        // this, "200 UPI aur Smart Card 500" would attach Smart Card to
        // the ₹200 entry instead of the ₹500 one.
        val separators = Regex(",|\\baur\\b|\\band\\b")
        hits.forEachIndexed { i, hit ->
            val headText = q.substring(if (i == 0) 0 else hits[i - 1].end, hit.start)
                .split(separators).last()
            val tailText = q.substring(hit.end, if (i + 1 < hits.size) hits[i + 1].start else q.length)
                .split(separators).first()
            val service = detectService(headText) ?: detectService(tailText) ?: currentService
            val label = when {
                detectService(headText) != null -> detectService(headText)!!.label
                detectService(tailText) != null -> detectService(tailText)!!.label
                currentLabel != null -> currentLabel
                else -> null
            }
            val mode = detectMode(tailText) ?: detectMode(headText) ?: context.lastMode
            if (service == null || label == null) {
                missingService = true
                return@forEachIndexed
            }
            if (mode == null) missingMode = true
            entries.add(
                AiDailyEntry(
                    service = service,
                    serviceLabel = label,
                    amountPaise = hit.amountPaise,
                    mode = mode ?: PaymentMode.CASH, // placeholder; clarified below
                    description = "AI entry: $label ${formatRupees(hit.amountPaise)}"
                )
            )
            currentService = service
            currentLabel = label
        }
        if (entries.isEmpty()) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askAmount"),
                missing = listOf("service", "amount")
            )
        }
        if (missingService) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(
                    lang, "askService",
                    "amount" to formatRupees(entries.sumOf { it.amountPaise })
                ),
                missing = listOf("service")
            )
        }
        if (missingMode) {
            val total = entries.sumOf { it.amountPaise }
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askMode", "amount" to formatRupees(total)),
                partial = AiAction.DailyEntries(entries, context.dayEpoch),
                missing = listOf("payment mode")
            )
        }
        val action = AiAction.DailyEntries(entries, context.dayEpoch)
        return AiParseResult.Action(action, previewDaily(entries, lang))
    }

    /** Preview text for a daily-entries action (shown before confirm). */
    fun previewDaily(entries: List<AiDailyEntry>, lang: AiLanguage = AiLanguage.HINGLISH): String = buildString {
        appendLine(MultilingualReplies.get(lang, "previewHeader"))
        entries.forEach {
            appendLine("• ${it.serviceLabel} ${formatRupees(it.amountPaise)} ${it.mode.name}")
        }
        appendLine(MultilingualReplies.get(lang, "totalLine", "total" to formatRupees(entries.sumOf { it.amountPaise })))
    }

    private fun parseExpense(
        q: String,
        context: AiConversationContext,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult {
        val amount = mainAmount(q) ?: return AiParseResult.Clarify(
            "Kitne rupaye kharch hue? Misal: \"Aaj 200 rupaye machine repair mein kharch hue\".",
            missing = listOf("amount")
        )
        val (category, service) = detectExpenseCategory(q)
        val mode = detectMode(q)
        if (mode == null) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askMode", "amount" to formatRupees(rupeesToPaise(amount))),
                partial = AiAction.Expense(
                    AiExpenseDraft(category, rupeesToPaise(amount), null, service, "AI expense: $category"),
                    context.dayEpoch
                ),
                missing = listOf("payment mode")
            )
        }
        val draft = AiExpenseDraft(category, rupeesToPaise(amount), mode, service, "AI expense: $category")
        return AiParseResult.Action(
            AiAction.Expense(draft, context.dayEpoch),
            "Kharcha: $category — ${formatRupees(rupeesToPaise(amount))} (${mode.name}). " +
                "Ye Daily Business aur Expenses dono me ek hi entry ki tarah dikhega."
        )
    }

    private fun parseAgentPayment(
        q: String,
        context: AiConversationContext,
        knownAgents: List<String>,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult {
        val amount = mainAmount(q) ?: return AiParseResult.Clarify(
            "Agent ko kitne rupaye diye? Misal: \"Agent Ramesh ko 500 rupaye diye\".",
            missing = listOf("amount")
        )
        // Name: the word(s) after "agent" up to "ko" / "ne" / amount.
        // UPDATE 13: bare particles ("ko", "ne", "se" — "Agent ko 500
        // dena baki hai", "Agent ne 500 rupiya aapvana che") are NOT a
        // name; they mean the name is missing and must be asked. A name
        // followed by a possessive particle ("Ramesh nu", "Ramesh de")
        // keeps only the words before the particle.
        val nameMatch = Regex("agent\\s+([a-zA-Z ]+?)(?:\\s+ko|\\s+ne|\\s+\\d|$)").find(q)
        val rawName = nameMatch?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
        val particles = setOf("ko", "ne", "se", "ka", "ki", "ke", "nu", "de", "da", "che", "ni", "na", "no", "thi")
        val spokenName = rawName
            ?.split(" ").takeWhile { it.lowercase() !in particles }.joinToString(" ")
            ?.trim()?.takeIf { it.isNotBlank() }
        val resolved = spokenName?.let { name ->
            knownAgents.firstOrNull { it.equals(name, ignoreCase = true) }
                ?: knownAgents.firstOrNull { it.lowercase().startsWith(name.lowercase()) }
        }
        if (spokenName == null && knownAgents.size != 1) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askAgent", "amount" to formatRupees(rupeesToPaise(amount))),
                missing = listOf("agent")
            )
        }
        val agentName = resolved ?: spokenName ?: knownAgents.firstOrNull()
        if (agentName == null) {
            return AiParseResult.Clarify(
                "Kis agent ko ${formatRupees(rupeesToPaise(amount))} diye? Abhi koi agent save nahi hai — pehle Agents page se agent add karein.",
                missing = listOf("agent")
            )
        }
        if (resolved == null && spokenName != null && knownAgents.isNotEmpty()) {
            return AiParseResult.Clarify(
                "\"$spokenName\" naam ka agent mujhe nahi mila. Agents me ye hain: ${knownAgents.joinToString(", ")}. " +
                    "Kis agent ko ${formatRupees(rupeesToPaise(amount))} diye?",
                missing = listOf("agent")
            )
        }
        val mode = detectMode(q)
        if (mode == null) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askMode", "amount" to formatRupees(rupeesToPaise(amount))),
                partial = AiAction.AgentPayment(agentName, null, rupeesToPaise(amount), null, context.dayEpoch),
                missing = listOf("payment mode")
            )
        }
        return AiParseResult.Action(
            AiAction.AgentPayment(agentName, null, rupeesToPaise(amount), mode, context.dayEpoch),
            "Agent payment: $agentName ko ${formatRupees(rupeesToPaise(amount))} (${mode.name}). " +
                "Ye agent ledger me payment ki tarah record hoga — customer kharcha nahi."
        )
    }

    private fun parseMoneyTransfer(
        q: String,
        context: AiConversationContext,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult {
        val amounts = findAmounts(q)
        val commissionWord = q.contains("commission")
        val principalWord = q.contains("transfer") || q.contains("bheja") || q.contains("bheje")
        if (commissionWord && amounts.size == 1) {
            // "MT se 150 commission mila" — the single amount IS the
            // commission. But "10000 rupaye bheje, commission batao"
            // is the PRINCIPAL with the commission still unknown: the
            // amount must sit next to "commission" to be the
            // commission, otherwise ask for it — never record the
            // principal as commission income.
            val isCommissionAmount = Regex("commission\\s*\\d+|\\d+\\s*(?:rs\\.?|rupaye|rupee|rupay)?\\s*commission")
                .containsMatchIn(q)
            if (!isCommissionAmount) {
                return AiParseResult.Clarify(
                    MultilingualReplies.get(lang, "askCommission", "amount" to formatRupees(amounts[0] * 100)),
                    missing = listOf("commission")
                )
            }
            // "MT se 150 commission mila" — commission only, no principal to move.
            val commission = amounts[0] * 100
            val mode = detectMode(q)
            if (mode == null) {
                return AiParseResult.Clarify(
                    MultilingualReplies.get(lang, "askMode", "amount" to formatRupees(commission)),
                    partial = AiAction.DailyEntries(
                        listOf(
                            AiDailyEntry(
                                ServiceType.MONEY_TRANSFER,
                                DailyBusiness.MONEY_TRANSFER_COMMISSION_LABEL,
                                commission, PaymentMode.CASH, "AI entry: MT commission"
                            )
                        ),
                        context.dayEpoch
                    ),
                    missing = listOf("payment mode")
                )
            }
            val entry = AiDailyEntry(
                ServiceType.MONEY_TRANSFER, DailyBusiness.MONEY_TRANSFER_COMMISSION_LABEL,
                commission, mode, "AI entry: MT commission"
            )
            return AiParseResult.Action(
                AiAction.DailyEntries(listOf(entry), context.dayEpoch),
                "Money Transfer commission: ${formatRupees(commission)} (${mode.name}) — sirf commission income hai, principal nahi."
            )
        }
        if (amounts.size >= 2) {
            // First amount = principal, second = commission (the usual order).
            val principal = rupeesToPaise(amounts.maxOrNull()!!)
            val commission = amounts.filter { it * 100 != principal }.maxOrNull()?.times(100) ?: 0L
            val mode = detectMode(q)
            if (mode == null) {
                return AiParseResult.Clarify(
                    "Money Transfer ${formatRupees(principal)} (commission ${formatRupees(commission)}) — customer ne Cash diya ya UPI se?",
                    partial = AiAction.MoneyTransfer(principal, commission, "", null, context.dayEpoch),
                    missing = listOf("payment mode")
                )
            }
            return AiParseResult.Action(
                AiAction.MoneyTransfer(principal, commission, "", mode, context.dayEpoch),
                "Money Transfer:\n• Principal bheja gaya: ${formatRupees(principal)} (ye profit NAHI hai)\n" +
                    "• Commission (profit): ${formatRupees(commission)} (${mode.name})"
            )
        }
        if (amounts.size == 1 && principalWord) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askCommission", "amount" to formatRupees(amounts[0] * 100)),
                missing = listOf("commission")
            )
        }
        return AiParseResult.Clarify(
            "Money Transfer ke liye kitna principal aur kitna commission? Misal: \"₹10,000 transfer kiya, ₹50 commission mila\".",
            missing = listOf("principal", "commission")
        )
    }

    private fun parseCustomerDue(
        q: String,
        context: AiConversationContext,
        knownCustomers: List<String>,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult {
        val amount = mainAmount(q) ?: return AiParseResult.Unknown
        val name = knownCustomers.firstOrNull { q.contains(it.lowercase()) }
        val service = detectService(q) ?: context.lastService
        // Total + received: "Rahul ka PAN Card ka kaam hai, 500 rupaye,
        // 200 mile" — the amount next to mile/mila is the RECEIVED part,
        // the other is the total (due = total - received). With a
        // due-word ("200 baaki") the other amount IS the due, so total =
        // received + due. NEVER sum the two amounts into one payment
        // (that would record ₹700 instead of a ₹500 bill with ₹200
        // received). If the split is impossible (received > total and no
        // due-word), ask instead of guessing.
        val amounts = findAmounts(q)
        val receivedMarker = Regex("\\b(mile|mila|mil gaye|mil gaya)\\b").containsMatchIn(q)
        var totalPaise = rupeesToPaise(amount)
        var receivedPaise = 0L
        var splitImpossible = false
        var receivedRupees = 0
        if (amounts.size >= 2 && receivedMarker) {
            val received = amounts.find { a ->
                Regex("\\b$a\\s*(?:rs\\.?|rupaye|rupee|rupay)?\\s*(?:mile|mila|mil gaye|mil gaya)\\b")
                    .containsMatchIn(q)
            } ?: amounts.minOrNull()!!
            receivedRupees = received
            val others = amounts.filter { it != received }
            val dueWord = q.contains("baaki") || q.contains("baki") ||
                q.contains("due") || q.contains("pending")
            val total = if (dueWord) received + (others.maxOrNull() ?: 0)
                else (others.maxOrNull() ?: received)
            if (total < received) {
                splitImpossible = true
            } else {
                totalPaise = rupeesToPaise(total)
                receivedPaise = rupeesToPaise(received)
            }
        }
        if (splitImpossible) {
            return AiParseResult.Clarify(
                "Samajh nahi aaya — ${formatRupees(rupeesToPaise(receivedRupees))} mile aur total kitna hai? Misal: \"500 ka kaam, 200 mile\".",
                missing = listOf("total")
            )
        }
        if (name == null) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askCustomer", "amount" to formatRupees(totalPaise)),
                partial = AiAction.RecordCustomerDue(null, totalPaise, service, receivedPaise, null, context.dayEpoch),
                missing = listOf("customer")
            )
        }
        if (service == null) {
            return AiParseResult.Clarify(
                "$name ka ${formatRupees(totalPaise)} due — kaunsi service ka hai (Xerox, PAN, Aadhaar…)?",
                partial = AiAction.RecordCustomerDue(name, totalPaise, null, receivedPaise, null, context.dayEpoch),
                missing = listOf("service")
            )
        }
        // A received part needs its Cash/UPI home — ask one short
        // question, never record money without a mode.
        if (receivedPaise > 0L) {
            val mode = detectMode(q)
            if (mode == null) {
                return AiParseResult.Clarify(
                    MultilingualReplies.get(lang, "askMode", "amount" to formatRupees(receivedPaise)),
                    partial = AiAction.RecordCustomerDue(name, totalPaise, service, receivedPaise, null, context.dayEpoch),
                    missing = listOf("payment mode")
                )
            }
            val due = totalPaise - receivedPaise
            return AiParseResult.Action(
                AiAction.RecordCustomerDue(name, totalPaise, service, receivedPaise, mode, context.dayEpoch),
                "Customer due (income NAHI): $name — ${service.label} total ${formatRupees(totalPaise)}, " +
                    "${formatRupees(receivedPaise)} mile (${mode.name}), ${formatRupees(due)} baaki."
            )
        }
        return AiParseResult.Action(
            AiAction.RecordCustomerDue(name, totalPaise, service, 0L, null, context.dayEpoch),
            "Customer due (income NAHI): $name — ${service.label} ${formatRupees(totalPaise)} baaki. " +
                "Ye sirf udhaar record hoga; cash tabhi badhega jab payment milega."
        )
    }

    private fun parseCustomerPayment(
        q: String,
        context: AiConversationContext,
        knownCustomers: List<String>,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult? {
        val name = knownCustomers.firstOrNull { q.contains(it.lowercase()) } ?: return null
        val amount = mainAmount(q) ?: return null
        if (!(q.contains("diya") || q.contains("diye") || q.contains("jama") ||
                q.contains("paid") || q.contains("payment") || q.contains("mila") ||
                q.contains("mile") || q.contains("mil gaye") || q.contains("mil gaya") ||
                q.contains("aaye") || q.contains("aaya"))
        ) return null
        val mode = detectMode(q)
        if (mode == null) {
            return AiParseResult.Clarify(
                MultilingualReplies.get(lang, "askMode", "amount" to formatRupees(rupeesToPaise(amount))),
                partial = AiAction.CustomerPayment(name, null, rupeesToPaise(amount), null, context.dayEpoch),
                missing = listOf("payment mode")
            )
        }
        return AiParseResult.Action(
            AiAction.CustomerPayment(name, null, rupeesToPaise(amount), mode, context.dayEpoch),
            "Customer payment: $name se ${formatRupees(rupeesToPaise(amount))} (${mode.name}) mile. " +
                "Ye uske due se kam hoga aur Cash/UPI balance badhega."
        )
    }

    private fun parseAddCustomer(
        q: String,
        context: AiConversationContext,
        lang: AiLanguage = AiLanguage.HINGLISH
    ): AiParseResult {
        val service = detectService(q) ?: context.lastService
        // Name: after "customer" / "naya" — best effort; ask if missing.
        val nameMatch = Regex("(?:naya customer|new customer|customer add karo|customer)\\s+([a-zA-Z ]+)").find(q)
        val name = nameMatch?.groupValues?.get(1)?.trim()
            ?.replace(Regex("\\s+(add|karo|kar|naya)$"), "")?.trim()
            ?.takeIf { it.isNotBlank() && it.length > 1 }
        if (name == null) {
            return AiParseResult.Clarify(
                "Naye customer ka naam kya hai? Aur kaunsi service (Xerox, PAN, Aadhaar…)?",
                missing = listOf("customer name", "service")
            )
        }
        if (service == null) {
            return AiParseResult.Clarify(
                "$name ko kaunsi service ke liye add karu — Xerox, PAN, Aadhaar, ya koi aur?",
                missing = listOf("service")
            )
        }
        return AiParseResult.Action(
            AiAction.AddCustomer(name, service, null),
            "Naya customer: $name (${service.label}). Mobile number baad me Customer Khata se add kar sakte hain."
        )
    }

    private fun parseCorrection(q: String, context: AiConversationContext): AiParseResult {
        // Correction needs an identified record — the ViewModel resolves it
        // by amount/service against today's transactions and, when exactly
        // one matches, confirms; otherwise it lists the matches to pick.
        // Here we only extract the intent + amount; resolution is in the VM.
        val amount = mainAmount(q)
        val isDelete = q.contains("delete") || q.contains("hatao") || q.contains("remove")
        val service = detectService(q)
        val newAmount = Regex("(\\d+)\\s*(?:rs|rupaye)?\\s*(?:se|to|kar|karo|badlo)").find(q)
            ?.groupValues?.get(1)?.toLongOrNull()
        return AiParseResult.Clarify(
            if (isDelete) {
                "Kaunsi entry delete karu? ${amount?.let { "${formatRupees(it * 100)} ki " } ?: ""}" +
                    "${service?.label ?: "aaj ki"} entry batayein — main pehle dikhaunga, phir aap confirm karenge. " +
                    "Delete hone par entry Recycle Bin me jayegi, hamesha ke liye nahi mitegi."
            } else {
                "Kaunsi entry sahi karu? ${amount?.let { "${formatRupees(it * 100)} ki " } ?: ""}" +
                    "${service?.label ?: "aaj ki"} entry aur sahi amount batayein — main pehle purani aur nayi value dikhaunga."
            },
            missing = listOf("exact entry")
        )
    }

    // ------------------------------------------------------------------
    // Follow-up helpers — "Aur 200 UPI bhi add kar do" / "Haan" / "Nahi".
    // ------------------------------------------------------------------
    fun isAffirmative(q: String): Boolean {
        val n = normalise(q)
        return Multilingual.isAffirmative(n) ||
            n == "haan" || n == "ha" || n == "yes" || n == "ok" || n == "okay" ||
            n.startsWith("haan ") || n.startsWith("yes ") || n.contains("save kar") ||
            n.contains("confirm") || n == "kar do" || n == "kardo" || n.contains("theek hai")
    }

    /**
     * UPDATE 20 (BUG A) — bare acceptance of a pending checklist
     * offer, mirroring the website's OFFER_ACCEPT_RE (intent.ts)
     * EXACTLY: the whole message is just a yes / "bana do" / "kar do"
     * / "checklist", nothing else. Anchored + full-message, so "Ha,
     * aur Xerox 300 cash hue" (yes + a real entry) is NOT swallowed
     * as an acceptance — it stays a financial message. This is
     * deliberately SEPARATE from [isAffirmative] (the financial
     * confirm, which is a contains-check and must only ever fire
     * while a preview is actually pending).
     */
    private val offerAcceptRegex = Regex(
        "^(haan?|ha+|yes|yep|ok+|okay|theek\\s*hai|bilkul|ji\\s*haan|" +
            "kar\\s*do|karo|confirm|save|save\\s*kar|" +
            "bana\\s*do|bana\\s*de|bana\\s*dena|banake\\s*do|bana\\s*dijiye|banakar\\s*do|" +
            "checklist|list\\s*bana\\s*do|list\\s*banao|banao|" +
            "haan?\\s*(bana\\s*do|banao|kar\\s*do|checklist\\s*bana\\s*do))[\\s.!]*$"
    )

    fun isOfferAcceptance(q: String): Boolean {
        val n = normalise(q).trim()
        return offerAcceptRegex.containsMatchIn(n)
    }

    /**
     * UPDATE 21 — a bare number ("5", "5.") as a whole message, for
     * answering a pending count question ("Kitne applications
     * hain?"). Returns the number, or null. A number inside a longer
     * sentence is NOT bare — it goes through the normal parser (an
     * amount stays an amount).
     */
    fun bareNumber(q: String): Int? {
        val n = normalise(q).trim().removeSuffix(".").removeSuffix("!").trim()
        if (!Regex("^\\d+$").containsMatchIn(n)) return null
        return n.toIntOrNull()
    }

    /**
     * UPDATE 21 — the corrected count in a message like "Nahi, 3 the,
     * 5 nahi" (it was 3, not 5). The number next to "the / tha / thi /
     * hain" is the correction; the number next to "nahi" is the
     * rejected one. Falls back to the only number present.
     */
    fun correctedCount(q: String): Int? {
        val n = normalise(q)
        Regex("(\\d+)\\s*(the|tha|thi|hain|hai)\\b").find(n)?.let { return it.groupValues[1].toIntOrNull() }
        // A lone number next to "nahi" ("Nahi, 5 nahi") is the REJECTED
        // value, not a correction — never return it as the new count.
        if (Regex("\\d+\\s*nahi\\b").containsMatchIn(n)) return null
        // A single number is a correction ONLY when the message starts
        // with a no ("Nahi, 3"). A bare "5" is a count ANSWER (step 2),
        // and "Xerox ke 300 cash hue" is a financial entry — neither
        // may be silently reinterpreted as a correction.
        val numbers = Regex("\\d+").findAll(n).map { it.value.toIntOrNull() }.toList()
        if (numbers.size == 1 && (n.startsWith("nahi") || n.startsWith("no"))) return numbers[0]
        return null
    }

    fun isNegative(q: String): Boolean {
        val n = normalise(q)
        return Multilingual.isNegative(n) ||
            n == "nahi" || n == "nahin" || n == "no" || n.startsWith("nahi ") ||
            n.contains("cancel") || n.contains("mat karo") || n.contains("rehnedo") ||
            n.contains("rehne do")
    }

    /** UPDATE 20 — "Nahi, 500 the" corrects the pending preview's
     *  amount, it does not cancel it. A number + a correction marker
     *  (nahi/no/galat/the/tha/thi), and NOT a follow-up add ("aur" /
     *  "bhi" / "add" belongs to the merge path). Returns paise or null. */
    fun correctedPreviewAmount(q: String): Long? {
        val n = normalise(q)
        if (n.contains("aur") || n.contains("bhi") || n.contains("add")) return null
        if (!Regex("\\b(no|nahi|galat|the|tha|thi|actually|matlab)\\b").containsMatchIn(n)) return null
        return mainAmount(n)?.let { rupeesToPaise(it) }
    }

    /** A bare follow-up amount ("Aur 200 UPI bhi add kar do") — same
     *  service/date as the last entry, without duplicating it. Returns a
     *  DailyEntries action for just the new amount, or null. */
    fun parseFollowUpAmount(
        q: String,
        context: AiConversationContext
    ): AiAction.DailyEntries? {
        val n = normalise(q)
        if (!n.contains("aur") && !n.contains("bhi") && !n.contains("add")) return null
        val amount = mainAmount(n) ?: return null
        val service = detectService(n) ?: context.lastService ?: return null
        val mode = detectMode(n) ?: context.lastMode ?: return null
        val label = detectService(n)?.label ?: context.lastServiceLabel ?: service.label
        return AiAction.DailyEntries(
            listOf(AiDailyEntry(service, label, rupeesToPaise(amount), mode, "AI entry: $label ${formatRupees(rupeesToPaise(amount))}")),
            context.dayEpoch
        )
    }
}
