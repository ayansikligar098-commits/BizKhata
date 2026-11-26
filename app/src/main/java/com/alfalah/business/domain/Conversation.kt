package com.alfalah.business.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * BizKhata AI — unified conversational engine (UPDATE 14 + UPDATE 15 +
 * UPDATE 16, 2026-11-26). PURE Kotlin: no Android, no Room, no network —
 * unit-testable (ConversationTest) and mirrored in
 * docs/ai_assistant_mirror.py.
 *
 * ARCHITECTURE — two engines, one assistant, strict division of labour:
 *
 *  1. CLOUD CONVERSATIONAL AI — the MAIN engine for casual / general
 *     conversation (UPDATE 15 §6). When an AI service is configured,
 *     [ChatbotViewModel] routes every casual / statement / plan /
 *     general message through [CloudAiClient.converse] with a prompt
 *     carrying the user's language + style, the conversation history,
 *     the business context (CSC centre, services) and strict rules
 *     (figures only from supplied ledger facts; the AI never performs
 *     a financial action — it only proposes structured actions that go
 *     through the existing preview → confirm → backend flow). The
 *     cloud reply REPLACES the local reply entirely.
 *
 *  2. LOCAL MEANING ENGINE (this file) — understands the message's
 *     actual meaning ([MeaningParser.understand]) and composes a reply
 *     from the parsed meaning + conversation context. It is the engine
 *     when no AI service is configured, and it is ALWAYS the engine
 *     for structured work: financial actions, business-data questions
 *     (figures from the real ledgers only) and app help / navigation.
 *     It is NOT a fixed-reply chatbot:
 *       - Replies are COMPOSED from meaning slots (intent, topic,
 *         time, entities) + live context (last topic, last plan, CSC
 *         centre, turn history), with the wording varied by a hash of
 *         the message + context — the same words in a different
 *         context get a different reply, and no generic question is
 *         ever repeated.
 *       - Sentence fragments (openers, offers) are building blocks,
 *         never whole canned answers: the reply is assembled from
 *         what was actually understood.
 *       - When the local engine cannot genuinely answer (live / current
 *         information, or a general question outside its knowledge),
 *         it returns null and the ViewModel answers honestly in plain
 *         language ("I cannot answer this right now, please rephrase")
 *         — it NEVER invents an unrelated business question.
 *
 *  THE PLAN / STATEMENT GUARD (the UPDATE 15 screenshot bug): a
 *  statement or a plan — future infinitive, no amount, no question —
 *  must NEVER be answered with a money question. "Mujhe kal PAN Card
 *  banane hai" is a PLAN about tomorrow, not a transaction: the reply
 *  acknowledges the plan (tomorrow + PAN Card) and offers relevant
 *  help (a checklist). The guard is enforced in [MeaningParser]
 *  (plan beats the "kal" date rule and every money branch) and in
 *  [ConversationEngine] (plan / statement replies contain no amount
 *  question by construction). The old "kal is ambiguous" rule still
 *  applies — but ONLY to financial entries ("Kal Xerox ke 300 cash
 *  hue"), never to plans.
 *
 *  DO-IT COMMANDS (UPDATE 16 — "Jo jo bolu, vo AI kare"): imperative
 *  messages are EXECUTED, not described. Navigation commands perform
 *  the navigation (via [AiNavigation], emitted by the ViewModel);
 *  checklist requests produce a real checklist ([ChecklistBuilder]);
 *  summary / report requests produce the real summary from the
 *  ledgers ([BusinessKnowledge]); language requests switch the reply
 *  language immediately. Financial actions still go through preview →
 *  confirm → backend, and normal conversation never writes anything.
 *
 *  LANGUAGE: replies are composed in the user's detected language
 *  ([ConversationReplies] covers the same 15 languages as
 *  [MultilingualReplies]; the other 8 fall back to Hinglish — same
 *  documented limit as UPDATE 13). The reply language MUST match the
 *  message language: the Hinglish-marker guard in
 *  [Multilingual.detectLanguage] ("kaise / bhai / ho / hoon / hai /
 *  kar / rahe" outweigh a lone "ho") is what stopped the UPDATE 14
 *  screenshot bug, where a Hinglish greeting was answered in Marathi.
 *
 *  HONEST LIMITS: without a configured AI service the local engine
 *  handles small talk, plans, explainers, troubleshooting, writing
 *  help, arithmetic / conversions and all business work — but it
 *  cannot hold an open-ended general conversation like a live AI,
 *  and it says so instead of faking it. Live-device voice testing
 *  and the first compile remain pending (no JDK on this VM).
 */
enum class ConversationIntent {
    CASUAL,
    STATEMENT,
    PLAN,
    QUESTION_GENERAL,
    BUSINESS_QUERY,
    BUSINESS_ACTION,
    APP_HELP,
    NAVIGATION,
    LANGUAGE_REQUEST,
    CHECKLIST,
    DO_IT_SUMMARY,
    UNKNOWN
}

/** What was actually understood from one message — meaning slots, not
 *  a keyword hit. [topic] is a short key ("pan", "website", "work",
 *  "bored", "joke", "tomorrow_plan", "business_idea", …); [timeRef]
 *  is "today" / "tomorrow" / "yesterday" / null. */
data class Meaning(
    val intent: ConversationIntent,
    val topic: String?,
    val timeRef: String?,
    val service: ServiceType?,
    val amountPaise: Long?,
    val rawText: String,
    val canonicalText: String,
    val language: AiLanguage,
    /** The language the user asked to switch to (LANGUAGE_REQUEST). */
    val requestedLanguage: AiLanguage? = null
)

/** A locally composed reply. [needsCloud] means the local engine
 *  could not genuinely answer — the ViewModel must either ask the
 *  cloud AI or answer honestly, never fall back to a forced
 *  business question. */
data class LocalReply(
    val text: String,
    val intent: String,
    val checklist: List<String> = emptyList(),
    val needsCloud: Boolean = false,
    val deepLinkRoute: String? = null,
    val deepLinkLabel: String? = null
)

object MeaningParser {

    // Business-entry vocabulary: if any of these is present the message
    // is about the books, and the statement / casual paths must NOT
    // claim it. ("kaam" / "shop" are deliberately NOT here — "Aaj bahut
    // kaam tha" is a statement about a busy day, not a ledger entry.)
    private val businessVocab = listOf(
        "xerox", "printing", "print", "pan", "aadhaar", "voter", "ayushman",
        "smart card", "scanning", "document", "money transfer",
        "kharch", "expense", "agent", "transfer", "due", "udhaar", "udhar",
        "baki", "baaki", "pending", "jama", "paisa", "paise", "rupaye",
        "entry", "payment", "refund", "profit", "nafa", "dhandha",
        "collection", "income", "kamai", "balance", "cash", "upi",
        "hisab", "khata", "customer", "grahak", "commission", "bill",
        "receipt", "rasid", "hisaab"
    )

    /** Words that make a message a financial action / money talk:
     *  income / expense / agent / transfer / due / payment verbs, an
     *  "entry" word, or a service + an amount. */
    private fun hasMoneySignal(q: String): Boolean {
        if (q.contains("entry")) return true
        val moneyVerb = q.contains("hue") || q.contains("hua") || q.contains("mile") ||
            q.contains("mila") || q.contains("aaye") || q.contains("aaya") ||
            q.contains("diye") || q.contains("diya") || q.contains("kharch") ||
            q.contains("expense") || q.contains("agent") || q.contains("transfer") ||
            q.contains("due") || q.contains("udhaar") || q.contains("udhar") ||
            q.contains("jama") || q.contains("refund") || q.contains("payment") ||
            q.contains("add kar") || q.contains("save kar")
        if (moneyVerb) return true
        val service = AiAssistantParser.detectService(q)
        return service != null && AiAssistantParser.mainAmount(q) != null
    }

    private fun hasBusinessVocab(q: String): Boolean =
        businessVocab.any { q.contains(it) }

    /** Future-infinitive plan verbs ("banane hai", "karna hai", …) —
     *  a statement about what the user WILL do, not a transaction. */
    private val planVerbs = listOf(
        "banane hai", "banana hai", "banani hai", "banane hain",
        "karna hai", "karne hai", "karni hai", "karna hain",
        "jaana hai", "jana hai", "jaane hai", "kholna hai",
        "lena hai", "dena hai", "seekhna hai", "shuru karna hai"
    )

    private fun isPlan(q: String): Boolean =
        planVerbs.any { q.contains(it) } &&
            !hasMoneySignal(q) &&
            // "dena hai" / "lena hai" are dues, not plans.
            !q.contains("due") && !q.contains("baki") && !q.contains("udhaar")

    /** "Kal mujhe kya kya kaam karna chahiye?" — a question about
     *  tomorrow's work, not a date to clarify and not an entry. */
    private fun isTomorrowPlanQuestion(q: String): Boolean =
        q.contains("kal") && q.contains("chahiye") &&
            (q.contains("kya kya") || q.contains("kaam"))

    fun understand(
        rawText: String,
        context: AiAssistantParser.AiConversationContext,
        lang: AiLanguage
    ): Meaning {
        val q = AiAssistantParser.normalise(rawText)
        val lowerRaw = rawText.lowercase()
        val service = AiAssistantParser.detectService(q)
        val amount = AiAssistantParser.mainAmount(q)?.let { AiAssistantParser.rupeesToPaise(it) }
        val timeRef = when {
            Regex("\\bkal\\b").containsMatchIn(q) -> "tomorrow" // refined below: plan vs entry
            q.contains("aaj") -> "today"
            q.contains("yesterday") -> "yesterday"
            else -> null
        }

        // 1. Language request — "Mujhe Gujarati mein samjhao" /
        //    "ગુજરાતીમાં મારી સાથે વાત કરો" — switches immediately.
        languageRequest(rawText, lowerRaw)?.let { requested ->
            return Meaning(
                ConversationIntent.LANGUAGE_REQUEST, "language", null, null, null,
                rawText, q, lang, requested
            )
        }

        // 2. Navigation — executed by the ViewModel, not described.
        if (AiNavigation.routeFor(rawText) != null) {
            return Meaning(ConversationIntent.NAVIGATION, "navigation", null, null, null, rawText, q, lang)
        }

        // 3. Checklist — "Kal ke kaam ki checklist banao". The topic
        //    prefers an explicit service, then the remembered plan
        //    ("kal PAN Card banane hai" → PAN checklist), then the words.
        if (isChecklistRequest(q)) {
            val topic = service?.name?.lowercase()
                ?: context.lastPlanTopic
                ?: detectTopic(q, context)
                ?: "work"
            return Meaning(ConversationIntent.CHECKLIST, topic, timeRef, service, null, rawText, q, lang)
        }

        // 4. Do-it summary / report — real figures from the ledgers.
        if (isDoItSummary(q)) {
            return Meaning(ConversationIntent.DO_IT_SUMMARY, "summary", timeRef, service, null, rawText, q, lang)
        }

        // 5. Tomorrow's-work question.
        if (isTomorrowPlanQuestion(q)) {
            return Meaning(ConversationIntent.QUESTION_GENERAL, "tomorrow_plan", "tomorrow", null, null, rawText, q, lang)
        }

        // 6. PLAN — future infinitive, no money signal. This beats the
        //    "kal" date rule and every money branch: a plan is never a
        //    transaction, and must never be answered with a money question.
        if (isPlan(q)) {
            val topic = detectTopic(q, context) ?: "work"
            val whenRef = if (q.contains("kal")) "tomorrow" else timeRef
            return Meaning(ConversationIntent.PLAN, topic, whenRef, service, null, rawText, q, lang)
        }

        // 7. Casual conversation — strict patterns + no business signal.
        val casualTopic = casualTopic(q, lowerRaw)
        if (casualTopic != null && !hasMoneySignal(q)) {
            return Meaning(ConversationIntent.CASUAL, casualTopic, timeRef, null, null, rawText, q, lang)
        }

        // 8. Financial action — service + amount, or a money verb.
        if (hasMoneySignal(q)) {
            return Meaning(ConversationIntent.BUSINESS_ACTION, detectTopic(q, context), timeRef, service, amount, rawText, q, lang)
        }

        // 9. App help — "kaise" + a BizKhata screen / feature.
        if (isAppHelp(q)) {
            return Meaning(ConversationIntent.APP_HELP, detectTopic(q, context), null, null, null, rawText, q, lang)
        }

        // 10. Business-data question — figures from the ledgers.
        if (isBusinessQuestion(q)) {
            return Meaning(ConversationIntent.BUSINESS_QUERY, detectTopic(q, context), timeRef, service, null, rawText, q, lang)
        }

        // 11. General question — explainers, how-tos, ideas, maths…
        val generalTopic = generalTopic(q, lowerRaw)
        if (generalTopic != null) {
            return Meaning(ConversationIntent.QUESTION_GENERAL, generalTopic, timeRef, service, null, rawText, q, lang)
        }

        // 12. Statement — declarative, no business vocabulary, no
        //     question mark: "Aaj bahut kaam tha." A statement is
        //     acknowledged, never turned into a question about money.
        if (!q.trim().endsWith("?") && !hasBusinessVocab(q)) {
            val topic = detectTopic(q, context) ?: statementTopic(q)
            return Meaning(ConversationIntent.STATEMENT, topic, timeRef, null, null, rawText, q, lang)
        }

        return Meaning(ConversationIntent.UNKNOWN, null, timeRef, service, amount, rawText, q, lang)
    }

    // ------------------------------------------------------------------
    // Detectors.
    // ------------------------------------------------------------------
    private val languageNames: List<Pair<String, AiLanguage>> = listOf(
        "gujarati" to AiLanguage.GUJARATI, "ગુજરાતી" to AiLanguage.GUJARATI,
        "hindi" to AiLanguage.HINDI, "हिन्दी" to AiLanguage.HINDI, "हिंदी" to AiLanguage.HINDI,
        "marathi" to AiLanguage.MARATHI, "मराठी" to AiLanguage.MARATHI,
        "english" to AiLanguage.ENGLISH,
        "bengali" to AiLanguage.BENGALI, "বাংলা" to AiLanguage.BENGALI,
        "punjabi" to AiLanguage.PUNJABI, "ਪੰਜਾਬੀ" to AiLanguage.PUNJABI,
        "tamil" to AiLanguage.TAMIL, "தமிழ்" to AiLanguage.TAMIL,
        "telugu" to AiLanguage.TELUGU, "తెలుగు" to AiLanguage.TELUGU,
        "kannada" to AiLanguage.KANNADA, "ಕನ್ನಡ" to AiLanguage.KANNADA,
        "malayalam" to AiLanguage.MALAYALAM, "മലയാളം" to AiLanguage.MALAYALAM,
        "odia" to AiLanguage.ODIA, "ଓଡ଼ିଆ" to AiLanguage.ODIA,
        "assamese" to AiLanguage.ASSAMESE, "অসমীয়া" to AiLanguage.ASSAMESE,
        "urdu" to AiLanguage.URDU, "اردو" to AiLanguage.URDU,
        "nepali" to AiLanguage.NEPALI, "नेपाली" to AiLanguage.NEPALI,
        "sanskrit" to AiLanguage.SANSKRIT, "kashmiri" to AiLanguage.KASHMIRI,
        "konkani" to AiLanguage.KONKANI, "sindhi" to AiLanguage.SINDHI,
        "manipuri" to AiLanguage.MANIPURI, "bodo" to AiLanguage.BODO,
        "dogri" to AiLanguage.DOGRI, "maithili" to AiLanguage.MAITHILI,
        "santali" to AiLanguage.SANTALI
    )

    /** "… mein samjhao / bolo / baat karo" + a language name. */
    fun languageRequest(rawText: String, lowerRaw: String): AiLanguage? {
        val asksLanguage = lowerRaw.contains("samjhao") || lowerRaw.contains("samjhaao") ||
            lowerRaw.contains("bolo") || lowerRaw.contains("baat karo") ||
            lowerRaw.contains("vaat karo") || lowerRaw.contains("mein baat") ||
            lowerRaw.contains("me baat") || lowerRaw.contains("speak") ||
            lowerRaw.contains("talk") || rawText.contains("વાત કરો") ||
            rawText.contains("માં વાત") || rawText.contains("समझाओ") ||
            rawText.contains("बोलो")
        if (!asksLanguage) return null
        return languageNames.firstOrNull { (name, _) ->
            lowerRaw.contains(name.lowercase()) || rawText.contains(name)
        }?.second
    }

    private fun isChecklistRequest(q: String): Boolean =
        q.contains("checklist") && (q.contains("banao") || q.contains("banado") ||
            q.contains("bana do") || q.contains("make") || q.contains("bana"))

    private fun isDoItSummary(q: String): Boolean =
        (q.contains("summary") || q.contains("report") || q.contains("hisab")) &&
            (q.contains("banao") || q.contains("banado") || q.contains("bana do") ||
                q.contains("generate") || q.contains("dikhao") || q.contains("batao"))

    /** Casual topics, strict: a greeting / feeling / small-talk pattern
     *  with no money signal. "hi" alone at the start, or a whole
     *  "kaise ho" — never a business sentence that merely starts
     *  with "hi" (the money-signal check in understand() vetoes it). */
    fun casualTopic(q: String, lowerRaw: String): String? {
        val trimmed = q.trim()
        if (trimmed == "hi" || trimmed == "hello" || trimmed == "hey" ||
            trimmed.startsWith("hi ") || trimmed.startsWith("hello ") ||
            trimmed.startsWith("hey ") || q.contains("namaste") ||
            q.contains("namaskar") || q.contains("salam") ||
            q.contains("good morning") || q.contains("good evening") ||
            q.contains("good afternoon") || q.contains("vanakkam") ||
            q.contains("sat sri akal") || q.contains("kem cho") ||
            q.contains("kemon acho") || q.contains("kaise ho") ||
            q.contains("kaisa hai") || q.contains("kaisa chal") ||
            q.contains("kya haal") || q.contains("how are you") ||
            q.contains("su chale chhe") || q.contains("kya chal raha") ||
            q.contains("aur batao") || q.contains("kya kar rahe ho") ||
            q.contains("kya kar rahe") || q.contains("tum kaun ho") ||
            q.contains("who are you")
        ) return "greeting"
        if (q.contains("joke") && (q.contains("sunao") || q.contains("batao") || q.contains("tell"))) return "joke"
        if (q.contains("bore") || q.contains("boring") || q.contains("feeling bored")) return "bored"
        if (q.contains("mood kharab") || q.contains("mood achha") || q.contains("mood kharaab") ||
            q.contains("feeling sad") || q.contains("thak gaya") || q.contains("tired") ||
            q.contains("mood off")
        ) return "mood"
        if (q.contains("shukriya") || q.contains("dhanyavad") || q.contains("thank you") || q.contains("thanks")) return "thanks"
        if (q.contains("ek baat puchni") || q.contains("baat puchni") ||
            q.contains("can you help me") || q.contains("madad chahiye") ||
            q.contains("help karo") || q.contains("mujhe madad")
        ) return "ask_anything"
        if (trimmed == "bye" || trimmed.startsWith("bye") || q.contains("alvida") ||
            q.contains("good night") || q.contains("shubh ratri")
        ) return "farewell"
        if (q.contains("kya kar rahe") || q.contains("what are you doing")) return "what_doing"
        return null
    }

    private val appHelpWords = listOf(
        "cash book", "upi book", "khata", "agent", "receipt", "rasid",
        "report", "profile", "maintenance", "machine", "backup", "export",
        "difference", "language", "bhasha", "app kaise", "bizkhata",
        "money transfer", "expense", "kharch", "service"
    )

    private fun isAppHelp(q: String): Boolean {
        val how = q.contains("kaise") || q.contains("how to") || q.contains("how do") ||
            q.contains("kahan") || q.contains("tarika") || q.contains("use karte")
        return how && appHelpWords.any { q.contains(it) }
    }

    private fun isBusinessQuestion(q: String): Boolean {
        val questionWord = q.contains("kitna") || q.contains("kitne") || q.contains("kitni") ||
            q.contains("kis") || q.contains("kaun") || q.contains("kya") || q.contains("kab") ||
            q.contains("compare") || q.contains("batao") || q.contains("dikhao") ||
            q.contains("summary") || q.contains("performance") || q.contains("sabse zyada") ||
            q.trim().endsWith("?")
        if (!questionWord) return false
        return hasBusinessVocab(q) || q.contains("dhandha") || q.contains("total")
    }

    /** General-knowledge topics the local engine can genuinely answer.
     *  Returns null for anything else — the caller must then use the
     *  cloud AI or answer honestly, never invent. */
    fun generalTopic(q: String, lowerRaw: String): String? {
        if (q.contains("pan card") || q.contains("pan ke baare")) return "pan_explainer"
        if (q.contains("aadhaar") || q.contains("aadhar")) return "aadhaar_explainer"
        if (q.contains("voter")) return "voter_explainer"
        if (q.contains("ayushman")) return "ayushman_explainer"
        if (q.contains("csc") && (q.contains("kya hai") || q.contains("ke baare") || q.contains("centre") || q.contains("center"))) return "csc_explainer"
        if (q.contains("website") && (q.contains("bana") || q.contains("kaise") || q.contains("how"))) return "website_build"
        if (q.contains("business idea") || q.contains("business ka idea") || q.contains("idea chahiye")) return "business_idea"
        if (q.contains("phone") && (q.contains("slow") || q.contains("hang") || q.contains("chal nahi"))) return "troubleshoot_phone"
        if ((q.contains("printer") || q.contains("print")) && (q.contains("nahi") || q.contains("not") || q.contains("kharab"))) return "troubleshoot_printer"
        if (q.contains("internet") && (q.contains("nahi") || q.contains("slow") || q.contains("down") || q.contains("chal nahi"))) return "troubleshoot_internet"
        if (q.contains("upi") && (q.contains("nahi") || q.contains("fail") || q.contains("chal nahi"))) return "troubleshoot_upi"
        if (q.contains("message likh") || q.contains("email likh") || q.contains("caption") || q.contains("likh do")) return "writing"
        if (q.contains("translate") || q.contains("anuvaad") || q.contains("ka matlab") || q.contains("meaning of")) return "translation"
        if (isArithmetic(q) || isConversion(q)) return "calculation"
        if (isLiveInfo(q, lowerRaw)) return "live_info"
        // A "what is / explain" question about a named thing.
        if ((q.contains("samjhao") || q.contains("kya hai") || q.contains("ke baare") || q.contains("explain") || q.contains("what is")) &&
            !hasBusinessVocab(q)
        ) return "general_explain"
        return null
    }

    /** Live / current information — no local engine can know this, and
     *  it must never be invented. */
    fun isLiveInfo(q: String, lowerRaw: String): Boolean {
        val liveWords = listOf(
            "sone ka bhav", "gold price", "chandi ka bhav", "silver price",
            "mausam", "weather", "aaj ki khabar", "news", "taza khabar",
            "train", "flight", "petrol price", "diesel price", "stock price",
            "share price", "cricket score", "match", "aaj ka rate"
        )
        return liveWords.any { q.contains(it) || lowerRaw.contains(it) }
    }

    private val arithmeticRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(%\\s*of|plus|minus|guna|multiply|bhag|divide|\\+|-|\\*|x|×|/)\\s*(\\d+(?:\\.\\d+)?)")
    fun isArithmetic(q: String): Boolean = arithmeticRegex.containsMatchIn(q)
    private val conversionRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(km|m|cm|inch|kg|g|litre|ml)\\s*(me|mein|in|to)\\s*(m|cm|km|inch|g|kg|ml|litre)")
    fun isConversion(q: String): Boolean = conversionRegex.containsMatchIn(q)

    /** Topic of a message: service, named feature, or a life topic. */
    fun detectTopic(q: String, context: AiAssistantParser.AiConversationContext): String? {
        AiAssistantParser.detectService(q)?.let { return it.name.lowercase() }
        return when {
            q.contains("website") -> "website"
            q.contains("csc") || q.contains("cyber") -> "csc"
            q.contains("shop") || q.contains("dukaan") || q.contains("dukan") -> "shop"
            q.contains("kaam") -> "work"
            q.contains("checklist") -> context.lastPlanTopic ?: "work"
            q.contains("business") -> "business"
            else -> null
        }
    }

    private fun statementTopic(q: String): String? = when {
        q.contains("kaam") || q.contains("rush") || q.contains("shop") -> "work"
        q.contains("thak") || q.contains("tired") -> "tired"
        q.contains("khush") || q.contains("happy") -> "happy"
        q.contains("ghar") -> "home"
        else -> "general"
    }
}

/** Real checklists, built from the topic — rendered in chat and kept
 *  in the per-profile chat history, so they can be found again.
 *  A checklist is an ACTION (UPDATE 16), not a description of one. */
object ChecklistBuilder {

    fun build(topic: String?, lang: AiLanguage, context: AiAssistantParser.AiConversationContext): List<String> {
        return when (topic?.lowercase()) {
            "pan" -> listOf(
                "Customer ka Aadhaar card lo",
                "Passport-size photo lo",
                "Aadhaar se linked mobile number lo",
                "PAN form bharo — naam aur date Aadhaar jaisi hi likho",
                "Fee lo aur receipt do",
                "Application submit karo",
                "Acknowledgement number customer ko do",
                "Status check karo, card aane par print karke deliver karo"
            )
            "website" -> listOf(
                "Website ka purpose tay karo — dukaan ke liye ya kuch aur",
                "Pages ki list banao (Home, Services, Contact…)",
                "Design aur rang chuno",
                "Content likho — services, rate, contact",
                "Free hosting / domain options dekho",
                "Test karo, phir publish karo"
            )
            "aadhaar", "aadhar" -> listOf(
                "Customer ka purana Aadhaar card lo",
                "Kya update karna hai — naam, mobile, address ya photo?",
                "Sahi documents lo",
                "Update form bharo aur submit karo",
                "Acknowledgement slip customer ko do"
            )
            "work", "shop", "csc" -> listOf(
                "Pending jobs ki list dekho — kaunsi adhuri hai",
                "Kal ke customers ko yaad dilao",
                "Cash closing karo — Cash aur UPI alag-alag",
                "Money Transfer fund ka balance check karo",
                "Machine, kagaz aur ink check karo",
                "Kal subah sabse pehle pending kaam poora karo"
            )
            else -> listOf(
                "Kaam ki list banao",
                "Sabse zaroori kaam pehle likho",
                "Ek-ek karke poora karo",
                "Poora hote hi list se hatao"
            )
        }
    }
}

/**
 * Sentence fragments for the local composer — building blocks, never
 * whole canned answers. The composer assembles a reply from the
 * parsed meaning + live context, so the same words in a different
 * context get a different reply. Tables exist for the same 15
 * languages as MultilingualReplies; the other 8 fall back to Hinglish
 * (same documented limit as UPDATE 13). [get] picks a variant by a
 * hash of the message + context, so replies vary instead of repeating.
 */
object ConversationReplies {

    private val table: Map<String, Map<AiLanguage, List<String>>> = mapOf(
        "greeting" to mapOf(
            AiLanguage.HINGLISH to listOf(
                "Namaste bhai! Main badhiya hoon. Tum batao, aaj shop ka kaam kaisa chal raha hai?",
                "Arre bhai, namaste! Main theek hoon — tum sunao, aaj kya chal raha hai?"
            ),
            AiLanguage.ENGLISH to listOf(
                "Hello! I am doing well. Tell me, how is work at the shop going today?",
                "Hi there! I am fine — how is your day going?"
            ),
            AiLanguage.HINDI to listOf(
                "नमस्ते भाई! मैं बढ़िया हूँ। तुम बताओ, आज दुकान का काम कैसा चल रहा है?",
                "अरे भाई, नमस्ते! मैं ठीक हूँ — तुम सुनाओ, आज क्या चल रहा है?"
            ),
            AiLanguage.GUJARATI to listOf(
                "Namaste bhai! Hu majama chhu. Tame kaho, aaje shop nu kaam kevu chale chhe?",
                "Arre bhai, namaste! Hu theek chhu — tame kaho, aaje shu chale chhe?"
            ),
            AiLanguage.MARATHI to listOf(
                "Namaste bhai! Mi badhiya ahe. Tu sang, aaj dukaan che kaam kase chalu ahe?",
                "Arre bhai, namaste! Mi theek ahe — tu sang, aaj kay chalu ahe?"
            ),
            AiLanguage.BENGALI to listOf(
                "Namaste bhai! Ami bhalo achi. Tumi bolo, aaj dokan er kaaj kemon cholche?",
                "Arre bhai, namaste! Ami thik achi — tumi bolo, aaj ki cholche?"
            ),
            AiLanguage.PUNJABI to listOf(
                "Sat sri akal bhai! Main badhiya haan. Tusi dasso, aaj dukaan da kaam kiddan chal reha hai?",
                "Arre bhai, sat sri akal! Main theek haan — tusi dasso, aaj ki chal reha hai?"
            ),
            AiLanguage.TAMIL to listOf(
                "Vanakkam! Naan nalla irukken. Neenga sollunga, inniki kadai velai eppadi pogudhu?",
                "Vanakkam! Naan nalla irukken — ungalukku inniki eppadi pogudhu?"
            ),
            AiLanguage.TELUGU to listOf(
                "Namaste! Nenu bagunna. Meeru cheppandi, eeroju shop pani ela jarugutondi?",
                "Namaste! Nenu bagunna — meeru cheppandi, eeroju em chestunnaru?"
            ),
            AiLanguage.KANNADA to listOf(
                "Namaste! Naanu chennagiddeeni. Neenu heli, indu angadi kelasa hege naditide?",
                "Namaste! Naanu chennagiddeeni — neenu heli, indu enu naditide?"
            ),
            AiLanguage.MALAYALAM to listOf(
                "Namaste! Njan nannayi irikkunnu. Ningal parayu, innu kadayile pani engane pogunnu?",
                "Namaste! Njan nannayi irikkunnu — ningal parayu, innu enthu cheyyunnu?"
            ),
            AiLanguage.ODIA to listOf(
                "Namaste bhai! Mu bhalo achhi. Tume kuha, aji dokana kaama kemiti chaluchi?",
                "Namaste bhai! Mu thik achhi — tume kuha, aji kana chaluchi?"
            ),
            AiLanguage.ASSAMESE to listOf(
                "Namaste bhai! Moi bhal ase. Tumi kuwa, aji dokanor kaam kenekoi solise?",
                "Namaste bhai! Moi thik ase — tumi kuwa, aji ki solise?"
            ),
            AiLanguage.URDU to listOf(
                "Namaste bhai! Main badhiya hoon. Tum batao, aaj dukaan ka kaam kaisa chal raha hai?",
                "Arre bhai, namaste! Main theek hoon — tum sunao, aaj kya chal raha hai?"
            ),
            AiLanguage.NEPALI to listOf(
                "Namaste bhai! Ma badhiya chhu. Tapai bhannus, aaja pasal ko kaam kasto chaliraheko cha?",
                "Namaste bhai! Ma thik chhu — tapai bhannus, aaja ke chaliraheko cha?"
            )
        ),
        "howAreYou" to mapOf(
            AiLanguage.HINGLISH to listOf(
                "Main badhiya hoon bhai! Tum batao, sab kaisa chal raha hai?",
                "Main badhiya hoon! Tum batao, aaj shop ka kaam kaisa chal raha hai?"
            ),
            AiLanguage.ENGLISH to listOf(
                "I am doing great! Tell me, how are things going with you?",
                "I am fine! How is work going today?"
            ),
            AiLanguage.HINDI to listOf(
                "मैं बढ़िया हूँ भाई! तुम बताओ, सब कैसा चल रहा है?",
                "मैं बढ़िया हूँ! तुम बताओ, आज दुकान का काम कैसा चल रहा है?"
            ),
            AiLanguage.GUJARATI to listOf(
                "Hu majama chhu bhai! Tame kaho, badhu kevu chale chhe?",
                "Hu majama chhu! Tame kaho, aaje shop nu kaam kevu chale chhe?"
            ),
            AiLanguage.MARATHI to listOf(
                "Mi badhiya ahe bhai! Tu sang, sagla kase chalu ahe?",
                "Mi badhiya ahe! Tu sang, aaj dukaan che kaam kase chalu ahe?"
            ),
            AiLanguage.BENGALI to listOf(
                "Ami bhalo achi bhai! Tumi bolo, sob kemon cholche?",
                "Ami bhalo achi! Tumi bolo, aaj dokan er kaaj kemon cholche?"
            ),
            AiLanguage.PUNJABI to listOf(
                "Main badhiya haan bhai! Tusi dasso, sab kiddan chal reha hai?",
                "Main badhiya haan! Tusi dasso, aaj dukaan da kaam kiddan chal reha hai?"
            ),
            AiLanguage.TAMIL to listOf(
                "Naan nalla irukken! Neenga sollunga, ellam eppadi pogudhu?",
                "Naan nalla irukken! Neenga sollunga, inniki kadai velai eppadi pogudhu?"
            ),
            AiLanguage.TELUGU to listOf(
                "Nenu bagunna! Meeru cheppandi, anni ela jarugutunnayi?",
                "Nenu bagunna! Meeru cheppandi, eeroju shop pani ela jarugutondi?"
            ),
            AiLanguage.KANNADA to listOf(
                "Naanu chennagiddeeni! Neenu heli, ella hege naditide?",
                "Naanu chennagiddeeni! Neenu heli, indu angadi kelasa hege naditide?"
            ),
            AiLanguage.MALAYALAM to listOf(
                "Njan nannayi irikkunnu! Ningal parayu, ellam engane pogunnu?",
                "Njan nannayi irikkunnu! Ningal parayu, innu kadayile pani engane pogunnu?"
            ),
            AiLanguage.ODIA to listOf(
                "Mu bhalo achhi bhai! Tume kuha, sabu kemiti chaluchi?",
                "Mu bhalo achhi! Tume kuha, aji dokana kaama kemiti chaluchi?"
            ),
            AiLanguage.ASSAMESE to listOf(
                "Moi bhal ase bhai! Tumi kuwa, hokolu kenekoi solise?",
                "Moi bhal ase! Tumi kuwa, aji dokanor kaam kenekoi solise?"
            ),
            AiLanguage.URDU to listOf(
                "Main badhiya hoon bhai! Tum batao, sab kaisa chal raha hai?",
                "Main badhiya hoon! Tum batao, aaj dukaan ka kaam kaisa chal raha hai?"
            ),
            AiLanguage.NEPALI to listOf(
                "Ma badhiya chhu bhai! Tapai bhannus, sabai kasto chaliraheko cha?",
                "Ma badhiya chhu! Tapai bhannus, aaja pasal ko kaam kasto chaliraheko cha?"
            )
        ),
        "thanks" to mapOf(
            AiLanguage.HINGLISH to listOf("Koi baat nahi bhai, ye to mera kaam hai! Aur kuch chahiye ho to batao.", "Arre, shukriya ki kya baat hai — main hamesha yahin hoon. Aur batao?"),
            AiLanguage.ENGLISH to listOf("You are welcome! That is what I am here for. Anything else you need?", "No problem at all — happy to help. What is next?"),
            AiLanguage.HINDI to listOf("कोई बात नहीं भाई, ये तो मेरा काम है! और कुछ चाहिए हो तो बताओ।", "अरे, शुक्रिया की क्या बात है — मैं हमेशा यहीं हूँ। और बताओ?"),
            AiLanguage.GUJARATI to listOf("Kai vaandho nahi bhai, aa to maru kaam chhe! Biju kai joie to kaho.", "Arre, aabhar ni shu vaat chhe — hu hamesha ahiya chhu. Biju kaho?"),
            AiLanguage.MARATHI to listOf("Kai harkat nahi bhai, he tar maze kaam ahe! Ankin kahi hav asel tar sang.", "Arre, dhanyavad kashala — mi hamesha ithech ahe. Ankin sang?"),
            AiLanguage.BENGALI to listOf("Kono byapar na bhai, eta to amar kaaj! Ar kichu lagle bolo.", "Arre, dhonnobad kiser — ami sob somoy ekhanei achi. Ar bolo?"),
            AiLanguage.PUNJABI to listOf("Koi gal nahi bhai, eh taan mera kaam hai! Hor kuch chahida hove taan dasso.", "Arre, shukriya di ki gal hai — main hamesha ethe hi haan. Hor dasso?"),
            AiLanguage.TAMIL to listOf("Paravayillai! Idhu en velai. Vera edhavadhu vendum na sollunga.", "Dhanyavad vendam — naan eppodhum inge dhaan irukken. Vera sollunga?"),
            AiLanguage.TELUGU to listOf("Parvaledu! Idi naa pani. Inkemaina kavali ante cheppandi.", "Dhanyavadalu vaddu — nenu eppudu ikkade untanu. Inka cheppandi?"),
            AiLanguage.KANNADA to listOf("Parvagilla! Idu nanna kelasa. Inne edanna beku andre heli.", "Dhanyavad beda — naanu yavagalu illi iruttene. Inne heli?"),
            AiLanguage.MALAYALAM to listOf("Kuzhappamilla! Ithu ente pani aanu. Vere enthenkilum venamenkil parayu.", "Nanni venda — njan eppozhum ivide thanne undu. Vere parayu?"),
            AiLanguage.ODIA to listOf("Kichhi katha nahin bhai, eha ta mora kaama! Au kichhi darkar hele kuha.", "Arre, dhanyabad kahinki — mu sabubele ethhi achhi. Au kuha?"),
            AiLanguage.ASSAMESE to listOf("Kunu kotha nai bhai, eitu mur kaam! Aru kiba lagile kuwa.", "Arre, dhanyabad kio — moi hodai iyate asu. Aru kuwa?"),
            AiLanguage.URDU to listOf("Koi baat nahi bhai, ye to mera kaam hai! Aur kuch chahiye ho to batao.", "Arre, shukriya ki kya baat hai — main hamesha yahin hoon. Aur batao?"),
            AiLanguage.NEPALI to listOf("Kehi kura chaina bhai, yo ta mero kaam ho! Aru kehi chahiyo bhane bhannus.", "Arre, dhanyabad ko ke kura — ma hamesha yahin chhu. Aru bhannus?")
        ),
        "bored" to mapOf(
            AiLanguage.HINGLISH to listOf(
                "Toh kuch interesting karte hain! Gaane suno, kuch naya seekh lo — ya batao, main tumhe ek joke sunau ya koi business idea du?",
                "Bore ho raha hai to thoda break lo — walk par jao, music suno, ya kuch naya seekh lo. Batao, kya karna pasand karoge?"
            ),
            AiLanguage.ENGLISH to listOf(
                "Let us do something interesting! Listen to some music, learn something new — or shall I tell you a joke or share a business idea?",
                "If you are bored, take a small break — go for a walk, listen to music, or learn something new. What would you like to do?"
            ),
            AiLanguage.HINDI to listOf(
                "तो कुछ दिलचस्प करते हैं! गाने सुनो, कुछ नया सीख लो — या बताओ, मैं तुम्हें एक joke सुनाऊँ या कोई business idea दूँ?",
                "बोर हो रहा है तो थोड़ा break लो — walk पर जाओ, music सुनो, या कुछ नया सीख लो। बताओ, क्या करना पसंद करोगे?"
            ),
            AiLanguage.GUJARATI to listOf(
                "To kai rasprad karie! Gaana sambhalo, kai navu shikhi lo — ke kaho, hu tamne joke sambhalavu ke business idea aapu?",
                "Bore thay chhe to thodo break lo — walk par jao, music sambhalo, ke kai navu shikhi lo. Kaho, shu karvu gamse?"
            ),
            AiLanguage.MARATHI to listOf(
                "Tar kahi manoranjak karuya! Gaane aika, kahi navin shika — ki sang, mi tula joke sangu ki business idea deu?",
                "Bore hot asel tar thoda break ghe — walk la ja, music aik, ki kahi navin shik. Sang, kay karayla awadel?"
            ),
            AiLanguage.BENGALI to listOf(
                "Tahole kichu mojar kori! Gaan shuno, kichu notun shikho — na bolo, ami ki ekta joke shonabo na business idea debo?",
                "Bore lagche to ektu break nao — hatte jao, gaan shuno, na kichu notun shikho. Bolo, ki korte bhalo lagbe?"
            ),
            AiLanguage.PUNJABI to listOf(
                "Taan kuch dilchasp kariye! Gaane suno, kuch nava sikho — jaan dasso, main tuhanu joke sunavaan jaan business idea devaan?",
                "Bore ho reha hai taan thoda break lo — walk te jao, music suno, jaan kuch nava sikho. Dasso, ki karna pasand karoge?"
            ),
            AiLanguage.TAMIL to listOf(
                "Appo edhavadhu interesting seivom! Paatu kelu, pudhusa edhavadhu kathuko — joke sollava illa business idea tharava?",
                "Bore adikkudhu na konjam break edu — nadandhu po, music kelu, illa pudhusa edhavadhu kathuko. Enna seiya virumbureenga?"
            ),
            AiLanguage.TELUGU to listOf(
                "Mari edaina interesting cheddam! Paatalu vinu, kothaga emaina nerchuko — joke cheppana leda business idea ivvana?",
                "Bore kodutondi ante konchem break teesuko — walk ki vellu, music vinu, leda kothaga emaina nerchuko. Em cheyalanukuntunnaru?"
            ),
            AiLanguage.KANNADA to listOf(
                "Hagadre enadru interesting madona! Haadu kelu, hosadu enadru kaliri — joke helala athava business idea kodala?",
                "Bore agtide andre swalpa break tago — walk ge hogi, music kelu, athava hosadu enadru kaliri. Enu madalu ista?"
            ),
            AiLanguage.MALAYALAM to listOf(
                "Appol enthenkilum rasakaram cheyyam! Paattu kelu, pudhiya enthenkilum padikku — joke parayatteyo business idea tharatteyo?",
                "Bore adikkunnundel konjam break eduku — walkinu poku, music kelu, atho pudhiya enthenkilum padikku. Enthu cheyyan ishtam?"
            ),
            AiLanguage.ODIA to listOf(
                "Tebe kichhi mojar kariba! Gita suna, kichhi nua shikha — na kuha, mu joke kahibi ki business idea debi?",
                "Bore laguchi tebe tikie break nia — walk ku jao, music suna, ki kichhi nua shikha. Kuha, kana karibaku bhala lagiba?"
            ),
            AiLanguage.ASSAMESE to listOf(
                "Tetia kiba mojjar koru! Gaan hunua, kiba notun hikua — na kuwa, moi joke hunam ne business idea dim?",
                "Bore lagise tetia olop break lua — walk ot jua, gaan hunua, ne kiba notun hikua. Kuwa, ki koribo bhal lagibo?"
            ),
            AiLanguage.URDU to listOf(
                "Toh kuch dilchasp karte hain! Gaane suno, kuch naya seekh lo — ya batao, main tumhe ek joke sunau ya koi business idea du?",
                "Bore ho raha hai to thoda break lo — walk par jao, music suno, ya kuch naya seekh lo. Batao, kya karna pasand karoge?"
            ),
            AiLanguage.NEPALI to listOf(
                "Tyo bhaye kehi ramailo garam! Gaan sunus, kehi naya sika — ki bhannus, ma timilai joke sunau ki business idea diu?",
                "Bore bhairaheko cha bhane alik break liu — walk ma jau, music sunus, ki kehi naya sika. Bhannus, ke garna man parchha?"
            )
        ),
        "moodBad" to mapOf(
            AiLanguage.HINGLISH to listOf("Oh, samajh sakta hoon. Thoda break lo — chai pee lo, walk par jao. Main yahin hoon, jab mann kare baat kar lena."),
            AiLanguage.ENGLISH to listOf("I understand. Take a small break — have some tea, go for a walk. I am here whenever you want to talk."),
            AiLanguage.HINDI to listOf("ओह, समझ सकता हूँ। थोड़ा break लो — चाय पी लो, walk पर जाओ। मैं यहीं हूँ, जब मन करे बात कर लेना।"),
            AiLanguage.GUJARATI to listOf("Oh, samji shaku chhu. Thodo break lo — cha pee lo, walk par jao. Hu ahiya chhu, jyare mann kare vaat kari lejo."),
            AiLanguage.MARATHI to listOf("Oh, samju shakto. Thoda break ghe — cha pi, walk la ja. Mi ithech ahe, jevha vatla tevha bol."),
            AiLanguage.BENGALI to listOf("Oh, bujhte parchi. Ektu break nao — cha khao, hatte jao. Ami ekhanei achi, jokhon mon korbe kotha bolo."),
            AiLanguage.PUNJABI to listOf("Oh, samajh sakda haan. Thoda break lo — cha pi lo, walk te jao. Main ethe hi haan, jadon mann kare gal kar layo."),
            AiLanguage.TAMIL to listOf("Oh, puriyudhu. Konjam break edu — tea kudi, nadandhu po. Naan inge dhaan irukken, eppo venum na pesalam."),
            AiLanguage.TELUGU to listOf("Oh, ardham ayyindi. Konchem break teesuko — tea tagu, walk ki vellu. Nenu ikkade untanu, eppudu kavali ante matladu."),
            AiLanguage.KANNADA to listOf("Oh, artha agutte. Swalpa break tago — cha kudi, walk ge hogi. Naanu illi iruttene, yavaga beku andre matadi."),
            AiLanguage.MALAYALAM to listOf("Oh, manassilayi. Konjam break eduku — chaya kudikku, walkinu poku. Njan ivide thanne undu, eppozhum samsarikam."),
            AiLanguage.ODIA to listOf("Oh, bujhi paruchi. Tikie break nia — cha pia, walk ku jao. Mu ethhi achhi, jetebele mana kale katha haba."),
            AiLanguage.ASSAMESE to listOf("Oh, bujibo paru. Olop break lua — cha khua, walk ot jua. Moi iyate asu, jetia mon kore kotha patiba."),
            AiLanguage.URDU to listOf("Oh, samajh sakta hoon. Thoda break lo — chai pee lo, walk par jao. Main yahin hoon, jab mann kare baat kar lena."),
            AiLanguage.NEPALI to listOf("Oh, bujhna sakchhu. Alik break liu — chiya pius, walk ma jau. Ma yahin chhu, jaba man lagyo kura garam.")
        ),
        "askAnything" to mapOf(
            AiLanguage.HINGLISH to listOf("Haan, zaroor poochiye — main sun raha hoon. Kya baat hai?", "Bilkul, poochiye! Main yahin hoon, batao kya poochna hai?"),
            AiLanguage.ENGLISH to listOf("Yes, please ask — I am listening. What is it?", "Of course, ask away! I am here — what do you want to know?"),
            AiLanguage.HINDI to listOf("हाँ, ज़रूर पूछिए — मैं सुन रहा हूँ। क्या बात है?", "बिल्कुल, पूछिए! मैं यहीं हूँ, बताओ क्या पूछना है?"),
            AiLanguage.GUJARATI to listOf("Haan, jaroor poochho — hu sambhali rahyo chhu. Shu vaat chhe?", "Bilkul, poochho! Hu ahiya chhu, kaho shu poochhvu chhe?"),
            AiLanguage.MARATHI to listOf("Ho, nakki vichar — mi aikat ahe. Kay gosht ahe?", "Bilkul, vichar! Mi ithech ahe, sang kay vicharayche ahe?"),
            AiLanguage.BENGALI to listOf("Hyaan, nishchoi jiggasha koro — ami shunchi. Ki byapar?", "Bilkul, jiggasha koro! Ami ekhanei achi, bolo ki jante chao?"),
            AiLanguage.PUNJABI to listOf("Haan, zaroor puchho — main sun reha haan. Ki gal hai?", "Bilkul, puchho! Main ethe hi haan, dasso ki puchhna hai?"),
            AiLanguage.TAMIL to listOf("Aama, kandippa kelu — naan ketkiren. Enna vishayam?", "Kandippa, kelu! Naan inge dhaan irukken — enna theriyum?"),
            AiLanguage.TELUGU to listOf("Avunu, tappakunda adugu — nenu vintunna. Emiti?", "Tappakunda, adugu! Nenu ikkade unnanu — em telusukovalani undi?"),
            AiLanguage.KANNADA to listOf("Houdu, khandita kelu — naanu keluttiddeeni. Enu vishaya?", "Khandita, kelu! Naanu illi iddeeni — enu tiliyabeku?"),
            AiLanguage.MALAYALAM to listOf("Athe, nischayam chodiku — njan kelkunnundu. Enthaanu karyam?", "Nischayam, chodiku! Njan ivide thanne undu — enthaanu ariyendathu?"),
            AiLanguage.ODIA to listOf("Haan, nischaya pacharantu — mu shunuchi. Kana katha?", "Bilkul, pacharantu! Mu ethhi achhi, kuha kana pacharibaku chahucha?"),
            AiLanguage.ASSAMESE to listOf("Hoi, nishchoi hudha — moi hunisu. Ki kotha?", "Bilkul, hudha! Moi iyate asu, kuwa ki hudi bo khujo?"),
            AiLanguage.URDU to listOf("Haan, zaroor poochiye — main sun raha hoon. Kya baat hai?", "Bilkul, poochiye! Main yahin hoon, batao kya poochna hai?"),
            AiLanguage.NEPALI to listOf("Ho, nishchaya sodhnus — ma suniraheko chhu. Ke kura ho?", "Bilkul, sodhnus! Ma yahin chhu, bhannus ke sodhna chahanchha?")
        ),
        "whatDoing" to mapOf(
            AiLanguage.HINGLISH to listOf("Main yahin hoon, tumhari madad ke liye taiyaar — batao, aaj kya karna hai?", "Bas tumhara intezaar kar raha tha! Batao, kya kaam hai?"),
            AiLanguage.ENGLISH to listOf("I am right here, ready to help you — tell me, what do we need to do today?", "Just waiting for you! Tell me, what is the task?"),
            AiLanguage.HINDI to listOf("मैं यहीं हूँ, तुम्हारी मदद के लिए तैयार — बताओ, आज क्या करना है?", "बस तुम्हारा इंतज़ार कर रहा था! बताओ, क्या काम है?"),
            AiLanguage.GUJARATI to listOf("Hu ahiya chhu, tamari madad mate taiyaar — kaho, aaje shu karvanu chhe?", "Bas tamaro intezaar karto hato! Kaho, shu kaam chhe?"),
            AiLanguage.MARATHI to listOf("Mi ithech ahe, tuzya madatisathi tayyar — sang, aaj kay karayche ahe?", "Bas tuzi vaat pahat hoto! Sang, kay kaam ahe?"),
            AiLanguage.BENGALI to listOf("Ami ekhanei achi, tomar sahajjer jonno prostut — bolo, aaj ki korte hobe?", "Bas tomar opekkha korchilam! Bolo, ki kaaj ache?"),
            AiLanguage.PUNJABI to listOf("Main ethe hi haan, tuhadi madad layi taiyaar — dasso, aaj ki karna hai?", "Bas tuhada intezaar kar reha si! Dasso, ki kaam hai?"),
            AiLanguage.TAMIL to listOf("Naan inge dhaan irukken, ungalukku udhava thayar — sollunga, inniki enna seiyanum?", "Ungalukkaga dhaan kaathirundhen! Sollunga, enna velai?"),
            AiLanguage.TELUGU to listOf("Nenu ikkade unnanu, meeku sahayam cheyadaniki siddham — cheppandi, eeroju em cheyali?", "Meekosame eduru chustunna! Cheppandi, em pani?"),
            AiLanguage.KANNADA to listOf("Naanu illi iddeeni, nimma sahayakke siddha — heli, indu enu madabeku?", "Nimagagi kaayuttidde! Heli, enu kelasa?"),
            AiLanguage.MALAYALAM to listOf("Njan ivide thanne undu, ningalude sahayathinu thayar — parayu, innu enthu cheyyanam?", "Ningalkkayi kaathirikkukayayirunnu! Parayu, enthu pani?"),
            AiLanguage.ODIA to listOf("Mu ethhi achhi, tumara sahajya paain prostuta — kuha, aji kana karibaku achhi?", "Bas tumara apekshya karuthili! Kuha, kana kaama achhi?"),
            AiLanguage.ASSAMESE to listOf("Moi iyate asu, tumar hohaior babe prostut — kuwa, aji ki koribo lagibo?", "Bas tumar babe roi asilu! Kuwa, ki kaam ase?"),
            AiLanguage.URDU to listOf("Main yahin hoon, tumhari madad ke liye taiyaar — batao, aaj kya karna hai?", "Bas tumhara intezaar kar raha tha! Batao, kya kaam hai?"),
            AiLanguage.NEPALI to listOf("Ma yahin chhu, tapai ko sahayog ko lagi tayar — bhannus, aaja ke garne ho?", "Bas tapai ko parkhiraheko thie! Bhannus, ke kaam cha?")
        ),
        "whoAmI" to mapOf(
            AiLanguage.HINGLISH to listOf("Main BizKhata AI Assistant hoon — tumhara personal + business assistant. Dukaan ka hisab, customers, agents, reports — aur normal baatein bhi, sab mein madad kar sakta hoon."),
            AiLanguage.ENGLISH to listOf("I am BizKhata AI Assistant — your personal + business assistant. Shop accounts, customers, agents, reports — and normal conversation too, I can help with all of it."),
            AiLanguage.HINDI to listOf("मैं BizKhata AI Assistant हूँ — तुम्हारा personal + business assistant। दुकान का हिसाब, customers, agents, reports — और normal बातें भी, सब में मदद कर सकता हूँ।"),
            AiLanguage.GUJARATI to listOf("Hu BizKhata AI Assistant chhu — tamaro personal + business assistant. Dukaan no hisab, customers, agents, reports — ane normal vaato pan, badha ma madad kari shaku chhu."),
            AiLanguage.MARATHI to listOf("Mi BizKhata AI Assistant ahe — tuza personal + business assistant. Dukaan cha hisab, customers, agents, reports — ani normal gappa suddha, saglyat madat karu shakto."),
            AiLanguage.BENGALI to listOf("Ami BizKhata AI Assistant — tomar personal + business assistant. Dokan er hisab, customers, agents, reports — ar normal kotha o, sobete sahajjo korte pari."),
            AiLanguage.PUNJABI to listOf("Main BizKhata AI Assistant haan — tuhada personal + business assistant. Dukaan da hisab, customers, agents, reports — te normal gallan vi, sab vich madad kar sakda haan."),
            AiLanguage.TAMIL to listOf("Naan BizKhata AI Assistant — ungal personal + business assistant. Kadai kanakku, customers, agents, reports — matrum sadharan pesu, ellathilum udhavalam."),
            AiLanguage.TELUGU to listOf("Nenu BizKhata AI Assistant — mee personal + business assistant. Shop lekkalu, customers, agents, reports — mariyu sadharan matalu, anni vishayallo sahayam cheyagalanu."),
            AiLanguage.KANNADA to listOf("Naanu BizKhata AI Assistant — nimma personal + business assistant. Angadi lekkha, customers, agents, reports — mattu sadharan matu, elladallu sahaya madabahudu."),
            AiLanguage.MALAYALAM to listOf("Njan BizKhata AI Assistant — ningalude personal + business assistant. Kadayile kanakku, customers, agents, reports — matrum sadharan samsaram, ellathilum sahayikam."),
            AiLanguage.ODIA to listOf("Mu BizKhata AI Assistant — tumara personal + business assistant. Dokana hisab, customers, agents, reports — au sadharan katha bi, sabuthire sahajya kariparibi."),
            AiLanguage.ASSAMESE to listOf("Moi BizKhata AI Assistant — tumar personal + business assistant. Dokanor hisab, customers, agents, reports — aru sadharan kotha u, hokolute hohai koribo paru."),
            AiLanguage.URDU to listOf("Main BizKhata AI Assistant hoon — tumhara personal + business assistant. Dukaan ka hisab, customers, agents, reports — aur normal baatein bhi, sab mein madad kar sakta hoon."),
            AiLanguage.NEPALI to listOf("Ma BizKhata AI Assistant hun — tapai ko personal + business assistant. Pasal ko hisab, customers, agents, reports — aru samanya kura pani, sabai ma madat garna sakchhu.")
        ),
        "farewell" to mapOf(
            AiLanguage.HINGLISH to listOf("Bye bhai! Kaam ho to phir aana — main yahin hoon."),
            AiLanguage.ENGLISH to listOf("Bye! Come back whenever you need anything — I will be here."),
            AiLanguage.HINDI to listOf("बाय भाई! काम हो तो फिर आना — मैं यहीं हूँ।"),
            AiLanguage.GUJARATI to listOf("Bye bhai! Kaam hoy to phari aavjo — hu ahiya chhu."),
            AiLanguage.MARATHI to listOf("Bye bhai! Kaam asel tar parat ye — mi ithech ahe."),
            AiLanguage.BENGALI to listOf("Bye bhai! Kaaj thakle abar esho — ami ekhanei achi."),
            AiLanguage.PUNJABI to listOf("Bye bhai! Kaam hove taan phir aao — main ethe hi haan."),
            AiLanguage.TAMIL to listOf("Bye! Velai irundha thirumba vanga — naan inge dhaan irukken."),
            AiLanguage.TELUGU to listOf("Bye! Pani unte malli randi — nenu ikkade untanu."),
            AiLanguage.KANNADA to listOf("Bye! Kelasa idre matti banni — naanu illi iruttene."),
            AiLanguage.MALAYALAM to listOf("Bye! Pani undel veendum varu — njan ivide thanne undu."),
            AiLanguage.ODIA to listOf("Bye bhai! Kaama thile puni aasa — mu ethhi achhi."),
            AiLanguage.ASSAMESE to listOf("Bye bhai! Kaam thakile akou aha — moi iyate asu."),
            AiLanguage.URDU to listOf("Bye bhai! Kaam ho to phir aana — main yahin hoon."),
            AiLanguage.NEPALI to listOf("Bye bhai! Kaam bhayo bhane pheri aaus — ma yahin chhu.")
        ),
        "planOpener" to mapOf(
            AiLanguage.HINGLISH to listOf("Achha!"),
            AiLanguage.ENGLISH to listOf("Nice!"),
            AiLanguage.HINDI to listOf("अच्छा!"),
            AiLanguage.GUJARATI to listOf("Sarasa!"),
            AiLanguage.MARATHI to listOf("Chhan!"),
            AiLanguage.BENGALI to listOf("Bhalo!"),
            AiLanguage.PUNJABI to listOf("Changa!"),
            AiLanguage.TAMIL to listOf("Nalla vishayam!"),
            AiLanguage.TELUGU to listOf("Bagundi!"),
            AiLanguage.KANNADA to listOf("Chennagi!"),
            AiLanguage.MALAYALAM to listOf("Nannayi!"),
            AiLanguage.ODIA to listOf("Bhala!"),
            AiLanguage.ASSAMESE to listOf("Bhal!"),
            AiLanguage.URDU to listOf("Achha!"),
            AiLanguage.NEPALI to listOf("Ramro!")
        ),
        "tomorrowWord" to mapOf(
            AiLanguage.HINGLISH to listOf("Kal"),
            AiLanguage.ENGLISH to listOf("Tomorrow"),
            AiLanguage.HINDI to listOf("कल"),
            AiLanguage.GUJARATI to listOf("Kaale"),
            AiLanguage.MARATHI to listOf("Udya"),
            AiLanguage.BENGALI to listOf("Kaal"),
            AiLanguage.PUNJABI to listOf("Kall"),
            AiLanguage.TAMIL to listOf("Naalai"),
            AiLanguage.TELUGU to listOf("Repu"),
            AiLanguage.KANNADA to listOf("Naale"),
            AiLanguage.MALAYALAM to listOf("Naale"),
            AiLanguage.ODIA to listOf("Kali"),
            AiLanguage.ASSAMESE to listOf("Kali"),
            AiLanguage.URDU to listOf("Kal"),
            AiLanguage.NEPALI to listOf("Bholi")
        ),
        "planPhrase" to mapOf(
            AiLanguage.HINGLISH to listOf("ka kaam karna hai."),
            AiLanguage.ENGLISH to listOf("is the work to do."),
            AiLanguage.HINDI to listOf("का काम करना है।"),
            AiLanguage.GUJARATI to listOf("nu kaam karvanu chhe."),
            AiLanguage.MARATHI to listOf("che kaam karayche ahe."),
            AiLanguage.BENGALI to listOf("er kaaj korte hobe."),
            AiLanguage.PUNJABI to listOf("da kaam karna hai."),
            AiLanguage.TAMIL to listOf("velai seiyanum."),
            AiLanguage.TELUGU to listOf("pani cheyali."),
            AiLanguage.KANNADA to listOf("kelasa madabeku."),
            AiLanguage.MALAYALAM to listOf("pani cheyyanam."),
            AiLanguage.ODIA to listOf("kaama karibaku achhi."),
            AiLanguage.ASSAMESE to listOf("kaam koribo lagibo."),
            AiLanguage.URDU to listOf("ka kaam karna hai."),
            AiLanguage.NEPALI to listOf("ko kaam garne ho.")
        ),
        "planOffer" to mapOf(
            AiLanguage.HINGLISH to listOf("Agar chaho toh main tumhare liye kaam ki checklist bhi bana sakta hoon — bas bol do."),
            AiLanguage.ENGLISH to listOf("If you like, I can also make a checklist for this work — just say the word."),
            AiLanguage.HINDI to listOf("अगर चाहो तो मैं तुम्हारे लिए काम की checklist भी बना सकता हूँ — बस बोल दो।"),
            AiLanguage.GUJARATI to listOf("Jo joie to hu tamara mate kaam ni checklist pan banavi shaku chhu — bas kahi do."),
            AiLanguage.MARATHI to listOf("Hava asel tar mi tuzyasathi kamachi checklist suddha banavu shakto — bas sang."),
            AiLanguage.BENGALI to listOf("Chaile ami tomar jonno kaajer checklist o baniye dite pari — bas bolo."),
            AiLanguage.PUNJABI to listOf("Je chaho taan main tuhade layi kamm di checklist vi bana sakda haan — bas bol do."),
            AiLanguage.TAMIL to listOf("Virumbinaal indha velaikku checklist kooda naan seidhu thara mudiyum — sollunga."),
            AiLanguage.TELUGU to listOf("Mee ishtamaithe ee paniki checklist kuda nenu chesi ivvagalanu — cheppandi."),
            AiLanguage.KANNADA to listOf("Bekadre ee kelasakke checklist nu naanu madi kodabahudu — heli."),
            AiLanguage.MALAYALAM to listOf("Ishtamenkil ee panikku checklist kuda njan undakki tharam — parayu."),
            AiLanguage.ODIA to listOf("Chaile mu tumara kaama checklist bi banaidebi — bas kuha."),
            AiLanguage.ASSAMESE to listOf("Bisaraile moi tumar kaamor checklist u banai dibo paru — bas kuwa."),
            AiLanguage.URDU to listOf("Agar chaho toh main tumhare liye kaam ki checklist bhi bana sakta hoon — bas bol do."),
            AiLanguage.NEPALI to listOf("Chahiyo bhane ma tapai ko lagi kaam ko checklist pani banauna sakchhu — bas bhannus.")
        ),
        "statementBusy" to mapOf(
            AiLanguage.HINGLISH to listOf(
                "Achha, aaj shop par kaafi rush tha kya? Kaunsi service mein sabse zyada kaam tha?",
                "Oh, aaj kaam bahut tha! Thoda rest kar lo — batao, kal ke liye kuch plan karna hai?"
            ),
            AiLanguage.ENGLISH to listOf(
                "Oh, was the shop very busy today? Which service had the most work?",
                "Oh, a lot of work today! Take some rest — tell me, shall we plan anything for tomorrow?"
            ),
            AiLanguage.HINDI to listOf(
                "अच्छा, आज दुकान पर काफी rush था क्या? किस service में सबसे ज़्यादा काम था?",
                "ओह, आज काम बहुत था! थोड़ा rest कर लो — बताओ, कल के लिए कुछ plan करना है?"
            ),
            AiLanguage.GUJARATI to listOf(
                "Achha, aaje shop par ghani bheed hati? Kai service ma sauthi vadhu kaam hatu?",
                "Oh, aaje kaam ghano hatu! Thodo aaram kari lo — kaho, kaale mate kai plan karvu chhe?"
            ),
            AiLanguage.MARATHI to listOf(
                "Achha, aaj dukaanat khup gardi hoti ka? Kontya sevet sarvat jast kaam hote?",
                "Oh, aaj kaam khup hote! Thoda aaram kar — sang, udya sathi kahi plan karayche ahe ka?"
            ),
            AiLanguage.BENGALI to listOf(
                "Achha, aaj dokane khub bhir chilo ki? Kon service e sobcheye beshi kaaj chilo?",
                "Oh, aaj kaaj khub chilo! Ektu rest nao — bolo, kaal er jonno kichu plan korte hobe?"
            ),
            AiLanguage.PUNJABI to listOf(
                "Achha, aaj dukaan te bahut rush si kya? Kis service vich sab to zyada kaam si?",
                "Oh, aaj kaam bahut si! Thoda rest kar lo — dasso, kall layi kuch plan karna hai?"
            ),
            AiLanguage.TAMIL to listOf(
                "Oh, inniki kadaila romba koottam ah? Endha service la adhiga velai irundhadhu?",
                "Oh, inniki velai romba! Konjam rest edu — sollunga, naalaikku edhavadhu plan seiyalama?"
            ),
            AiLanguage.TELUGU to listOf(
                "Oh, eeroju shop lo chala rush unda? Ye service lo ekkuva pani undi?",
                "Oh, eeroju pani chala undi! Konchem rest teesuko — cheppandi, repu kosam emaina plan cheyala?"
            ),
            AiLanguage.KANNADA to listOf(
                "Oh, indu angadiyalli tumba jana iddara? Yava service nalli hechhu kelasa ittu?",
                "Oh, indu kelasa tumba ittu! Swalpa rest tago — heli, naalege enadru plan madona?"
            ),
            AiLanguage.MALAYALAM to listOf(
                "Oh, innu kadayil valare thirakkayirunno? Ethu service ilaanu ettavum kooduthal pani undayirunnathu?",
                "Oh, innu pani valare undayirunnu! Konjam rest eduku — parayu, naale kku enthenkilum plan cheyyano?"
            ),
            AiLanguage.ODIA to listOf(
                "Achha, aji dokanare bahuta bhid thila ki? Kou service re sabuthu beshi kaama thila?",
                "Oh, aji kaama bahuta thila! Tikie rest nia — kuha, kali pain kichhi plan karibaku achhi ki?"
            ),
            AiLanguage.ASSAMESE to listOf(
                "Achha, aji dokanot bahut bhir asil ne? Kun service ot hobotkoi beshi kaam asil?",
                "Oh, aji kaam bahut asil! Olop rest lua — kuwa, kali r babe kiba plan koribo lagibo ne?"
            ),
            AiLanguage.URDU to listOf(
                "Achha, aaj dukaan par kaafi rush tha kya? Kis service mein sabse zyada kaam tha?",
                "Oh, aaj kaam bahut tha! Thoda rest kar lo — batao, kal ke liye kuch plan karna hai?"
            ),
            AiLanguage.NEPALI to listOf(
                "Achha, aaja pasal ma dherai bhid thiyo ki? Kun service ma sabai bhanda dherai kaam thiyo?",
                "Oh, aaja kaam dherai thiyo! Alik rest gar — bhannus, bholi ko lagi kehi plan garne ho?"
            )
        ),
        "statementGeneric" to mapOf(
            AiLanguage.HINGLISH to listOf("Achha, samajh gaya. Aur batao, aaj aur kya hua?", "Theek hai, sun liya. Batao, isme main tumhari kya madad kar sakta hoon?"),
            AiLanguage.ENGLISH to listOf("Okay, understood. Tell me more — what else happened today?", "Alright, noted. Tell me, how can I help with this?"),
            AiLanguage.HINDI to listOf("अच्छा, समझ गया। और बताओ, आज और क्या हुआ?", "ठीक है, सुन लिया। बताओ, इसमें मैं तुम्हारी क्या मदद कर सकता हूँ?"),
            AiLanguage.GUJARATI to listOf("Sarasa, samjai gayo. Biju kaho, aaje biju shu thayu?", "Theek chhe, sambhali leedhu. Kaho, aa ma hu tamari shu madad kari shaku?"),
            AiLanguage.MARATHI to listOf("Chhan, samajle. Ankin sang, aaj ankin kay zhale?", "Theek ahe, aikle. Sang, yaat mi tuzi kay madat karu shakto?"),
            AiLanguage.BENGALI to listOf("Achha, bujhlam. Ar bolo, aaj ar ki holo?", "Thik ache, shunlam. Bolo, ete ami tomar ki sahajjo korte pari?"),
            AiLanguage.PUNJABI to listOf("Achha, samajh gaya. Hor dasso, aaj hor ki hoya?", "Theek hai, sun leya. Dasso, is vich main tuhadi ki madad kar sakda haan?"),
            AiLanguage.TAMIL to listOf("Sari, purinjiduchu. Vera sollunga, inniki vera enna nadandhadhu?", "Sari, ketten. Sollunga, idhula naan ungalukku eppadi udhavalam?"),
            AiLanguage.TELUGU to listOf("Sare, ardham ayyindi. Inka cheppandi, eeroju inka em jarigindi?", "Sare, vinnanu. Cheppandi, deeni lo nenu meeku ela sahayam cheyagalanu?"),
            AiLanguage.KANNADA to listOf("Sari, artha aayitu. Inne heli, indu inne enu aayitu?", "Sari, kelide. Heli, idaralli naanu nimge hege sahaya madabahudu?"),
            AiLanguage.MALAYALAM to listOf("Sheri, manassilayi. Vere parayu, innu vere enthu sambhavichu?", "Sheri, kettu. Parayu, ithil njan ningalkku engane sahayikam?"),
            AiLanguage.ODIA to listOf("Achha, bujhili. Au kuha, aji au kana hela?", "Thik achhi, sunili. Kuha, ethire mu tumara kana sahajya kariparibi?"),
            AiLanguage.ASSAMESE to listOf("Achha, bujilu. Aru kuwa, aji aru ki hol?", "Thik ase, hunilu. Kuwa, eitu moi tumar ki hohai koribo paru?"),
            AiLanguage.URDU to listOf("Achha, samajh gaya. Aur batao, aaj aur kya hua?", "Theek hai, sun liya. Batao, isme main tumhari kya madad kar sakta hoon?"),
            AiLanguage.NEPALI to listOf("Ramro, bujhe. Aru bhannus, aaja aru ke bhayo?", "Thik cha, sune. Bhannus, yasma ma tapai lai kasari madat garna sakchhu?")
        ),
        "languageConfirm" to mapOf(
            AiLanguage.HINGLISH to listOf("Jaroor! Ab se main aapse {language} mein baat karunga. Batao, kya samjhau?"),
            AiLanguage.ENGLISH to listOf("Of course! From now on I will talk to you in {language}. Tell me, what shall I explain?"),
            AiLanguage.HINDI to listOf("ज़रूर! अब से मैं आपसे {language} में बात करूँगा। बताओ, क्या समझाऊँ?"),
            AiLanguage.GUJARATI to listOf("જરૂર! હવેથી હું તમારી સાથે {language}માં વાત કરીશ. કહો, શું સમજાવું?"),
            AiLanguage.MARATHI to listOf("Nakki! Aata pasun mi tumchyashi {language} madhe boleen. Sang, kay samjavoo?"),
            AiLanguage.BENGALI to listOf("Nishchoi! Ekhon theke ami tomar sathe {language} te kotha bolbo. Bolo, ki bojhabo?"),
            AiLanguage.PUNJABI to listOf("Zaroor! Hun to main tuhade naal {language} vich gal karanga. Dasso, ki samjhavaan?"),
            AiLanguage.TAMIL to listOf("Kandippa! Indha nimisham irundhu naan ungaludan {language} il dhaan pesuven. Sollunga, enna vilakkavendum?"),
            AiLanguage.TELUGU to listOf("Tappakunda! Ippati nunchi nenu meetho {language} lo matladatanu. Cheppandi, em vivarinchali?"),
            AiLanguage.KANNADA to listOf("Khandita! Igainda naanu nimjote {language} nalli mataduttene. Heli, enu vivarisabeku?"),
            AiLanguage.MALAYALAM to listOf("Nischayam! Ippol muthal njan ningalodu {language} il samsarikkum. Parayu, enthaanu vilakkarikkendathu?"),
            AiLanguage.ODIA to listOf("Nischaya! Ebe tharu mu tumo sahita {language} re katha hebi. Kuha, kana bujhaibi?"),
            AiLanguage.ASSAMESE to listOf("Nishchoi! Etia pora moi tumar logot {language} ot kotha patim. Kuwa, ki bujam?"),
            AiLanguage.URDU to listOf("Zaroor! Ab se main aapse {language} mein baat karunga. Batao, kya samjhau?"),
            AiLanguage.NEPALI to listOf("Nishchaya! Aba dekhi ma tapai sanga {language} ma kura garchhu. Bhannus, ke bujhaun?")
        ),
        "checklistIntro" to mapOf(
            AiLanguage.HINGLISH to listOf("Ye lo, kaam ki checklist — ek-ek karke poora karo:"),
            AiLanguage.ENGLISH to listOf("Here is the checklist for the work — go through it one by one:"),
            AiLanguage.HINDI to listOf("ये लो, काम की checklist — एक-एक करके पूरा करो:"),
            AiLanguage.GUJARATI to listOf("Aa lo, kaam ni checklist — ek-ek kari ne poori karo:"),
            AiLanguage.MARATHI to listOf("Ghe, kamachi checklist — ek-ek karun purna kar:"),
            AiLanguage.BENGALI to listOf("Ei nao, kaajer checklist — ek-ek kore shesh koro:"),
            AiLanguage.PUNJABI to listOf("Eh lo, kamm di checklist — ikk-ikk karke poori karo:"),
            AiLanguage.TAMIL to listOf("Idho, velai checklist — onnonna seidhu mudinga:"),
            AiLanguage.TELUGU to listOf("Idigo, paniki checklist — okkokkati chesi purthi cheyandi:"),
            AiLanguage.KANNADA to listOf("Ido, kelasada checklist — ondondu madi mugisi:"),
            AiLanguage.MALAYALAM to listOf("Itho, paniyude checklist — onnonnayi cheithu theerkku:"),
            AiLanguage.ODIA to listOf("E nia, kaama checklist — gote-gote kari sampurna kara:"),
            AiLanguage.ASSAMESE to listOf("Ei lua, kaamor checklist — eta-eta kori xomponno kora:"),
            AiLanguage.URDU to listOf("Ye lo, kaam ki checklist — ek-ek karke poora karo:"),
            AiLanguage.NEPALI to listOf("Yo liu, kaam ko checklist — ek-ek gardai pura gar:")
        ),
        "honestLimitation" to mapOf(
            AiLanguage.HINGLISH to listOf("Maaf kijiye — ye main abhi theek se samajh nahi paya. Zara phir se, thoda detail mein batao, main koshish karunga."),
            AiLanguage.ENGLISH to listOf("Sorry — I could not understand this properly right now. Please tell me again with a little more detail, and I will try."),
            AiLanguage.HINDI to listOf("माफ़ कीजिए — ये मैं अभी ठीक से समझ नहीं पाया। ज़रा फिर से, थोड़ा detail में बताओ, मैं कोशिश करूँगा।"),
            AiLanguage.GUJARATI to listOf("Maaf karjo — aa hu hamana barabar samji shakyo nathi. Phari thi, thodi detail ma kaho, hu koshish karish."),
            AiLanguage.MARATHI to listOf("Maaf kara — he mi aata barobar samju shaklo nahi. Punha, thodi savistar sanga, mi prayatna karen."),
            AiLanguage.BENGALI to listOf("Dukkhito — eta ami ekhon thik moto bujhte parlam na. Abar, ektu bistarito kore bolo, ami chesta korbo."),
            AiLanguage.PUNJABI to listOf("Maaf karo — eh main hun theek tarah samajh nahi paya. Phir to, thoda detail vich dasso, main koshish karanga."),
            AiLanguage.TAMIL to listOf("Mannikavum — idhu enakku ippo sariya puriyala. Konjam virivaga sollunga, naan muyarchi seiren."),
            AiLanguage.TELUGU to listOf("Kshaminchandi — idi nenu ippudu sarigga ardham chesukoledu. Malli, konchem vivaramga cheppandi, nenu prayatnisthanu."),
            AiLanguage.KANNADA to listOf("Kshamisi — idu nanage iga sariyagi artha agalilla. Matte, swalpa vivaravagi heli, naanu prayatna maduttene."),
            AiLanguage.MALAYALAM to listOf("Kshamiku — ithu enikku ippol sariyayi manassilayilla. Veendum, konjam vishadamayi parayu, njan sramikkam."),
            AiLanguage.ODIA to listOf("Kshama karantu — eha mu ebe thik bhabare bujhi parilini. Thare, tikie bistarare kuha, mu chesta karibi."),
            AiLanguage.ASSAMESE to listOf("Khyama koribo — eitu moi etia thik mote bujibo pora nai. Akou, olop bishorai kuwa, moi sesta korim."),
            AiLanguage.URDU to listOf("Maaf kijiye — ye main abhi theek se samajh nahi paya. Zara phir se, thoda detail mein batao, main koshish karunga."),
            AiLanguage.NEPALI to listOf("Maaf garnus — yo ma ahile thik sanga bujhna sakina. Phir se, alik vistarma bhannus, ma prayas garchhu.")
        ),
        "liveInfoLimitation" to mapOf(
            AiLanguage.HINGLISH to listOf("Iska live / aaj ka rate mere paas abhi nahi hai — main live jaankari nahi de sakta, isliye andaze se kuch nahi bataunga. Official app ya website par aaj ka rate check kar lo."),
            AiLanguage.ENGLISH to listOf("I do not have the live / today's rate for this right now — I cannot give live information, so I will not guess. Please check today's rate on the official app or website."),
            AiLanguage.HINDI to listOf("इसका live / आज का rate मेरे पास अभी नहीं है — मैं live जानकारी नहीं दे सकता, इसलिए अंदाज़े से कुछ नहीं बताऊँगा। Official app या website पर आज का rate check कर लो।"),
            AiLanguage.GUJARATI to listOf("Aa nu live / aaj nu rate mara pase hamana nathi — hu live jaankari aapi shaku nathi, etle andaje kai nahi kahish. Official app ke website par aaj nu rate check kari lo."),
            AiLanguage.MARATHI to listOf("Yacha live / aajcha rate mazya kade aata nahi — mi live mahiti deu shakat nahi, mhanun andajane kahi sangnar nahi. Official app kiwa website var aajcha rate tapasun ghe."),
            AiLanguage.BENGALI to listOf("Etar live / aajker rate amar kache ekhon nei — ami live tottho dite pari na, tai andaje kichu bolbo na. Official app ba website e aajker rate dekhe nao."),
            AiLanguage.PUNJABI to listOf("Isda live / ajj da rate mere kol hun nahi hai — main live jaankari nahi de sakda, is layi andaze naal kuch nahi dassanga. Official app jaan website te ajj da rate check kar lo."),
            AiLanguage.TAMIL to listOf("Idhoda live / innikada rate enkitta ippo illai — naan live thagaval thara mudiyadhu, adhunaala yugikka maaten. Official app illa website la innikada rate paarthukonga."),
            AiLanguage.TELUGU to listOf("Deeni live / eeroju rate naa daggara ippudu ledu — nenu live samacharam ivvalenu, anduke uhinchi cheppanu. Official app leda website lo eeroju rate choodandi."),
            AiLanguage.KANNADA to listOf("Idara live / indina rate nanna hattira iga illa — naanu live mahiti kodalu agalla, adakke uhisi helalla. Official app athava website nalli indina rate nodiri."),
            AiLanguage.MALAYALAM to listOf("Ithinte live / innathe rate ente kayyil ippol illa — njan live vivaram tharannu, athukondu uhichu onnum parayilla. Official app allenkil website il innathe rate nokku."),
            AiLanguage.ODIA to listOf("Ehara live / aji rate mora pakhare ebe nahin — mu live suchana deiparibini, tenuhi andajare kichhi kahibini. Official app ki website re aji rate dekha."),
            AiLanguage.ASSAMESE to listOf("Eitu live / aji rate mur usorot etia nai — moi live tottho dibo nuaru, hehetuke andajot kiba nokou. Official app ne website ot aji rate sabo."),
            AiLanguage.URDU to listOf("Iska live / aaj ka rate mere paas abhi nahi hai — main live jaankari nahi de sakta, isliye andaze se kuch nahi bataunga. Official app ya website par aaj ka rate check kar lo."),
            AiLanguage.NEPALI to listOf("Yasko live / aaj ko rate mero ma ahile chhaina — ma live jankari dina sakdina, isliye andaj le kehi bhannina. Official app ya website ma aaj ko rate check garnus.")
        )
    )

    fun get(lang: AiLanguage, key: String, variant: Int = 0): String {
        val byLang = table[key] ?: return key
        val variants = byLang[lang] ?: byLang[AiLanguage.HINGLISH]!!
        return variants[variant % variants.size]
    }

    fun variantCount(key: String, lang: AiLanguage): Int {
        val byLang = table[key] ?: return 1
        return (byLang[lang] ?: byLang[AiLanguage.HINGLISH]!!).size
    }

    /** Deterministic variant pick — same message + same context always
     *  picks the same variant (tests are stable), a different context
     *  picks a different one (replies never repeat mechanically). */
    fun pickVariant(seed: String, count: Int): Int {
        if (count <= 1) return 0
        val h = seed.hashCode()
        return (if (h < 0) -h else h) % count
    }
}

/** Clean jokes, per language. Content, not a reply pattern — the
 *  composer picks one by hash. Languages without a joke fall back to
 *  the Hinglish joke (same documented limit as the reply tables). */
object ConversationJokes {
    private val jokes: Map<AiLanguage, List<String>> = mapOf(
        AiLanguage.HINGLISH to listOf(
            "Ek aadmi doctor ke paas gaya aur bola: \"Doctor sahab, mujhe bhoolne ki bimari hai.\" Doctor: \"Kab se?\" Aadmi: \"Kya kab se?\"",
            "Teacher: Tum homework kyun nahi laaye? Student: Sir, homework ne chhutti le li — keh raha tha, roz-roz kaun kare!"
        ),
        AiLanguage.ENGLISH to listOf(
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the scarecrow win an award? Because he was outstanding in his field!"
        ),
        AiLanguage.HINDI to listOf(
            "मरीज़: डॉक्टर साहब, मुझे भूलने की बीमारी है। डॉक्टर: कब से? मरीज़: क्या कब से?",
            "टीचर: तुम्हारा होमवर्क कहाँ है? छात्र: सर, होमवर्क ने छुट्टी ले ली — कह रहा था, रोज़-रोज़ कौन करे!"
        ),
        AiLanguage.GUJARATI to listOf(
            "Ek bhai doctor pase gaya: \"Doctor saheb, mane bhulvani bimari chhe.\" Doctor: \"Kyarthi?\" Bhai: \"Shu kyarthi?\"",
            "Teacher: Homework kya nathi lavyo? Student: Sir, homework e raja leedhi — ke chhe, roj roj kone karvu!"
        ),
        AiLanguage.MARATHI to listOf(
            "Ek manus doctor kade gela: \"Doctor saheb, mala visraycha aajar ahe.\" Doctor: \"Kevha pasun?\" Manus: \"Kay kevha pasun?\"",
            "Teacher: Homework ka anle nahi? Student: Sir, homework ne sutti ghetli — mhanto, roz roz kon karel!"
        ),
        AiLanguage.BENGALI to listOf(
            "Ek lok doctor er kache gelo: \"Doctor saheb, amar bhule jaoar rog ache.\" Doctor: \"Kobe theke?\" Lok: \"Ki kobe theke?\"",
            "Teacher: Homework keno ano ni? Student: Sir, homework chuti niyeche — bolche, roj roj ke korbe!"
        ),
        AiLanguage.PUNJABI to listOf(
            "Ikk banda doctor kol gaya: \"Doctor saab, mainu bhullan di bimari hai.\" Doctor: \"Kadon to?\" Banda: \"Ki kadon to?\"",
            "Teacher: Homework kyon nahi leya? Student: Sir, homework ne chhutti lai layi — kehnda, roz roz kaun kare!"
        ),
        AiLanguage.TAMIL to listOf(
            "Oru aalu doctor kitta poanaaru: \"Doctor, enakku marakkura noi irukku.\" Doctor: \"Eppo irundhu?\" Aalu: \"Enna eppo irundhu?\"",
            "Teacher: Homework yen kondu varala? Student: Sir, homework leave eduthuduchu — dhinamum yaaru seivaannu kekkudhu!"
        ),
        AiLanguage.TELUGU to listOf(
            "Oka vyakti doctor daggaraki velladu: \"Doctor garu, naku marchipoye vyadhi undi.\" Doctor: \"Eppati nunchi?\" Vyakti: \"Emi eppati nunchi?\"",
            "Teacher: Homework enduku teledhu? Student: Sir, homework selavu teesukundi — roju roju evaru chestaru ani adugutundi!"
        )
    )

    fun get(lang: AiLanguage, variant: Int): String {
        val list = jokes[lang] ?: jokes[AiLanguage.HINGLISH]!!
        return list[variant % list.size]
    }
}

/** The local meaning engine. Composes replies from parsed meaning +
 *  live context — never from a fixed question→answer table. When it
 *  cannot genuinely answer, it says so (needsCloud) instead of
 *  inventing an unrelated question. */
object ConversationEngine {

    fun understand(
        rawText: String,
        context: AiAssistantParser.AiConversationContext,
        lang: AiLanguage
    ): Meaning = MeaningParser.understand(rawText, context, lang)

    fun honestLimitation(lang: AiLanguage): String =
        ConversationReplies.get(lang, "honestLimitation")

    fun liveInfoLimitation(lang: AiLanguage): String =
        ConversationReplies.get(lang, "liveInfoLimitation")

    fun composeLocal(
        meaning: Meaning,
        context: AiAssistantParser.AiConversationContext
    ): LocalReply {
        val lang = meaning.language
        val seed = meaning.rawText + "|" + (context.lastIntent ?: "") + "|" + (context.lastTopic ?: "")
        return when (meaning.intent) {
            ConversationIntent.CASUAL -> composeCasual(meaning, context, seed)
            ConversationIntent.STATEMENT -> composeStatement(meaning, context, seed)
            ConversationIntent.PLAN -> composePlan(meaning, context, seed)
            ConversationIntent.LANGUAGE_REQUEST -> {
                val requested = meaning.requestedLanguage ?: AiLanguage.HINGLISH
                val text = ConversationReplies.get(requested, "languageConfirm")
                    .replace("{language}", requested.nativeName)
                LocalReply(text, "language_request")
            }
            ConversationIntent.CHECKLIST -> {
                val items = ChecklistBuilder.build(meaning.topic, lang, context)
                val intro = ConversationReplies.get(lang, "checklistIntro")
                val text = intro + "\n" + items.mapIndexed { i, item -> "${i + 1}. $item" }.joinToString("\n")
                LocalReply(text, "checklist", checklist = items)
            }
            ConversationIntent.QUESTION_GENERAL -> {
                if (meaning.topic == "tomorrow_plan") {
                    return LocalReply(tomorrowPlanGeneric(lang), "tomorrow_plan")
                }
                val answer = generalAnswer(meaning, context)
                if (answer != null) LocalReply(answer, "general") else LocalReply("", "general", needsCloud = true)
            }
            else -> LocalReply("", "unknown", needsCloud = true)
        }
    }

    private fun composeCasual(
        meaning: Meaning,
        context: AiAssistantParser.AiConversationContext,
        seed: String
    ): LocalReply {
        val lang = meaning.language
        val q = meaning.canonicalText
        return when (meaning.topic) {
            "joke" -> {
                val v = ConversationReplies.pickVariant(seed, 2)
                LocalReply(ConversationJokes.get(lang, v), "casual_joke")
            }
            "bored" -> {
                val v = ConversationReplies.pickVariant(seed, ConversationReplies.variantCount("bored", lang))
                LocalReply(ConversationReplies.get(lang, "bored", v), "casual_bored")
            }
            "mood" -> LocalReply(ConversationReplies.get(lang, "moodBad"), "casual_mood")
            "thanks" -> {
                val v = ConversationReplies.pickVariant(seed, 2)
                LocalReply(ConversationReplies.get(lang, "thanks", v), "casual_thanks")
            }
            "ask_anything" -> {
                val v = ConversationReplies.pickVariant(seed, 2)
                LocalReply(ConversationReplies.get(lang, "askAnything", v), "casual_ask")
            }
            "farewell" -> LocalReply(ConversationReplies.get(lang, "farewell"), "casual_farewell")
            "what_doing" -> {
                val v = ConversationReplies.pickVariant(seed, 2)
                LocalReply(ConversationReplies.get(lang, "whatDoing", v), "casual_what_doing")
            }
            else -> {
                // Greeting vs how-are-you: the words decide, not a table.
                val howAreYou = q.contains("kaise ho") || q.contains("how are you") ||
                    q.contains("kaisa hai") || q.contains("kya haal") || q.contains("kem cho")
                val key = if (howAreYou) "howAreYou" else "greeting"
                val v = ConversationReplies.pickVariant(seed, 2)
                var text = ConversationReplies.get(lang, key, v)
                // Context-aware variation: if a plan is pending, the
                // greeting remembers it instead of repeating a generic line.
                val plan = context.lastPlanTopic
                if (plan != null) {
                    text += " " + planReminder(lang, plan)
                }
                LocalReply(text, "casual_greeting")
            }
        }
    }

    private fun planReminder(lang: AiLanguage, topic: String?): String {
        val label = topicLabel(topic, lang)
        return when (lang) {
            AiLanguage.ENGLISH -> "By the way — tomorrow's $label work is still on. Tell me if you need help with it."
            AiLanguage.HINDI -> "Waise — kal wale $label ka kaam yaad hai na? Kuch madad chahiye to batao."
            AiLanguage.GUJARATI -> "Vaise — kaale wala $label nu kaam yaad chhe ne? Kai madad joie to kaho."
            else -> "Waise — kal wale $label ka kaam yaad hai na? Kuch madad chahiye to batao."
        }
    }

    private fun composeStatement(
        meaning: Meaning,
        context: AiAssistantParser.AiConversationContext,
        seed: String
    ): LocalReply {
        val lang = meaning.language
        return when (meaning.topic) {
            "work", "shop" -> {
                val v = ConversationReplies.pickVariant(seed, 2)
                LocalReply(ConversationReplies.get(lang, "statementBusy", v), "statement_work")
            }
            "tired" -> LocalReply(ConversationReplies.get(lang, "moodBad"), "statement_tired")
            else -> {
                val v = ConversationReplies.pickVariant(seed, 2)
                LocalReply(ConversationReplies.get(lang, "statementGeneric", v), "statement")
            }
        }
    }

    private fun composePlan(
        meaning: Meaning,
        context: AiAssistantParser.AiConversationContext,
        seed: String
    ): LocalReply {
        val lang = meaning.language
        val label = topicLabel(meaning.topic, lang)
        // Website plans get a specific, relevant question — planning
        // help, not a money question.
        if (meaning.topic == "website") {
            val text = when (lang) {
                AiLanguage.ENGLISH -> "What type of website do you want to build? I can help with planning, design and development."
                AiLanguage.HINDI -> "किस type की website बनानी है? मैं planning, design और development में मदद कर सकता हूँ।"
                AiLanguage.GUJARATI -> "Kai type ni website banavvi chhe? Hu planning, design ane development ma madad kari shaku chhu."
                else -> "Kis type ki website banana chahte ho? Main planning, design aur development mein help kar sakta hoon."
            }
            return LocalReply(text, "plan_website")
        }
        val opener = ConversationReplies.get(lang, "planOpener")
        val offer = ConversationReplies.get(lang, "planOffer")
        val text = if (meaning.timeRef == "tomorrow") {
            val whenWord = ConversationReplies.get(lang, "tomorrowWord")
            val phrase = ConversationReplies.get(lang, "planPhrase")
            "$opener $whenWord $label $phrase $offer"
        } else {
            val phrase = ConversationReplies.get(lang, "planPhrase")
            "$opener $label $phrase $offer"
        }
        return LocalReply(text, "plan")
    }

    private fun tomorrowPlanGeneric(lang: AiLanguage): String = when (lang) {
        AiLanguage.ENGLISH -> "Let us plan tomorrow. First, here is what is still pending for tomorrow:"
        AiLanguage.HINDI -> "कल का plan बनाते हैं। पहले देखते हैं कल के लिए क्या pending है:"
        AiLanguage.GUJARATI -> "Kaale no plan banavie. Pela joie kaale mate shu pending chhe:"
        else -> "Kal ka plan banate hain. Pehle dekhte hain kal ke liye kya pending hai:"
    }

    /** Topic label in the user's language (service names stay as-is). */
    fun topicLabel(topic: String?, lang: AiLanguage): String = when (topic?.lowercase()) {
        "pan" -> "PAN Card"
        "website" -> "Website"
        "csc" -> "CSC centre"
        "aadhaar", "aadhar" -> "Aadhaar"
        "voter" -> "Voter ID"
        "ayushman" -> "Ayushman Card"
        "xerox" -> "Xerox"
        "printing" -> "Printing"
        "money_transfer" -> "Money Transfer"
        "work" -> when (lang) {
            AiLanguage.ENGLISH -> "work"
            AiLanguage.HINDI -> "काम"
            else -> "kaam"
        }
        "shop" -> when (lang) {
            AiLanguage.ENGLISH -> "shop"
            AiLanguage.HINDI -> "दुकान"
            else -> "dukaan"
        }
        null -> when (lang) {
            AiLanguage.ENGLISH -> "work"
            AiLanguage.HINDI -> "काम"
            else -> "kaam"
        }
        else -> topic
    }

    // ------------------------------------------------------------------
    // General knowledge — deterministic, on-device, honest. Returns null
    // when the local engine cannot genuinely answer: the caller must use
    // the cloud AI or answer honestly, never invent.
    // ------------------------------------------------------------------
    fun generalAnswer(
        meaning: Meaning,
        context: AiAssistantParser.AiConversationContext
    ): String? {
        val lang = meaning.language
        return when (meaning.topic) {
            "pan_explainer" -> explainer(lang, panHinglish, panEnglish, panHindi, panGujarati)
            "aadhaar_explainer" -> explainer(lang, aadhaarHinglish, aadhaarEnglish, aadhaarHindi, aadhaarGujarati)
            "voter_explainer" -> explainer(lang, voterHinglish, voterEnglish, voterHindi, voterGujarati)
            "ayushman_explainer" -> explainer(lang, ayushmanHinglish, ayushmanEnglish, ayushmanHindi, ayushmanGujarati)
            "csc_explainer" -> explainer(lang, cscHinglish, cscEnglish, cscHindi, cscGujarati)
            "website_build" -> explainer(lang, websiteHinglish, websiteEnglish, websiteHindi, websiteGujarati)
            "business_idea" -> businessIdeas(lang, context)
            "troubleshoot_phone" -> explainer(lang, phoneHinglish, phoneEnglish, phoneHindi, phoneGujarati)
            "troubleshoot_printer" -> explainer(lang, printerHinglish, printerEnglish, printerHindi, printerGujarati)
            "troubleshoot_internet" -> explainer(lang, internetHinglish, internetEnglish, internetHindi, internetGujarati)
            "troubleshoot_upi" -> explainer(lang, upiHinglish, upiEnglish, upiHindi, upiGujarati)
            "writing" -> writingHelp(lang)
            "translation" -> translationHelp(meaning, lang)
            "calculation" -> calculate(meaning, lang)
            "live_info" -> null
            "general_explain" -> null
            else -> null
        }
    }

    private fun explainer(lang: AiLanguage, hinglish: String, english: String, hindi: String, gujarati: String): String =
        when (lang) {
            AiLanguage.ENGLISH -> english
            AiLanguage.HINDI -> hindi
            AiLanguage.GUJARATI -> gujarati
            else -> hinglish
        }

    // --- Explainers (honest uncertainty where rules change: fees and
    //     rules are labelled as changeable, never stated as fixed facts).
    private val panHinglish =
        "PAN Card ek zaroori identity document hai — bank account, badi payment aur sarkari kaam mein lagta hai.\n" +
            "Documents: Aadhaar card, passport-size photo, Aadhaar se linked mobile number, aur signature.\n" +
            "Process: Form mein naam aur date Aadhaar jaisi bharo → documents jama karo → fee lo aur receipt do → application submit karo → acknowledgement number customer ko do.\n" +
            "Note: Fee aur rules samay-samay par badal sakte hain — submit karne se pehle official portal par check kar lo."
    private val panEnglish =
        "A PAN Card is an important identity document — needed for bank accounts, large payments and government work.\n" +
            "Documents: Aadhaar card, passport-size photo, mobile number linked to Aadhaar, and signature.\n" +
            "Process: fill the form with the name and date exactly as on Aadhaar → collect documents → take the fee and give a receipt → submit the application → give the acknowledgement number to the customer.\n" +
            "Note: fees and rules can change from time to time — check the official portal before submitting."
    private val panHindi =
        "PAN Card एक ज़रूरी identity document है — bank account, बड़ी payment और सरकारी काम में लगता है।\n" +
            "Documents: Aadhaar card, passport-size photo, Aadhaar से linked mobile number, और signature।\n" +
            "Process: Form में नाम और date Aadhaar जैसी भरो → documents जमा करो → fee लो और receipt दो → application submit करो → acknowledgement number customer को दो।\n" +
            "Note: Fee और rules समय-समय पर बदल सकते हैं — submit करने से पहले official portal पर check कर लो।"
    private val panGujarati =
        "PAN Card ek jaruri identity document chhe — bank account, moti payment ane sarkari kaam ma lage chhe.\n" +
            "Documents: Aadhaar card, passport-size photo, Aadhaar sathe linked mobile number, ane signature.\n" +
            "Process: Form ma naam ane date Aadhaar jevi bharo → documents jama karo → fee lo ane receipt aapo → application submit karo → acknowledgement number customer ne aapo.\n" +
            "Note: Fee ane rules samay-samay par badlai shake chhe — submit karta pehla official portal par check kari lo."

    private val aadhaarHinglish =
        "Aadhaar mein ye update ho sakta hai: naam, mobile number, address, photo — aur biometric (fingerprint/iris) bhi.\n" +
            "Documents: purana Aadhaar card + sahi proof (mobile update ke liye Aadhaar se linked number, address ke liye address proof).\n" +
            "Note: Biometric update ke liye Aadhaar centre jana padta hai, online nahi hota. Rules badal sakte hain — update se pehle official portal par check kar lo."
    private val aadhaarEnglish =
        "You can update in Aadhaar: name, mobile number, address, photo — and biometrics (fingerprint/iris) too.\n" +
            "Documents: old Aadhaar card + correct proof (linked number for mobile, address proof for address).\n" +
            "Note: biometric updates need a visit to an Aadhaar centre, they cannot be done online. Rules can change — check the official portal before updating."
    private val aadhaarHindi =
        "Aadhaar में ये update हो सकता है: नाम, mobile number, address, photo — और biometric (fingerprint/iris) भी।\n" +
            "Documents: पुराना Aadhaar card + सही proof (mobile update के लिए Aadhaar से linked number, address के लिए address proof)।\n" +
            "Note: Biometric update के लिए Aadhaar centre जाना पड़ता है, online नहीं होता। Rules बदल सकते हैं — update से पहले official portal पर check कर लो।"
    private val aadhaarGujarati =
        "Aadhaar ma aa update thai shake chhe: naam, mobile number, address, photo — ane biometric (fingerprint/iris) pan.\n" +
            "Documents: juno Aadhaar card + sacho proof (mobile update mate Aadhaar sathe linked number, address mate address proof).\n" +
            "Note: Biometric update mate Aadhaar centre javu pade chhe, online nathi thatu. Rules badlai shake chhe — update karta pehla official portal par check kari lo."

    private val voterHinglish =
        "Voter ID ke liye: naya voter registration, naam/address correction, ya card duplicate.\n" +
            "Documents: age proof, address proof, passport-size photo.\n" +
            "Process: Form bharo → documents jama karo → application submit karo → acknowledgement number do.\n" +
            "Note: Rules aur form samay-samay par badal sakte hain — submit karne se pehle official portal par check kar lo."
    private val voterEnglish =
        "For Voter ID: new voter registration, name/address correction, or a duplicate card.\n" +
            "Documents: age proof, address proof, passport-size photo.\n" +
            "Process: fill the form → collect documents → submit the application → give the acknowledgement number.\n" +
            "Note: rules and forms can change from time to time — check the official portal before submitting."
    private val voterHindi =
        "Voter ID के लिए: नया voter registration, नाम/address correction, या card duplicate।\n" +
            "Documents: age proof, address proof, passport-size photo।\n" +
            "Process: Form भरो → documents जमा करो → application submit करो → acknowledgement number दो।\n" +
            "Note: Rules और form समय-समय पर बदल सकते हैं — submit करने से पहले official portal पर check कर लो।"
    private val voterGujarati =
        "Voter ID mate: navo voter registration, naam/address correction, ke card duplicate.\n" +
            "Documents: age proof, address proof, passport-size photo.\n" +
            "Process: Form bharo → documents jama karo → application submit karo → acknowledgement number aapo.\n" +
            "Note: Rules ane form samay-samay par badlai shake chhe — submit karta pehla official portal par check kari lo."

    private val ayushmanHinglish =
        "Ayushman Card (PM-JAY) se eligible parivaar ko hospital mein free ilaaj milta hai.\n" +
            "Documents: Aadhaar card, ration card, aur parivaar ki details.\n" +
            "Process: Eligibility check karo → form bharo → documents jama karo → card banao.\n" +
            "Note: Eligibility aur hospital list samay-samay par badal sakti hai — card banane se pehle official portal par check kar lo."
    private val ayushmanEnglish =
        "With an Ayushman Card (PM-JAY), eligible families get free treatment in hospital.\n" +
            "Documents: Aadhaar card, ration card, and family details.\n" +
            "Process: check eligibility → fill the form → collect documents → make the card.\n" +
            "Note: eligibility and the hospital list can change — check the official portal before making the card."
    private val ayushmanHindi =
        "Ayushman Card (PM-JAY) से eligible परिवार को hospital में free इलाज मिलता है।\n" +
            "Documents: Aadhaar card, ration card, और परिवार की details।\n" +
            "Process: Eligibility check करो → form भरो → documents जमा करो → card बनाओ।\n" +
            "Note: Eligibility और hospital list समय-समय पर बदल सकती है — card बनाने से पहले official portal पर check कर लो।"
    private val ayushmanGujarati =
        "Ayushman Card (PM-JAY) thi eligible parivaar ne hospital ma free ilaaj male chhe.\n" +
            "Documents: Aadhaar card, ration card, ane parivaar ni details.\n" +
            "Process: Eligibility check karo → form bharo → documents jama karo → card banavo.\n" +
            "Note: Eligibility ane hospital list samay-samay par badlai shake chhe — card banavta pehla official portal par check kari lo."

    private val cscHinglish =
        "CSC centre ek digital seva kendra hai — gaon/sheher mein sarkari aur online seva ek jagah milti hai.\n" +
            "Aam seva: PAN Card, Aadhaar update, Voter ID, Ayushman Card, Money Transfer, Xerox/Printing, Passport photo, Scanning, online form bharna.\n" +
            "Customer ko kaam samjhao, sahi documents lo, fee aur receipt saaf batao, aur kaam poora hone par deliver karo."
    private val cscEnglish =
        "A CSC centre is a digital service centre — government and online services in one place.\n" +
            "Common services: PAN Card, Aadhaar update, Voter ID, Ayushman Card, Money Transfer, Xerox/Printing, Passport photo, Scanning, filling online forms.\n" +
            "Explain the work to the customer, take the right documents, state the fee and receipt clearly, and deliver when the work is done."
    private val cscHindi =
        "CSC centre एक digital सेवा केंद्र है — गाँव/शहर में सरकारी और online सेवा एक जगह मिलती है।\n" +
            "आम सेवा: PAN Card, Aadhaar update, Voter ID, Ayushman Card, Money Transfer, Xerox/Printing, Passport photo, Scanning, online form भरना।\n" +
            "Customer को काम समझाओ, सही documents लो, fee और receipt साफ़ बताओ, और काम पूरा होने पर deliver करो।"
    private val cscGujarati =
        "CSC centre ek digital seva kendra chhe — gaam/sheher ma sarkari ane online seva ek jagya e male chhe.\n" +
            "Aam seva: PAN Card, Aadhaar update, Voter ID, Ayushman Card, Money Transfer, Xerox/Printing, Passport photo, Scanning, online form bharvu.\n" +
            "Customer ne kaam samjavo, sacha documents lo, fee ane receipt saaf kaho, ane kaam puru thaya pachhi deliver karo."

    private val websiteHinglish =
        "Website banane ke steps:\n" +
            "1. Purpose tay karo — dukaan ke liye hai ya kuch aur?\n" +
            "2. Pages ki list banao — Home, Services, Contact.\n" +
            "3. Design chuno — simple aur mobile-friendly.\n" +
            "4. Content likho — services, rate, contact.\n" +
            "5. Free hosting/domain options dekho — shuruaat mein free options kaafi hain.\n" +
            "6. Test karke publish karo.\n" +
            "Batao — kis type ki website chahiye? Main planning aur content likhne mein madad kar sakta hoon."
    private val websiteEnglish =
        "Steps to build a website:\n" +
            "1. Decide the purpose — is it for the shop or something else?\n" +
            "2. List the pages — Home, Services, Contact.\n" +
            "3. Pick a design — simple and mobile-friendly.\n" +
            "4. Write the content — services, rates, contact.\n" +
            "5. Look at free hosting/domain options — free options are enough to start.\n" +
            "6. Test it, then publish.\n" +
            "Tell me — what type of website do you want? I can help with planning and writing the content."
    private val websiteHindi =
        "Website बनाने के steps:\n" +
            "1. Purpose तय करो — दुकान के लिए है या कुछ और?\n" +
            "2. Pages की list बनाओ — Home, Services, Contact।\n" +
            "3. Design चुनो — simple और mobile-friendly।\n" +
            "4. Content लिखो — services, rate, contact।\n" +
            "5. Free hosting/domain options देखो — शुरुआत में free options काफी हैं।\n" +
            "6. Test करके publish करो।\n" +
            "बताओ — किस type की website चाहिए? मैं planning और content लिखने में मदद कर सकता हूँ।"
    private val websiteGujarati =
        "Website banavvana steps:\n" +
            "1. Purpose tay karo — dukaan mate chhe ke biju kai?\n" +
            "2. Pages ni list banavo — Home, Services, Contact.\n" +
            "3. Design chunno — simple ane mobile-friendly.\n" +
            "4. Content lakho — services, rate, contact.\n" +
            "5. Free hosting/domain options juo — shuruaat ma free options kaafi chhe.\n" +
            "6. Test kari ne publish karo.\n" +
            "Kaho — kai type ni website joie chhe? Hu planning ane content lakhva ma madad kari shaku chhu."

    private fun businessIdeas(lang: AiLanguage, context: AiAssistantParser.AiConversationContext): String {
        val ideas = when (lang) {
            AiLanguage.ENGLISH ->
                "Some ideas for a CSC centre:\n" +
                    "• Passport-size photo and scanning — daily customers.\n" +
                    "• Filling online forms — exam, job and scholarship forms.\n" +
                    "• Money Transfer and banking services — earns commission.\n" +
                    "• Printing and binding — school and college work.\n" +
                    "• Mobile recharge and bill payment.\n" +
                    "These are only ideas — tell me which one you want in detail and I will make a plan for it."
            AiLanguage.HINDI ->
                "CSC centre के लिए कुछ ideas:\n" +
                    "• Passport-size photo और scanning — रोज़ के customer आते हैं।\n" +
                    "• Online form भरना — exam, job और scholarship form।\n" +
                    "• Money Transfer और banking सेवा — commission मिलता है।\n" +
                    "• Printing + binding — school/college का काम।\n" +
                    "• Mobile recharge और bill payment।\n" +
                    "ये सिर्फ ideas हैं — किसी पर detail चाहिए तो बताओ, planning बना देता हूँ।"
            AiLanguage.GUJARATI ->
                "CSC centre mate kai ideas:\n" +
                    "• Passport-size photo ane scanning — roj na customer aave chhe.\n" +
                    "• Online form bharvu — exam, job ane scholarship form.\n" +
                    "• Money Transfer ane banking seva — commission male chhe.\n" +
                    "• Printing + binding — school/college nu kaam.\n" +
                    "• Mobile recharge ane bill payment.\n" +
                    "Aa fakt ideas chhe — kai par detail joie to kaho, planning banavi aapish."
            else ->
                "CSC centre ke liye kuch ideas:\n" +
                    "• Passport-size photo aur scanning — roz ke customer aate hain.\n" +
                    "• Online form bharna — exam, job, scholarship form.\n" +
                    "• Money Transfer aur banking seva — commission milta hai.\n" +
                    "• Printing + binding — school/college ka kaam.\n" +
                    "• Mobile recharge aur bill payment.\n" +
                    "Ye sirf ideas hain — kisi par detail chahiye to batao, planning bana deta hoon."
        }
        return ideas
    }

    private val phoneHinglish =
        "Phone slow ho to ye try karo:\n1. Phone restart karo.\n2. Storage khali karo — purane photo/video delete karo.\n3. Apps update karo.\n4. Jo apps use nahi karte, unhe uninstall karo.\nAgar phir bhi slow hai to batao, main aur detail mein madad karunga."
    private val phoneEnglish =
        "If the phone is slow, try this:\n1. Restart the phone.\n2. Free storage — delete old photos/videos.\n3. Update the apps.\n4. Uninstall apps you do not use.\nIf it is still slow, tell me and I will help in more detail."
    private val phoneHindi =
        "Phone slow हो तो ये try करो:\n1. Phone restart करो।\n2. Storage खाली करो — पुराने photo/video delete करो।\n3. Apps update करो।\n4. जो apps use नहीं करते, उन्हें uninstall करो।\nअगर फिर भी slow है तो बताओ, मैं और detail में मदद करूँगा।"
    private val phoneGujarati =
        "Phone slow hoy to aa try karo:\n1. Phone restart karo.\n2. Storage khali karo — juna photo/video delete karo.\n3. Apps update karo.\n4. Je apps vaparta nathi, ene uninstall karo.\nJo haju slow hoy to kaho, hu vadhu detail ma madad karish."

    private val printerHinglish =
        "Printer print nahi kar raha to ye check karo:\n1. Power aur cable check karo.\n2. Kagaz (paper) hai ya nahi dekho.\n3. Ink/toner check karo.\n4. Printer restart karo, phir phone/computer se dobara try karo.\nAgar error light jal rahi hai to uska rang aur blink batao — main exact wajah batata hoon."
    private val printerEnglish =
        "If the printer is not printing, check this:\n1. Power and cable.\n2. Is there paper loaded.\n3. Ink/toner level.\n4. Restart the printer, then try again from the phone/computer.\nIf an error light is on, tell me its colour and blink — I will tell you the exact cause."
    private val printerHindi =
        "Printer print नहीं कर रहा तो ये check करो:\n1. Power और cable check करो।\n2. कागज़ (paper) है या नहीं देखो।\n3. Ink/toner check करो।\n4. Printer restart करो, फिर phone/computer से दोबारा try करो।\nअगर error light जल रही है तो उसका रंग और blink बताओ — मैं exact वजह बताता हूँ।"
    private val printerGujarati =
        "Printer print nathi kartu to aa check karo:\n1. Power ane cable check karo.\n2. Kagaz (paper) chhe ke nahi juo.\n3. Ink/toner check karo.\n4. Printer restart karo, pachhi phone/computer thi phari try karo.\nJo error light chalu hoy to eno rang ane blink kaho — hu exact kaaran kahish."

    private val internetHinglish =
        "Internet nahi chal raha to ye try karo:\n1. Router ko band karke 30 second baad on karo.\n2. Mobile data on karke dekho — sirf WiFi problem hai ya pura internet?\n3. Recharge / bill due to nahi hai, check karo.\nAgar phir bhi nahi chalta to apne internet wale ko call karo."
    private val internetEnglish =
        "If the internet is not working, try this:\n1. Switch the router off and on again after 30 seconds.\n2. Try mobile data — is it only WiFi, or the whole internet?\n3. Check whether the recharge / bill is due.\nIf it still does not work, call your internet provider."
    private val internetHindi =
        "Internet नहीं चल रहा तो ये try करो:\n1. Router को बंद करके 30 second बाद on करो।\n2. Mobile data on करके देखो — सिर्फ WiFi problem है या पूरा internet?\n3. Recharge / bill due तो नहीं है, check करो।\nअगर फिर भी नहीं चलता तो अपने internet वाले को call करो।"
    private val internetGujarati =
        "Internet nathi chaltu to aa try karo:\n1. Router ne bandh kari ne 30 second pachhi on karo.\n2. Mobile data on kari ne juo — fakt WiFi problem chhe ke aakhu internet?\n3. Recharge / bill due to nathi, check karo.\nJo haju nathi chaltu to tamara internet wala ne call karo."

    private val upiHinglish =
        "UPI payment fail ho raha hai to ye try karo:\n1. Internet check karo — mobile data ya WiFi on hai?\n2. UPI app update karo.\n3. Thodi der baad dobara try karo — kabhi bank ka server busy hota hai.\n4. Ek baar account balance check karo.\nAgar paise kat gaye par payment fail hua to ghabrao mat — aise paise aam taur par 24-48 ghante mein wapas aa jate hain; phir bhi bank se check kar lo."
    private val upiEnglish =
        "If a UPI payment is failing, try this:\n1. Check the internet — is mobile data or WiFi on?\n2. Update the UPI app.\n3. Try again after a while — sometimes the bank server is busy.\n4. Check the account balance once.\nIf money was deducted but the payment failed, do not worry — such money usually comes back in 24-48 hours; still, check with the bank."
    private val upiHindi =
        "UPI payment fail हो रहा है तो ये try करो:\n1. Internet check करो — mobile data या WiFi on है?\n2. UPI app update करो।\n3. थोड़ी देर बाद दोबारा try करो — कभी bank का server busy होता है।\n4. एक बार account balance check करो।\nअगर पैसे कट गए पर payment fail हुआ तो घबराओ मत — ऐसे पैसे आम तौर पर 24-48 घंटे में वापस आ जाते हैं; फिर भी bank से check कर लो।"
    private val upiGujarati =
        "UPI payment fail thay chhe to aa try karo:\n1. Internet check karo — mobile data ke WiFi on chhe?\n2. UPI app update karo.\n3. Thodi vaar pachhi phari try karo — kyarek bank nu server busy hoy chhe.\n4. Ek vaar account balance check karo.\nJo paisa kapai gaya pan payment fail thayu to gabhrasho nahi — aava paisa saamanya rite 24-48 kalaak ma paachha aavi jay chhe; haju bank thi check kari lo."

    private fun writingHelp(lang: AiLanguage): String = when (lang) {
        AiLanguage.ENGLISH ->
            "Here are ready templates — fill in the [brackets]:\n" +
                "WhatsApp message: \"Namaste! [Shop name] — [service] available hai. Time: [time]. Contact: [number].\"\n" +
                "Email: \"Subject: [topic]\nNamaste [name],\n[Main baat — 2-3 lines mein]\nDhanyavad,\n[Your name]\"\n" +
                "Caption: \"[Service] ab [shop] par! [Ek line mein fayda]. Contact karein: [number].\""
        AiLanguage.HINDI ->
            "Ye lo, ready templates — [brackets] mein apni details bharo:\n" +
                "WhatsApp message: \"नमस्ते! [Shop name] — [service] available है। Time: [time]। Contact: [number]।\"\n" +
                "Email: \"Subject: [topic]\nनमस्ते [name],\n[Main baat — 2-3 lines में]\nधन्यवाद,\n[Your name]\"\n" +
                "Caption: \"[Service] अब [shop] पर! [एक line में फायदा]। Contact करें: [number]।\""
        AiLanguage.GUJARATI ->
            "Aa lo, ready templates — [brackets] ma tamari details bharo:\n" +
                "WhatsApp message: \"Namaste! [Shop name] — [service] available chhe. Time: [time]. Contact: [number].\"\n" +
                "Email: \"Subject: [topic]\nNamaste [name],\n[Main vaat — 2-3 lines ma]\nDhanyavad,\n[Your name]\"\n" +
                "Caption: \"[Service] have [shop] par! [Ek line ma faydo]. Contact karo: [number].\""
        else ->
            "Ye lo, ready templates — [brackets] mein apni details bharo:\n" +
                "WhatsApp message: \"Namaste! [Shop name] — [service] available hai. Time: [time]. Contact: [number].\"\n" +
                "Email: \"Subject: [topic]\nNamaste [name],\n[Main baat — 2-3 lines mein]\nDhanyavad,\n[Your name]\"\n" +
                "Caption: \"[Service] ab [shop] par! [Ek line mein fayda]. Contact karein: [number].\""
    }

    // Small translation dictionary: (English word) -> (language -> word).
    private val translationDict: Map<String, Map<AiLanguage, String>> = mapOf(
        "hello" to mapOf(
            AiLanguage.HINDI to "नमस्ते", AiLanguage.GUJARATI to "નમસ્તે / કેમ છો",
            AiLanguage.MARATHI to "नमस्कार", AiLanguage.BENGALI to "নমস্কার",
            AiLanguage.TAMIL to "வணக்கம்", AiLanguage.TELUGU to "నమస్కారం",
            AiLanguage.PUNJABI to "ਸਤ ਸ੍ਰੀ ਅਕਾਲ", AiLanguage.HINGLISH to "Namaste"
        ),
        "thank you" to mapOf(
            AiLanguage.HINDI to "धन्यवाद", AiLanguage.GUJARATI to "આભાર",
            AiLanguage.MARATHI to "धन्यवाद", AiLanguage.BENGALI to "ধন্যবাদ",
            AiLanguage.TAMIL to "நன்றி", AiLanguage.TELUGU to "ధన్యవాదాలు",
            AiLanguage.PUNJABI to "ਧੰਨਵਾਦ", AiLanguage.HINGLISH to "Shukriya"
        ),
        "please" to mapOf(
            AiLanguage.HINDI to "कृपया", AiLanguage.GUJARATI to "કૃપા કરીને",
            AiLanguage.MARATHI to "कृपया", AiLanguage.BENGALI to "দয়া করে",
            AiLanguage.TAMIL to "தயவுசெய்து", AiLanguage.TELUGU to "దయచేసి",
            AiLanguage.HINGLISH to "Kripya"
        ),
        "shop" to mapOf(
            AiLanguage.HINDI to "दुकान", AiLanguage.GUJARATI to "દુકાન",
            AiLanguage.MARATHI to "दुकान", AiLanguage.BENGALI to "দোকান",
            AiLanguage.TAMIL to "கடை", AiLanguage.TELUGU to "షాపు",
            AiLanguage.HINGLISH to "Dukaan"
        ),
        "money" to mapOf(
            AiLanguage.HINDI to "पैसा", AiLanguage.GUJARATI to "પૈસા",
            AiLanguage.MARATHI to "पैसा", AiLanguage.BENGALI to "টাকা",
            AiLanguage.TAMIL to "பணம்", AiLanguage.TELUGU to "డబ్బు",
            AiLanguage.HINGLISH to "Paisa"
        ),
        "good morning" to mapOf(
            AiLanguage.HINDI to "सुप्रभात", AiLanguage.GUJARATI to "સુપ્રભાત",
            AiLanguage.MARATHI to "शुभ सकाळ", AiLanguage.BENGALI to "সুপ্রভাত",
            AiLanguage.TAMIL to "காலை வணக்கம்", AiLanguage.TELUGU to "శుభోదయం",
            AiLanguage.HINGLISH to "Suprabhat"
        )
    )

    private fun translationHelp(meaning: Meaning, lang: AiLanguage): String {
        val q = meaning.canonicalText
        val word = translationDict.keys.firstOrNull { q.contains(it) }
            ?: Regex("(?:translate|ka matlab|meaning of)\\s+([a-z ]+)").find(q)?.groupValues?.get(1)?.trim()
        if (word == null) {
            return when (lang) {
                AiLanguage.ENGLISH -> "Which word do you want translated, and into which language? For example: \"Translate 'thank you' in Gujarati\"."
                AiLanguage.HINDI -> "कौनसा word translate करना है, और किस language में? जैसे: \"'thank you' को Gujarati में translate करो\"।"
                AiLanguage.GUJARATI -> "Kai word translate karvu chhe, ane kai language ma? Misal: \"'thank you' ne Gujarati ma translate karo\"."
                else -> "Kaunsa word translate karna hai, aur kis language mein? Misal: \"'thank you' ko Gujarati mein translate karo\"."
            }
        }
        val entry = translationDict[word]
        if (entry == null) {
            return when (lang) {
                AiLanguage.ENGLISH -> "I do not have the translation of \"$word\" with me right now — please ask me again in more detail, or check a dictionary."
                AiLanguage.HINDI -> "\"$word\" का अनुवाद मेरे पास अभी नहीं है — ज़रा detail में फिर से पूछो, या dictionary में check कर लो।"
                AiLanguage.GUJARATI -> "\"$word\" nu anuvaad mara pase hamana nathi — thodi detail ma phari poochho, ke dictionary ma check kari lo."
                else -> "\"$word\" ka anuvaad mere paas abhi nahi hai — zara detail mein phir se poochho, ya dictionary mein check kar lo."
            }
        }
        val target = entry[lang] ?: entry[AiLanguage.HINGLISH] ?: word
        return when (lang) {
            AiLanguage.ENGLISH -> "\"$word\" in ${lang.displayName} is: $target"
            AiLanguage.HINDI -> "\"$word\" का ${lang.displayName} में अनुवाद है: $target"
            AiLanguage.GUJARATI -> "\"$word\" nu ${lang.displayName} ma anuvaad chhe: $target"
            else -> "\"$word\" ka ${lang.displayName} mein anuvaad hai: $target"
        }
    }

    // ------------------------------------------------------------------
    // Arithmetic + conversions — BigDecimal only, never Double, and
    // never used for ledger money (ledger money stays integer paise).
    // ------------------------------------------------------------------
    private val arithRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(%\\s*of|plus|minus|guna|multiply|bhag|divide|\\+|-|\\*|x|×|/)\\s*(\\d+(?:\\.\\d+)?)")
    private val convRegex = Regex("(\\d+(?:\\.\\d+)?)\\s*(km|m|cm|inch|kg|g|litre|ml)\\s*(me|mein|in|to)\\s*(m|cm|km|inch|g|kg|ml|litre)")

    fun calculate(meaning: Meaning, lang: AiLanguage): String? {
        val q = meaning.canonicalText
        val conv = convRegex.find(q)
        if (conv != null) {
            val value = conv.groupValues[1].toBigDecimalOrNull() ?: return null
            val from = conv.groupValues[2]
            val to = conv.groupValues[4]
            val inMetres = mapOf("km" to BigDecimal("1000"), "m" to BigDecimal.ONE, "cm" to BigDecimal("0.01"), "inch" to BigDecimal("0.0254"))
            val inGrams = mapOf("kg" to BigDecimal("1000"), "g" to BigDecimal.ONE)
            val inMl = mapOf("litre" to BigDecimal("1000"), "ml" to BigDecimal.ONE)
            val base: BigDecimal?
            val result: BigDecimal?
            when {
                from in inMetres && to in inMetres -> {
                    base = value.multiply(inMetres[from]!!)
                    result = base.divide(inMetres[to]!!, 4, RoundingMode.HALF_UP)
                }
                from in inGrams && to in inGrams -> {
                    base = value.multiply(inGrams[from]!!)
                    result = base.divide(inGrams[to]!!, 4, RoundingMode.HALF_UP)
                }
                from in inMl && to in inMl -> {
                    base = value.multiply(inMl[from]!!)
                    result = base.divide(inMl[to]!!, 4, RoundingMode.HALF_UP)
                }
                else -> return null
            }
            return "Hisab: $value $from = ${result!!.stripTrailingZeros().toPlainString()} $to"
        }
        val m = arithRegex.find(q) ?: return null
        val a = m.groupValues[1].toBigDecimalOrNull() ?: return null
        val op = m.groupValues[2].trim()
        val b = m.groupValues[3].toBigDecimalOrNull() ?: return null
        val result: BigDecimal = when (op) {
            "% of", "%of" -> a.multiply(b).divide(BigDecimal("100"), 4, RoundingMode.HALF_UP)
            "plus", "+" -> a.add(b)
            "minus", "-" -> a.subtract(b)
            "guna", "multiply", "*", "x", "×" -> a.multiply(b)
            "bhag", "divide", "/" -> {
                if (b.compareTo(BigDecimal.ZERO) == 0) {
                    return when (lang) {
                        AiLanguage.ENGLISH -> "Zero se divide nahi kar sakte — cannot divide by zero."
                        else -> "Zero se divide nahi kar sakte."
                    }
                }
                a.divide(b, 4, RoundingMode.HALF_UP)
            }
            else -> return null
        }
        val aStr = a.stripTrailingZeros().toPlainString()
        val bStr = b.stripTrailingZeros().toPlainString()
        val rStr = result.stripTrailingZeros().toPlainString()
        return "Hisab: $aStr $op $bStr = $rStr"
    }
}

/** Conversation memory — what the assistant remembers within a chat.
 *  Memory NEVER overrides the ledgers: it only fills in what the user
 *  did not repeat (last service, last plan, CSC centre, last topic).
 *  History is per profile (ChatHistoryStore); memory never mixes
 *  profiles — the ViewModel rebuilds it on profile switch (newChat). */
object ConversationMemory {

    fun updateContext(
        context: AiAssistantParser.AiConversationContext,
        rawText: String,
        meaning: Meaning
    ): AiAssistantParser.AiConversationContext {
        val q = meaning.canonicalText
        val runsCsc = context.runsCscCentre || q.contains("csc") || q.contains("cyber") ||
            q.contains("meri dukaan") || q.contains("mera shop") || q.contains("csc centre") ||
            q.contains("csc center") || rawText.lowercase().contains("i run a csc")
        var ctx = context.copy(
            lastTopic = meaning.topic ?: context.lastTopic,
            lastIntent = meaning.intent.name,
            runsCscCentre = runsCsc
        )
        if (meaning.service != null) {
            ctx = ctx.copy(lastService = meaning.service, lastServiceLabel = meaning.service.label)
        }
        if (meaning.intent == ConversationIntent.PLAN && meaning.timeRef == "tomorrow") {
            ctx = ctx.copy(
                lastPlanTopic = meaning.topic,
                lastPlanDayEpoch = LocalDate.now(ZoneOffset.UTC).toEpochDay() + 1
            )
        }
        return ctx
    }

    /** CSC-aware enrichment for business answers: when the user runs a
     *  CSC centre and asks about expenses, the answer names the usual
     *  CSC expense categories. Facts still come from the ledgers. */
    fun enrichBusinessAnswer(answer: String, context: AiAssistantParser.AiConversationContext, kind: String?, lang: AiLanguage): String {
        if (!context.runsCscCentre || kind != "expense") return answer
        val note = when (lang) {
            AiLanguage.ENGLISH -> "\nTypical CSC centre expenses: electricity, internet, paper, ink/toner and machine repair — tell me if you want any category separately."
            AiLanguage.HINDI -> "\nCSC centre के आम खर्चे: बिजली, internet, कागज़, ink/toner और machine repair — किसी category को अलग से देखना हो तो बताओ।"
            AiLanguage.GUJARATI -> "\nCSC centre na aam kharcha: vijli, internet, kagaz, ink/toner ane machine repair — kai category alag thi jovi hoy to kaho."
            else -> "\nCSC centre ke aam kharche: bijli, internet, kagaz, ink/toner aur machine repair — kisi category ko alag se dekhna ho to batao."
        }
        return answer + note
    }
}
