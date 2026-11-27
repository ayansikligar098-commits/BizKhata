package com.alfalah.business.domain

import java.util.Locale

/**
 * BizKhata AI — Indian languages, Hinglish & mixed-word understanding
 * (UPDATE 13, 2026-11-26). PURE Kotlin: no Android, no Room, no network
 * — so every rule here is unit-testable (MultilingualAiTest) and mirrored
 * in docs/ai_assistant_mirror.py.
 *
 * LAYER: this sits UNDER the existing parser. [canonicalise] maps any
 * supported language / script / Romanized spelling to the canonical
 * Hinglish tokens the existing [AiAssistantParser] already understands
 * ("aaje" → "aaj", "થયા" → "hue", "૩૦૦" → "300", "ane" → "aur",
 * "malyo" → "mila"), then the existing structured-action pipeline runs
 * UNCHANGED — same intents, same accounting rules, same preview +
 * confirm flow. Nothing here touches the database or does arithmetic.
 *
 * COVERAGE: all 22 scheduled Indian languages + English. Romanized
 * (Hinglish, Roman Gujarati, Roman Marathi, …) is a first-class input,
 * never a fallback — native script is never required. Mixed sentences
 * (2–3 languages in one message) are understood as a whole: detection
 * scores every language, and canonicalisation maps tokens from ANY of
 * them in the same pass.
 *
 * EXPANDABLE BY DESIGN: every vocabulary item lives in a data table
 * below ([romanVariants], [nativeTokens], [numberWords],
 * [detectionKeywords], [MultilingualReplies.templates]) — add a row to
 * extend the assistant; there are no hardcoded one-off `if`s for a
 * single word in the parser. The examples in the brief (Aaj/Aaja/Aje/
 * Aaje, Kal/Kale/Kaale, Baki/Baaki, Nafa/Munafa/Profit, Kharch/Kharcho,
 * Jama/Jamma) are rows in these tables, not a fixed limit.
 *
 * HONEST LIMITS (measured in MultilingualAiTest / the mirror report):
 *  - Detection + understanding work for all 23 codes, but reply
 *    templates exist for 15 of them (English, Hinglish, Hindi, Gujarati,
 *    Marathi, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia,
 *    Assamese, Urdu, Nepali). Sanskrit, Kashmiri, Konkani, Sindhi,
 *    Manipuri, Bodo, Dogri, Maithili and Santali fall back to Hinglish
 *    replies — their messages are still understood, just answered in
 *    Hinglish until templates are added.
 *  - Devanagari is shared by Hindi, Marathi, Nepali, Sanskrit, Konkani,
 *    Dogri, Maithili and Bodo: script alone cannot tell them apart, so
 *    those rely on keyword scoring and may be confused with each other
 *    on very short messages. Understanding is unaffected (they share
 *    most vocabulary); only the reply language may fall back.
 *  - Number words are covered for Hindi/Urdu, Gujarati, Marathi,
 *    Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia,
 *    Assamese, Nepali and Sanskrit. Kashmiri, Sindhi, Konkani, Dogri,
 *    Maithili, Bodo, Manipuri and Santali number words are NOT yet in
 *    the table — digits work for all of them.
 *  - "Kal" (yesterday/tomorrow) stays ambiguous in every language and
 *    is always clarified, never guessed — for FINANCIAL entries. Plans
 *    ("Mujhe kal PAN Card banane hai") are not entries and never hit
 *    this rule (see Conversation.kt, UPDATE 15).
 *  - UPDATE 14/15 guard: Roman Hinglish markers ("kaise", "bhai",
 *    "ho", "hoon", "hai", "kar", "rahe") outweigh a lone "ho", which
 *    must never flip Roman Hinglish to Marathi ("Kaise Ho Bhai" was
 *    answered in Marathi — the UPDATE 14 screenshot bug).
 */
enum class AiLanguage(
    val code: String,
    val displayName: String,
    val bcp47: String,
    val nativeName: String
) {
    ENGLISH("en", "English", "en-IN", "English"),
    HINDI("hi", "Hindi", "hi-IN", "हिन्दी"),
    GUJARATI("gu", "Gujarati", "gu-IN", "ગુજરાતી"),
    MARATHI("mr", "Marathi", "mr-IN", "मराठी"),
    BENGALI("bn", "Bengali", "bn-IN", "বাংলা"),
    PUNJABI("pa", "Punjabi", "pa-IN", "ਪੰਜਾਬੀ"),
    TAMIL("ta", "Tamil", "ta-IN", "தமிழ்"),
    TELUGU("te", "Telugu", "te-IN", "తెలుగు"),
    KANNADA("kn", "Kannada", "kn-IN", "ಕನ್ನಡ"),
    MALAYALAM("ml", "Malayalam", "ml-IN", "മലയാളം"),
    ODIA("or", "Odia", "or-IN", "ଓଡ଼ିଆ"),
    ASSAMESE("as", "Assamese", "as-IN", "অসমীয়া"),
    URDU("ur", "Urdu", "ur-IN", "اردو"),
    SANSKRIT("sa", "Sanskrit", "sa-IN", "संस्कृतम्"),
    KASHMIRI("ks", "Kashmiri", "ks-IN", "کٲشُر"),
    KONKANI("kok", "Konkani", "kok-IN", "कोंकणी"),
    NEPALI("ne", "Nepali", "ne-NP", "नेपाली"),
    SINDHI("sd", "Sindhi", "sd-IN", "سنڌي"),
    MANIPURI("mni", "Manipuri (Meitei)", "mni-IN", "মৈতৈলোন্"),
    BODO("brx", "Bodo", "brx-IN", "बड़ो"),
    DOGRI("doi", "Dogri", "doi-IN", "डोगरी"),
    MAITHILI("mai", "Maithili", "mai-IN", "मैथिली"),
    SANTALI("sat", "Santali", "sat-IN", "ᱥᱟᱱᱛᱟᱲᱤ"),
    /** Roman Hindi/Hinglish — the default reply style. */
    HINGLISH("hinglish", "Hinglish (Roman Hindi)", "hi-IN", "Hinglish"),
    UNKNOWN("unknown", "Unknown", "hi-IN", "");

    companion object {
        fun fromCode(code: String?): AiLanguage =
            values().firstOrNull { it.code.equals(code, ignoreCase = true) } ?: UNKNOWN
    }
}

data class LanguageDetection(
    val language: AiLanguage,
    /** 0.0–1.0: script evidence is strong (~0.9), keyword-only ~0.6. */
    val confidence: Double,
    /** Which script the message is mostly written in, if any. */
    val script: String,
    val romanized: Boolean,
    /** Two or more languages scored meaningfully — a mixed message. */
    val mixed: Boolean,
    /** Top language scores, best first (for debugging / the report). */
    val scores: List<Pair<AiLanguage, Int>>
)

object Multilingual {

    // ------------------------------------------------------------------
    // Digits: every Indic / Arabic digit block → ASCII 0–9.
    // ------------------------------------------------------------------
    private val digitBases = listOf(
        0x966, // Devanagari ०–९
        0x9E6, // Bengali ০–৯
        0xA66, // Gurmukhi ੦–੯
        0xAE6, // Gujarati ૦–૯
        0xB66, // Odia ୦–୯
        0xBE6, // Tamil ௦–௯
        0xC66, // Telugu ౦–౯
        0xCE6, // Kannada ೦–೯
        0xD66, // Malayalam ൦–൯
        0x660, // Arabic-Indic ٠–٩
        0x6F0, // Extended Arabic-Indic (Urdu) ۰–۹
        0xABF0, // Meitei Mayek ꯰–꯹
        0x1C50 // Ol Chiki (Santali) ᱐–᱙
    )

    fun asciiDigits(text: String): String {
        val out = StringBuilder(text.length)
        for (ch in text) {
            var mapped: Char? = null
            for (base in digitBases) {
                if (ch.code in base..base + 9) {
                    mapped = ('0' + (ch.code - base))
                    break
                }
            }
            out.append(mapped ?: ch)
        }
        return out.toString()
    }

    // ------------------------------------------------------------------
    // Roman spelling variants → canonical Hinglish token. EXPANDABLE:
    // add a row per variant; the parser never sees the variant.
    // ------------------------------------------------------------------
    val romanVariants: Map<String, String> = mapOf(
        // Today / yesterday-tomorrow (kal stays ambiguous — clarified later).
        "aaja" to "aaj", "aje" to "aaj", "aaje" to "aaj", "aaz" to "aaj",
        "aiz" to "aaj", "aai" to "aaj",
        "inniki" to "aaj", "innu" to "aaj", "indu" to "aaj",
        "aji" to "aaj", "aj" to "aaj", "adya" to "aaj",
        "dinai" to "aaj", "ajj" to "aaj", "tehen" to "aaj",
        "houjik" to "aaj",
        "kale" to "kal", "kaale" to "kal", "kaal" to "kal",
        "ninnu" to "kal", "ninne" to "kal", "naalai" to "kal",
        "repu" to "kal", "naale" to "kal", "innalle" to "kal",
        "gatakali" to "kal", "kail" to "kal", "kaale" to "kal",
        // Due / outstanding.
        "baaki" to "baki", "bakaya" to "baki",
        // Profit.
        "munafa" to "nafa", "labh" to "nafa", "laabh" to "nafa",
        "munafe" to "nafa",
        // Expense.
        "kharcha" to "kharch", "kharcho" to "kharch", "kharach" to "kharch",
        "kharchu" to "kharch", "kharche" to "kharch",
        // Received / collected.
        "jamma" to "jama",
        // Happened / received verbs (→ parser's hue/mila/aaya).
        "thaya" to "hue", "thayo" to "hue", "thayu" to "hue",
        "hoyeche" to "hua", "hoyechi" to "hua", "holo" to "hua",
        "aachu" to "hua", "aayitu" to "hua",
        "malyo" to "mila", "malya" to "mila", "milyo" to "mila",
        "milya" to "mila", "kitti" to "mila", "vachindi" to "mila",
        "milila" to "mila", "palo" to "mila", "meel" to "mila",
        "mello" to "mila", "mon" to "mila",
        "mileya" to "mila", "bhetal" to "mila", "namena" to "mila",
        "phangba" to "mila", "praptam" to "mila",
        "milayo" to "mila",
        "aavyo" to "aaya", "aavyu" to "aaya", "aagaya" to "aaya",
        "aayo" to "aaya", "vandhu" to "aaya", "vandhadhu" to "aaya",
        "vachina" to "aaya", "bandide" to "aaya", "bantu" to "aaya",
        // Conjunctions — every language's "and" → "aur" (segment splitter).
        "ane" to "aur", "ani" to "aur", "ar" to "aur", "ebong" to "aur",
        "matte" to "aur", "mattu" to "aur", "te" to "aur", "ate" to "aur",
        "mari" to "aur", "aani" to "aur",
        "mattrum" to "aur", "mariyu" to "aur", "pinne" to "aur",
        "au" to "aur", "aru" to "aur", "cha" to "aur", "teh" to "aur",
        "ra" to "aur", "ain" to "aur", "amasung" to "aur", "arw" to "aur",
        // "Also / more" (follow-ups: "aur 200 bhi"). NOTE: "pan" is
        // deliberately NOT mapped to "bhi" here — it is also "PAN" (the
        // PAN Card service), and mapping it would destroy "PAN ka 500".
        // "pann" covers the Gujarati "also" without the collision.
        "pann" to "bhi", "kooda" to "bhi",
        // "From / via" — Gujarati "thi" ("cash thi UPI" = cash to UPI).
        "thi" to "se",
        // Question words → kitna / kya / kaise / batao / kab.
        "ketla" to "kitna", "ketlo" to "kitna", "ketli" to "kitna",
        "koto" to "kitna", "kinna" to "kitna", "evlo" to "kitna",
        "enta" to "kitna", "eshtu" to "kitna", "ethra" to "kitna",
        "kete" to "kitna", "kiman" to "kitna", "katlo" to "kitna",
        "kati" to "kitna", "kitli" to "kitna",
        "shu" to "kya", "enna" to "kya", "emiti" to "kya",
        "enu" to "kya", "enthu" to "kya", "kana" to "kya",
        "kia" to "kya",
        "kem" to "kaise", "kase" to "kaise", "kivein" to "kaise",
        "kivabe" to "kaise", "kiddan" to "kaise", "eppadi" to "kaise",
        "ela" to "kaise", "hege" to "kaise", "engane" to "kaise",
        "kiperi" to "kaise", "kenekoi" to "kaise",
        "batavo" to "batao", "sanga" to "batao", "daso" to "batao",
        "sollu" to "batao", "cheppu" to "batao", "helu" to "batao",
        "kyare" to "kab", "kakhan" to "kab", "kadon" to "kab",
        "eppodhu" to "kab", "eppudu" to "kab", "yavaga" to "kab",
        "eppol" to "kab", "kebe" to "kab", "ketia" to "kab",
        // Give / owe.
        "aapvana" to "dena", "aapva" to "dena", "aapvanu" to "dena",
        "devana" to "dena",
        // Cash.
        "rokad" to "cash", "rokda" to "cash",
        // Expense categories.
        "vijli" to "bijli", "bhadu" to "kiraya", "bhada" to "kiraya",
        "samarkam" to "repair",
        // Periods.
        "chhella" to "pichhle", "gata" to "pichhle", "pichhla" to "pichhle",
        "divas" to "din", "athavadiya" to "hafta", "athvadiyu" to "hafta",
        "hafte" to "hafta", "mahina" to "mahine",
        // Business words.
        // UPDATE 25 (C-8): "dhadhe" / "dhande" — the owner's spelling
        // of "dhandhe" (day's business).
        "dhandho" to "dhandha", "dhadhe" to "dhandha", "dhande" to "dhandha",
        "byabsha" to "dhandha",
        "vyaparam" to "dhandha", "vyapaar" to "dhandha",
        "hisab" to "hisab",
        // Refund / correction.
        "vapas" to "wapas", "kadho" to "hatao",
        "thik karo" to "sahi karo", "sudharo" to "sahi karo",
        // Money words (Taka/Tanka are the local word for rupees).
        "taka" to "rupaye", "toka" to "rupaye", "tanka" to "rupaye",
        "rupi" to "rupaye", "rupaiya" to "rupaye", "rupia" to "rupaye"
    )

    // ------------------------------------------------------------------
    // Native-script token → canonical Hinglish token. One row per word;
    // add a row per language as new vocabulary is learned.
    // ------------------------------------------------------------------
    val nativeTokens: Map<String, String> = mapOf(
        // Native-script conjunctions ("and") → "aur" (segment splitter).
        "और" to "aur", "અને" to "aur", "এবং" to "aur", "আৰু" to "aur",
        "ਤੇ" to "aur", "மற்றும்" to "aur", "మరియు" to "aur", "ಮತ್ತು" to "aur",
        "പിന്നെ" to "aur", "ଏବଂ" to "aur", "आणि" to "aur",
        // Yes ("हाँ" / "हां" in Devanagari — a bare "हाँ" accepts a
        // pending offer exactly like "Haan"; the canonical form must
        // be "haan" or the anchored acceptance regex never matches).
        "हाँ" to "haan", "हां" to "haan",
        // Today.
        "आज" to "aaj", "આજે" to "aaj", "আজ" to "aaj", "ਅੱਜ" to "aaj",
        "இன்று" to "aaj", "ఈరోజు" to "aaj", "ಇಂದು" to "aaj", "ഇന്ന്" to "aaj",
        "ଆଜି" to "aaj", "আজি" to "aaj", "آج" to "aaj",
        "ꯍꯧꯖꯤꯛ" to "aaj", "হৌজিক" to "aaj",
        "अद्य" to "aaj", "आयज" to "aaj", "अज्ज" to "aaj", "दिनै" to "aaj",
        "আই" to "aaj",
        // Yesterday / tomorrow (both → kal, always clarified).
        "कल" to "kal", "કાલે" to "kal", "কাল" to "kal", "ਕੱਲ੍ਹ" to "kal",
        "நேற்று" to "kal", "நாளை" to "kal", "నిన్న" to "kal", "రేపు" to "kal",
        "ನಿನ್ನೆ" to "kal", "ನಾಳೆ" to "kal", "ഇന്നലെ" to "kal", "നാളെ" to "kal",
        "ଗତକାଲି" to "kal", "ଆସନ୍ତାକାଲି" to "kal",
        "কালি" to "kal", "কাইল" to "kal", "کل" to "kal",
        "निन्न" to "kal",
        // Due.
        "बाकी" to "baki", "બાકી" to "baki", "বাকি" to "baki", "ਬਾਕੀ" to "baki",
        "பாக்கி" to "baki", "బాకీ" to "baki", "ಬಾಕಿ" to "baki", "ബാക്കി" to "baki",
        "ବାକି" to "baki", "বাকী" to "baki", "باقی" to "baki",
        // Profit.
        "नफा" to "nafa", "નફો" to "nafa", "লাভ" to "nafa", "ਲਾਭ" to "nafa",
        "லாபம்" to "nafa", "లాభం" to "nafa", "ಲಾಭ" to "nafa", "ലാഭം" to "nafa",
        "ଲାଭ" to "nafa", "نفع" to "nafa", "मुनाफा" to "nafa",
        // Expense.
        "खर्च" to "kharch", "ખર્ચો" to "kharch", "খরচ" to "kharch",
        "ਖਰਚ" to "kharch", "செலவு" to "kharch", "ఖర్చు" to "kharch",
        "ಖರ್ಚು" to "kharch", "ചെലവ്" to "kharch", "ଖର୍ଚ୍ଚ" to "kharch",
        "খৰচ" to "kharch", "خرچ" to "kharch",
        // Cash / UPI in native script.
        "कैश" to "cash", "નગદ" to "cash", "રોકડ" to "cash",
        "নগদ" to "cash", "ਨਗਦ" to "cash", "ரொக்கம்" to "cash",
        "నగదు" to "cash", "ನಗದು" to "cash", "کیش" to "cash",
        "यूपीआई" to "upi", "યુપીઆઈ" to "upi", "ইউপিআই" to "upi",
        "ਯੂਪੀਆਈ" to "upi", "யுபிஐ" to "upi", "యూపీఐ" to "upi",
        "ಯುಪಿಐ" to "upi", "യുപിഐ" to "upi", "ୟୁପିଆଇ" to "upi",
        // Money.
        "रुपये" to "rupaye", "रुपए" to "rupaye", "रुपैयाँ" to "rupaye",
        "રૂપિયા" to "rupaye", "টাকা" to "rupaye", "টকা" to "rupaye",
        "ਰੁਪਏ" to "rupaye", "ரூபாய்" to "rupaye", "రూపాయలు" to "rupaye",
        "ರೂಪಾಯಿ" to "rupaye", "രൂപ" to "rupaye", "ଟଙ୍କା" to "rupaye",
        "روپے" to "rupaye", "روپیہ" to "rupaye", "روپيا" to "rupaye",
        "ꯔꯨꯄꯤ" to "rupaye", "রুপি" to "rupaye", "रुप्यकाणि" to "rupaye",
        // Services in native script.
        "ज़ेरॉक्स" to "xerox", "झेरॉक्स" to "xerox", "जेरॉक्स" to "xerox",
        "ઝેરોક્સ" to "xerox", "জেরক্স" to "xerox", "জেৰক্স" to "xerox",
        "ਜ਼ੇਰੌਕਸ" to "xerox", "ஜெராக்ஸ்" to "xerox", "జెరాక్స్" to "xerox",
        "ಜೆರಾಕ್ಸ್" to "xerox", "സെറോക്സ്" to "xerox", "ଜେରକ୍ସ" to "xerox",
        "زیروکس" to "xerox",
        "प्रिंट" to "print", "प्रिंटिंग" to "printing", "પ્રિન્ટ" to "print",
        "ছাপা" to "print", "ਛਪਾਈ" to "print", "அச்சு" to "print",
        "ముద్రణ" to "print", "ಮುದ್ರಣ" to "print", "പ്രിന്റ്" to "print",
        "ଛପା" to "print", "چھپائی" to "print",
        "पैन" to "pan", "પાન" to "pan", "প্যান" to "pan", "ਪੈਨ" to "pan",
        "பான்" to "pan", "పాన్" to "pan", "ಪಾನ್" to "pan", "പാൻ" to "pan",
        "ପାନ" to "pan", "পান" to "pan",
        "आधार" to "aadhaar", "આધાર" to "aadhaar", "আধার" to "aadhaar",
        "ਆਧਾਰ" to "aadhaar", "ஆதார்" to "aadhaar", "ఆధార్" to "aadhaar",
        "ಆಧಾರ್" to "aadhaar", "ആധാർ" to "aadhaar", "ଆଧାର" to "aadhaar",
        "আধাৰ" to "aadhaar", "آدھار" to "aadhaar",
        // Question words.
        "कितना" to "kitna", "कितने" to "kitna", "કેટલા" to "kitna",
        "কত" to "kitna", "ਕਿੰਨਾ" to "kitna", "எவ்வளவு" to "kitna",
        "ఎంత" to "kitna", "ಎಷ್ಟು" to "kitna", "എത്ര" to "kitna",
        "କେତେ" to "kitna", "কিমান" to "kitna", "کتنا" to "kitna",
        "क्या" to "kya", "શું" to "kya", "কি" to "kya", "ਕੀ" to "kya",
        "என்ன" to "kya", "ఏమిటి" to "kya", "ಏನು" to "kya",
        "എന്ത്" to "kya", "କଣ" to "kya", "کیا" to "kya",
        "कैसे" to "kaise", "કેમ" to "kaise", "কিভাবে" to "kaise",
        "ਕਿਵੇਂ" to "kaise", "எப்படி" to "kaise", "ఎలా" to "kaise",
        "ಹೇಗೆ" to "kaise", "എങ്ങനെ" to "kaise", "କିପରି" to "kaise",
        "কেনেকৈ" to "kaise", "کیسے" to "kaise",
        "बताओ" to "batao", "બતાવો" to "batao", "বলো" to "batao",
        "ਦੱਸੋ" to "batao", "சொல்லு" to "batao", "చెప్పు" to "batao",
        "ಹೇಳು" to "batao", "പറയൂ" to "batao", "କୁହ" to "batao",
        "কোৱা" to "batao", "بتاؤ" to "batao",
        "कब" to "kab", "ક્યારે" to "kab", "কখন" to "kab", "ਕਦੋਂ" to "kab",
        "எப்போது" to "kab", "ఎప్పుడు" to "kab", "ಯಾವಾಗ" to "kab",
        "എപ്പോൾ" to "kab", "କେବେ" to "kab", "কেতিয়া" to "kab", "کب" to "kab",
        // Happened / received.
        "हुए" to "hue", "हुआ" to "hua", "थया" to "hue",
        "થયા" to "hue", "হয়েছে" to "hua", "ਹੋਇਆ" to "hua",
        "ஆச்சு" to "hua", "అయ్యింది" to "hua", "ಆಯಿತು" to "hua",
        "ആയി" to "hua", "ହେଲା" to "hua", "হ'ল" to "hua", "ہوا" to "hua",
        "मिला" to "mila", "मिले" to "mila", "मिली" to "mila",
        "મળ્યું" to "mila", "পেলাম" to "mila", "ਮਿਲਿਆ" to "mila",
        "கிடைச்சது" to "mila", "వచ్చింది" to "mila", "ಸಿಕ್ತು" to "mila",
        "കിട്ടി" to "mila", "ମିଳିଲା" to "mila", "পালোঁ" to "mila",
        "পালো" to "mila", "ملے" to "mila", "مليا" to "mila", "مِل" to "mila",
        "मिळाले" to "mila", "मिल्यो" to "mila", "मेळ्ळे" to "mila",
        "मिलेआ" to "mila", "भेटल" to "mila", "मोन" to "mila",
        "મળ્યા" to "mila", "મળ્યુ" to "mila",
        "ꯐꯪꯕꯥ" to "mila", "ফংবা" to "mila", "प्राप्तम्" to "mila",
        "आया" to "aaya", "வந்தது" to "aaya",
        "వచ్చింది" to "aaya", "ಬಂತು" to "aaya",
        // Give / owe.
        "देना" to "dena", "આપવાનું" to "dena", "দিতে" to "dena",
        "ਦੇਣਾ" to "dena", "கொடுக்க" to "dena", "ఇవ్వాలి" to "dena",
        "ಕೊಡಬೇಕು" to "dena", "കൊടുക്കണം" to "dena", "ଦେବା" to "dena",
        "দিব" to "dena", "دینا" to "dena",
        // Agent / customer.
        "एजेंट" to "agent", "એજન્ટ" to "agent", "এজেন্ট" to "agent",
        "ਏਜੰਟ" to "agent", "ஏஜெண்ட்" to "agent", "ఏజెంట్" to "agent",
        "ಏಜೆಂಟ್" to "agent", "ഏജന്റ്" to "agent", "ଏଜେଣ୍ଟ" to "agent",
        "এজেণ্ট" to "agent", "ایجنٹ" to "agent",
        "ग्राहक" to "customer", "ગ્રાહક" to "customer", "গ্রাহক" to "customer",
        "ਗਾਹਕ" to "customer", "வாடிக்கையாளர்" to "customer",
        "కస్టమర్" to "customer", "ಗ್ರಾಹಕ" to "customer",
        "ഉപഭോക്താവ്" to "customer", "ଗ୍ରାହକ" to "customer",
        "গ্ৰাহক" to "customer", "گاہک" to "customer"
    )

    // ------------------------------------------------------------------
    // Multi-word phrases → canonical phrase. Longest first at runtime.
    // ------------------------------------------------------------------
    private val phraseMap: Map<String, String> = mapOf(
        "nakh de" to "save kar do", "nakh do" to "save kar do",
        "nakho" to "save kar do", "daal de" to "save kar do",
        "bhar de" to "save kar do",
        "aapvana che" to "dena hai", "aapvanu che" to "dena hai",
        "aapva nu che" to "dena hai", "levanu che" to "lena hai",
        "upi ma" to "upi se", "cash ma" to "cash se",
        "thaya che" to "hue", "thayo che" to "hue",
        "baki che" to "baki hai", "baaki che" to "baki hai",
        "reva do" to "rehne do", "rahva do" to "rehne do",
        "eeroju" to "aaj",
        "मनी ट्रांसफर" to "money transfer",
        "પૈસા ટ્રાન્સફર" to "money transfer",
        "টাকা পাঠানো" to "money transfer",
        "பணம் அனுப்ப" to "money transfer",
        "డబ్బు పంపు" to "money transfer"
    )

    // ------------------------------------------------------------------
    // Number words → value. "<one> <hundred|thousand>" is composed at
    // runtime ("teen sau" = 300, "do hazaar" = 2000). EXPANDABLE.
    // ------------------------------------------------------------------
    val numberWords: Map<String, Long> = mapOf(
        // Hindi / Urdu (shared).
        "ek" to 1L, "do" to 2L, "teen" to 3L, "chaar" to 4L, "paanch" to 5L,
        "chhe" to 6L, "saat" to 7L, "aath" to 8L, "nau" to 9L, "das" to 10L,
        "gyarah" to 11L, "barah" to 12L, "bees" to 20L, "pachaas" to 50L,
        // Gujarati.
        "be" to 2L, "tran" to 3L, "nav" to 9L,
        // Marathi.
        "don" to 2L, "paach" to 5L, "sahaa" to 6L, "daha" to 10L,
        // Bengali / Assamese.
        "dui" to 2L, "tin" to 3L, "panch" to 5L, "chhoy" to 6L,
        "aat" to 8L, "noy" to 9L, "dosh" to 10L, "tini" to 3L,
        // Punjabi.
        "ikk" to 1L, "tinn" to 3L, "panj" to 5L, "satt" to 7L, "atth" to 8L,
        // Tamil (Roman).
        "onru" to 1L, "rendu" to 2L, "moonru" to 3L, "naalu" to 4L,
        "anju" to 5L, "aaru" to 6L, "ezhu" to 7L, "ettu" to 8L,
        "onbadhu" to 9L, "pathu" to 10L,
        // Telugu (Roman).
        "okati" to 1L, "moodu" to 3L, "naalugu" to 4L, "aidu" to 5L,
        "edu" to 7L, "enimidi" to 8L, "tommidi" to 9L, "padi" to 10L,
        // Kannada (Roman).
        "ondu" to 1L, "eradu" to 2L, "mooru" to 3L, "naalku" to 4L,
        "elu" to 7L, "entu" to 8L, "ombattu" to 9L, "hattu" to 10L,
        // Malayalam (Roman).
        "onn" to 1L, "rand" to 2L, "moon" to 3L, "naal" to 4L,
        "anj" to 5L, "aar" to 6L, "ezh" to 7L, "ett" to 8L,
        "onpat" to 9L, "patt" to 10L,
        // Odia (Roman).
        "eka" to 1L, "chari" to 4L, "pancha" to 5L, "chha" to 6L,
        "sata" to 7L, "atha" to 8L, "dasa" to 10L,
        // Nepali (Roman): "saya" = 100 — lives in hundredWords below.
        // Sanskrit (Roman).
        "ekam" to 1L, "dve" to 2L, "trini" to 3L, "chatvari" to 4L,
        "sapta" to 7L, "asta" to 8L, "nava" to 9L, "dasha" to 10L
    )

    /** Hundred-words and thousand-words, across languages. */
    private val hundredWords = setOf(
        "sau", "so", "sho", "sou", "shambhar", "nooru", "vanda",
        "noor", "saha", "xo", "shata", "saya"
    )
    private val thousandWords = setOf(
        "hazaar", "hajar", "hazar", "aayiram", "veyyi", "saavira", "sahasra"
    )

    // ------------------------------------------------------------------
    // Detection keywords — distinctive words per language (Roman +
    // native). Used ONLY for detection, never for understanding.
    // ------------------------------------------------------------------
    private val detectionKeywords: Map<AiLanguage, Set<String>> = mapOf(
        AiLanguage.HINGLISH to setOf(
            "aaj", "kal", "kitna", "kitne", "batao", "hue", "hua", "mila",
            "kharcha", "baki", "dhandha", "hisab", "rupaye", "paise",
            "kaise", "kya", "nahi", "haan", "dena", "lena", "jama",
            // UPDATE 25 (C-14): "aur" and "bhi" are Hinglish glue —
            // "Aur 200 UPI" must not fall through to English, and a
            // two-word Hinglish fragment ("Aur batao") must count as
            // Hinglish, not UNKNOWN. "samjhao"/"samjha"/"kiya"/"bare"/
            // "mein" are the same kind of marker ("Mujhe samjhao"
            // is Hinglish, not English).
            "aur", "bhi", "samjhao", "samjha", "kiya", "bare", "mein",
            // UPDATE 14/15 — Hinglish markers (UPDATE 14 screenshot bug):
            // "kaise", "bhai", "ho", "hoon", "hai", "kar", "rahe" must
            // outweigh a lone "ho", which must NEVER flip Roman
            // Hinglish to Marathi ("Kaise Ho Bhai" → Hinglish, not Marathi).
            "bhai", "ho", "hoon", "hai", "kar", "rahe", "raha", "tum",
            "kaisa", "kaisi", "acha", "theek", "shukriya", "sab", "mood", "bore"
        ),
        AiLanguage.HINDI to setOf(
            "आज", "कल", "कितना", "बताओ", "हुए", "मिला", "खर्च", "बाकी",
            "है", "मुझे", "मेरा", "कैसे", "क्या", "नहीं", "हाँ", "रुपये"
        ),
        AiLanguage.GUJARATI to setOf(
            "aaje", "aaj", "ketla", "ketlo", "thaya", "thayo", "malyo",
            "malya", "ane", "che", "kharcho", "baki", "na", "no", "aaje", "આજે",
            "કેટલા", "થયા", "બાકી", "ખર્ચો", "રૂપિયા", "નાખ", "nakh",
            // UPDATE 14 — "Aaje su chale chhe?" ("what's going on?")
            "chhe", "su", "kem", "cho", "chale"
        ),
        AiLanguage.MARATHI to setOf(
            "आज", "किती", "कसे", "मला", "तुम्ही", "माझे", "झाले",
            "मिळाले", "बाकी", "खर्च", "आहे", "सांगा", "che", "milale",
            "चे", "ची", "चा"
        ),
        AiLanguage.BENGALI to setOf(
            "আজ", "কত", "কিভাবে", "হয়েছে", "টাকা", "বাকি", "খরচ",
            "আমার", "বলো", "hoyeche", "taka", "koto"
        ),
        AiLanguage.PUNJABI to setOf(
            "ਅੱਜ", "ਕਿੰਨਾ", "ਕਿਵੇਂ", "ਮਿਲਿਆ", "ਮਿਲੇ", "ਰੁਪਏ", "ਬਾਕੀ", "ਖਰਚ",
            "ਦੱਸੋ", "aaj", "kinna", "mile", "dasso", "de"
        ),
        AiLanguage.TAMIL to setOf(
            "இன்று", "எவ்வளவு", "எப்படி", "வந்தது", "ரூபாய்",
            "பாக்கி", "சொல்லு", "inniki", "vandhadhu", "evlo", "sari"
        ),
        AiLanguage.TELUGU to setOf(
            "ఈరోజు", "ఎంత", "ఎలా", "వచ్చింది", "రూపాయలు", "బాకీ",
            "చెప్పు", "eeroju", "vachindi", "enta"
        ),
        AiLanguage.KANNADA to setOf(
            "ಇಂದು", "ಎಷ್ಟು", "ಹೇಗೆ", "ಬಂತು", "ರೂಪಾಯಿ", "ಬಾಕಿ",
            "ಹೇಳು", "indu", "bandide", "eshtu"
        ),
        AiLanguage.MALAYALAM to setOf(
            "ഇന്ന്", "എത്ര", "എങ്ങനെ", "കിട്ടി", "രൂപ", "ബാക്കി",
            "പറയൂ", "innu", "kitti", "ethra"
        ),
        AiLanguage.ODIA to setOf(
            "ଆଜି", "କେତେ", "କିପରି", "ମିଳିଲା", "ଟଙ୍କା",
            "ବାକି", "କୁହ", "aji", "milila", "tanka"
        ),
        AiLanguage.ASSAMESE to setOf(
            "আজি", "কিমান", "কেনেকৈ", "পালোঁ", "টকা", "বাকী",
            "কোৱা", "aji", "palo", "toka", "kiman"
        ),
        AiLanguage.URDU to setOf(
            "آج", "کتنا", "کیسے", "ملے", "روپے", "باقی", "بتاؤ",
            "aaj", "mile", "rupaye"
        ),
        AiLanguage.SANSKRIT to setOf(
            "अद्य", "कति", "अस्ति", "मम", "कृपया", "प्राप्तम्",
            "adya", "praptam", "kripaya"
        ),
        AiLanguage.KASHMIRI to setOf(
            "آج", "کٲشُر", "چھُ", "مِل", "aaz", "meel", "chhu"
        ),
        AiLanguage.KONKANI to setOf(
            "आयज", "आसा", "म्हाका", "कितलें", "मेळ्ळे",
            "aiz", "mello", "asa"
        ),
        AiLanguage.NEPALI to setOf(
            "आज", "कति", "मलाई", "मेरो", "हो", "मिल्यो", "रुपैयाँ",
            "aaja", "milayo", "kati"
        ),
        AiLanguage.SINDHI to setOf(
            "آج", "ڇا", "آهي", "مليا", "روپيا",
            "aaj", "milyo", "chha", "ja"
        ),
        AiLanguage.MANIPURI to setOf(
            "ꯍꯧꯖꯤꯛ", "ꯐꯪꯕꯥ", "ꯔꯨꯄꯤ", "হৌজিক", "ফংবা",
            "houjik", "phangba"
        ),
        AiLanguage.BODO to setOf(
            "दिनै", "आं", "नों", "मोन", "बे", "dinai", "mon"
        ),
        AiLanguage.DOGRI to setOf(
            "अज्ज", "ऐ", "मिगी", "किन्ना", "मिलेआ",
            "ajj", "mileya", "kinna"
        ),
        AiLanguage.MAITHILI to setOf(
            "आइ", "अछि", "हमरा", "कतेक", "भेटल",
            "aai", "bhetal", "achhi"
        ),
        AiLanguage.SANTALI to setOf(
            "ᱛᱮᱦᱮᱧ", "tehen", "namena", "ᱧᱟᱢ"
        ),
        AiLanguage.ENGLISH to setOf(
            "today", "yesterday", "how", "much", "total", "show",
            "please", "save", "received", "income", "expense",
            "cash", "tell", "what", "balance"
        )
    )

    // Script ranges → (script name, candidate languages in priority order).
    private fun scriptOf(ch: Char): String? = when (ch.code) {
        in 0x0900..0x097F -> "devanagari"
        in 0x0980..0x09FF -> "bengali"
        in 0x0A00..0x0A7F -> "gurmukhi"
        in 0x0A80..0x0AFF -> "gujarati"
        in 0x0B00..0x0B7F -> "odia"
        in 0x0B80..0x0BFF -> "tamil"
        in 0x0C00..0x0C7F -> "telugu"
        in 0x0C80..0x0CFF -> "kannada"
        in 0x0D00..0x0D7F -> "malayalam"
        in 0x0600..0x06FF, in 0x0750..0x077F -> "arabic"
        in 0xABC0..0xABFF -> "meitei"
        in 0x1C50..0x1C7F -> "olchiki"
        else -> null
    }

    /** Identify the language + writing style of a message. */
    fun detectLanguage(text: String): LanguageDetection {
        if (text.isBlank()) {
            return LanguageDetection(AiLanguage.UNKNOWN, 0.0, "", romanized = false, mixed = false, emptyList())
        }
        val lower = text.lowercase(Locale.ENGLISH)
        // \p{M} (combining marks) included — see canonicalise.
        val tokens = lower.split(Regex("[^\\p{L}\\p{M}0-9]+")).filter { it.isNotEmpty() }.toSet()

        // Script evidence.
        val scriptCounts = mutableMapOf<String, Int>()
        for (ch in text) {
            scriptOf(ch)?.let { scriptCounts[it] = (scriptCounts[it] ?: 0) + 1 }
        }
        val dominantScript = scriptCounts.maxByOrNull { it.value }?.key ?: ""
        val latinCount = text.count { it in 'a'..'z' || it in 'A'..'Z' }
        val romanized = dominantScript.isEmpty() && latinCount > 0
        val scriptMixed = scriptCounts.size > 1 || (dominantScript.isNotEmpty() && latinCount >= 3)

        // Keyword scores for every language.
        val scores = AiLanguage.values()
            .filter { it != AiLanguage.UNKNOWN }
            .map { lang ->
                val kws = detectionKeywords[lang] ?: emptySet()
                lang to tokens.count { it in kws }
            }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }

        // Script-constrained winners: a script only a few languages use
        // decides immediately (Gurmukhi → Punjabi, Gujarati → Gujarati…).
        val scriptWinner: AiLanguage? = when (dominantScript) {
            "gurmukhi" -> AiLanguage.PUNJABI
            "gujarati" -> AiLanguage.GUJARATI
            "odia" -> AiLanguage.ODIA
            "tamil" -> AiLanguage.TAMIL
            "telugu" -> AiLanguage.TELUGU
            "kannada" -> AiLanguage.KANNADA
            "malayalam" -> AiLanguage.MALAYALAM
            "meitei" -> AiLanguage.MANIPURI
            "olchiki" -> AiLanguage.SANTALI
            "bengali" -> {
                // Bengali vs Assamese vs Manipuri (all use Bengali script).
                val assamese = tokens.count { it in (detectionKeywords[AiLanguage.ASSAMESE] ?: emptySet()) }
                val manipuri = tokens.count { it in (detectionKeywords[AiLanguage.MANIPURI] ?: emptySet()) }
                val bengali = tokens.count { it in (detectionKeywords[AiLanguage.BENGALI] ?: emptySet()) }
                when {
                    assamese > bengali && assamese >= manipuri -> AiLanguage.ASSAMESE
                    manipuri > bengali -> AiLanguage.MANIPURI
                    else -> AiLanguage.BENGALI
                }
            }
            "arabic" -> {
                // Kashmiri / Sindhi / Urdu share the script: the HIGHEST
                // keyword score wins; a tie falls back to Urdu.
                val kashmiri = tokens.count { it in (detectionKeywords[AiLanguage.KASHMIRI] ?: emptySet()) }
                val sindhi = tokens.count { it in (detectionKeywords[AiLanguage.SINDHI] ?: emptySet()) }
                val urdu = tokens.count { it in (detectionKeywords[AiLanguage.URDU] ?: emptySet()) }
                when {
                    kashmiri > urdu && kashmiri >= sindhi -> AiLanguage.KASHMIRI
                    sindhi > urdu && sindhi >= kashmiri -> AiLanguage.SINDHI
                    else -> AiLanguage.URDU
                }
            }
            "devanagari" -> {
                // Shared by 8 languages — keyword scores decide; Hindi is
                // the default only when nothing distinctive matches.
                val best = scores.firstOrNull()
                when {
                    best != null && best.first in setOf(
                        AiLanguage.MARATHI, AiLanguage.NEPALI, AiLanguage.SANSKRIT,
                        AiLanguage.KONKANI, AiLanguage.DOGRI, AiLanguage.MAITHILI,
                        AiLanguage.BODO
                    ) -> best.first
                    else -> AiLanguage.HINDI
                }
            }
            else -> null
        }

        val best = scores.firstOrNull()
        val second = scores.getOrNull(1)
        val mixed = (second != null && second.second >= 2 && second.second * 2 >= (best?.second ?: 0)) || scriptMixed

        // UPDATE 14/15 GUARD — Hinglish markers outweigh a lone "ho".
        // "ho" is also a yes-word in Marathi/Nepali, so a Roman message
        // like "Kaise Ho Bhai" used to flip to Marathi on that one
        // token. Two or more Hinglish markers in a Roman message now
        // force Hinglish, whatever a single other-language token says.
        // (Roman messages have no dominant script, so no script winner
        // can conflict with this branch.)
        val hinglishMarkers = setOf(
            "kaise", "bhai", "ho", "hoon", "hai", "kya", "kar", "rahe",
            "raha", "tum", "batao", "acha", "mood", "bore",
            // UPDATE 25 (C-14): more Hinglish markers so a short Roman
            // message ("Mujhe samjhao", "yeh kiya kya", "kitna mila",
            // "mere bare mein") holds Hinglish instead of flipping to
            // English on a stray "upi"/"cash" token.
            "samjhao", "samjha", "kiya", "mila", "bare", "mein"
        )
        val hinglishMarkerCount = tokens.count { it in hinglishMarkers }

        val language: AiLanguage
        val confidence: Double
        when {
            romanized && hinglishMarkerCount >= 2 -> {
                language = AiLanguage.HINGLISH
                confidence = 0.8
            }
            scriptWinner != null && (best == null || best.second <= 1 || scriptWinner == best.first) -> {
                language = scriptWinner
                confidence = 0.9
            }
            scriptWinner != null && best != null && best.first == AiLanguage.HINGLISH && scriptWinner != AiLanguage.HINDI -> {
                // Native script + Hinglish words = the script's language.
                language = scriptWinner
                confidence = 0.85
            }
            best != null -> {
                language = if (romanized && best.first == AiLanguage.HINDI) AiLanguage.HINGLISH else best.first
                confidence = if (best.second >= 3) 0.8 else 0.6
            }
            dominantScript.isNotEmpty() -> {
                language = scriptWinner ?: AiLanguage.UNKNOWN
                confidence = 0.5
            }
            else -> {
                language = AiLanguage.UNKNOWN
                confidence = 0.0
            }
        }
        return LanguageDetection(
            language = language,
            confidence = confidence,
            script = dominantScript,
            romanized = romanized,
            mixed = mixed,
            scores = scores.take(3)
        )
    }

    // ------------------------------------------------------------------
    // Canonicalisation: any supported input → canonical Hinglish tokens.
    // ------------------------------------------------------------------
    fun canonicalise(text: String): String {
        var out = asciiDigits(text).lowercase(Locale.ENGLISH)
        // 1. Multi-word phrases first (longest first). Word boundaries
        //    are checked with a leading/trailing capture, not a
        //    variable-length lookbehind (which Java regex forbids).
        for ((phrase, canon) in phraseMap.entries.sortedByDescending { it.key.length }) {
            val regex = Regex("(^|[^\\p{L}])" + Regex.escape(phrase) + "($|[^\\p{L}])")
            out = regex.replace(out) { m -> m.groupValues[1] + canon + m.groupValues[2] }
        }
        // 2. Token-by-token mapping (native script + Roman variants).
        //    \p{M} (combining marks) is essential: Indic vowel signs
        //    (कैश, मिळाले, টাকা) are marks, not letters — without \p{M}
        //    the word is shattered and no map key ever matches.
        val tokenMap = nativeTokens + romanVariants
        out = Regex("[\\p{L}\\p{M}0-9]+").replace(out) { m -> tokenMap[m.value] ?: m.value }
        // 3. Number words: "<one> <hundred|thousand>" → digits, then
        //    standalone hundred/thousand words → digits. "so"/"xo" are
        //    NOT converted standalone: in English "so" is a common word
        //    ("...hue, so total...") and converting it would invent a
        //    phantom ₹100 entry. They still work as "<one> so" (= 100×n).
        for ((word, value) in numberWords) {
            out = out.replace(Regex("\\b$word\\s+(${hundredWords.joinToString("|")})\\b")) { (value * 100).toString() }
            out = out.replace(Regex("\\b$word\\s+(${thousandWords.joinToString("|")})\\b")) { (value * 1000).toString() }
        }
        for (w in hundredWords - setOf("so", "xo")) out = out.replace(Regex("\\b$w\\b"), "100")
        for (w in thousandWords) out = out.replace(Regex("\\b$w\\b"), "1000")
        return out.replace(Regex("\\s+"), " ").trim()
    }

    // ------------------------------------------------------------------
    // Yes / No across languages (whole-message match — a bare "na" in a
    // longer Gujarati sentence is a possessive particle, not a "no").
    // ------------------------------------------------------------------
    private val affirmativeExact = setOf(
        "haan", "ha", "hanji", "han", "ho", "hao", "aaho", "sari", "aama",
        "avunu", "hudu", "hou", "ji", "yes", "ok", "okay", "theek hai",
        "barabar", "sahi", "chalse", "chale", "hmm haan", "bilkul", "zaroor",
        "haan ji", "ha ji", "aaha", "saree", "sariye", "aay", "hho"
    )
    private val affirmativeContains = listOf(
        "save kar", "confirm", "nakh de", "save kara", "save karo",
        "kar do", "kardo", "theek hai", "haan ", "yes ", "ho, ", "hao, ",
        "sari"
    )
    private val negativeExact = setOf(
        "nahi", "nahin", "no", "nathi", "nai", "illa", "illai", "kadhu",
        "kadu", "ledu", "na", "naa", "nah", "venam", "beda", "nako",
        "nope", "naa ji", "illae"
    )
    private val negativeContains = listOf(
        "cancel", "mat karo", "rehnedo", "rehne do", "reva do",
        "nahi chahiye", "nahi karna", "nahi ", "no, ", "na, "
    )

    fun isAffirmative(normalised: String): Boolean {
        val n = normalised.trim()
        return n in affirmativeExact || affirmativeContains.any { it in n }
    }

    fun isNegative(normalised: String): Boolean {
        val n = normalised.trim()
        return n in negativeExact || negativeContains.any { it in n }
    }

    /** Reply language: a manual Settings preference wins; otherwise the
     *  detected language; otherwise Hinglish. */
    fun replyLanguage(detection: LanguageDetection, preferredCode: String?): AiLanguage {
        val preferred = AiLanguage.fromCode(preferredCode)
        if (preferred != AiLanguage.UNKNOWN) return preferred
        return when (detection.language) {
            AiLanguage.UNKNOWN -> AiLanguage.HINGLISH
            else -> detection.language
        }
    }
}

/**
 * Reply templates in the user's own language (UPDATE 13 §5). Keys use
 * {amount} / {total} placeholders — amounts are always formatted by the
 * caller (integer paise → ₹), never by the template. Templates exist for
 * 15 languages; the other 8 fall back to Hinglish (see file header).
 * The HINGLISH column is byte-identical to the strings the parser used
 * before UPDATE 13, so existing tests and behaviour are unchanged.
 */
object MultilingualReplies {

    private val templates: Map<AiLanguage, Map<String, String>> = mapOf(
        AiLanguage.HINGLISH to mapOf(
            "previewHeader" to "Maine ye samjha hai — confirm karein to save karunga:",
            "totalLine" to "Total: {total}",
            "askMode" to "{amount} payment Cash mein mila ya UPI mein?",
            "askService" to "Kaunsi service ki entry hai — Xerox, Printing, Smart Card, ya koi aur? Amount maine samajh liya hai ({amount}), service bata dein.",
            "askAmount" to "Kaunsi service aur kitne rupaye? Misal: \"Aaj Xerox ke 300 rupaye cash hue\".",
            "askAgent" to "Kis agent ko {amount} diye? Agent ka naam bata dein.",
            "askCustomer" to "{amount} kis customer ka due hai? Customer ka naam bata dein — due ko main income nahi likhunga, sirf uska udhaar record karunga.",
            "askCommission" to "Money Transfer {amount} — commission kitna mila? (Commission bataye bina main profit galat nahi likhna chahta.)",
            "askDirection" to "Transfer kis taraf hua — Cash se UPI, ya UPI se Cash?",
            "refund" to "Refund kis entry ka hai? Kaunsi service / kitne rupaye / Cash ya UPI — refund ko main wapas (reversal) ki tarah record karunga, kharcha nahi.",
            "kal" to "\"Kal\" se aapka matlab yesterday (pichhla din) hai ya tomorrow (aane wala din)? Date confirm karein, phir main entry bana dunga.",
            "cancelled" to "Theek hai — ye entry save nahi ki gayi. Kuch bhi change nahi hua hai."
        ),
        AiLanguage.ENGLISH to mapOf(
            "previewHeader" to "This is what I understood — confirm to save:",
            "totalLine" to "Total: {total}",
            "askMode" to "Was {amount} received in Cash or UPI?",
            "askService" to "Which service is this entry for — Xerox, Printing, Smart Card, or another? I understood the amount ({amount}); please tell me the service.",
            "askAmount" to "Which service and how many rupees? Example: \"Today Xerox 300 rupees in cash\".",
            "askAgent" to "Which agent did you pay {amount} to? Please tell me the agent's name.",
            "askCustomer" to "Which customer owes {amount}? Please tell me the customer's name — I will record it as a due, not as income.",
            "askCommission" to "Money Transfer {amount} — how much commission did you get? (I don't want to record the profit wrong without the commission.)",
            "askDirection" to "Which way did the transfer go — Cash to UPI, or UPI to Cash?",
            "refund" to "Which entry is the refund for? Which service / how many rupees / Cash or UPI — I will record a refund as a return (reversal), not as an expense.",
            "kal" to "By \"tomorrow/yesterday\" do you mean yesterday or tomorrow? Please confirm the date, then I will make the entry.",
            "cancelled" to "Okay — this entry was not saved. Nothing has changed."
        ),
        AiLanguage.HINDI to mapOf(
            "previewHeader" to "मैंने यह समझा है — कन्फर्म करें तो सेव करूँगा:",
            "totalLine" to "कुल: {total}",
            "askMode" to "{amount} Cash में मिला या UPI में?",
            "askService" to "यह किस सेवा की एंट्री है — Xerox, Printing, Smart Card, या कोई और? राशि मैंने समझ ली है ({amount}), सेवा बता दीजिए।",
            "askAmount" to "कौनसी सेवा और कितने रुपये? उदाहरण: \"आज Xerox के 300 रुपये कैश हुए\"।",
            "askAgent" to "किस एजेंट को {amount} दिए? एजेंट का नाम बता दीजिए।",
            "askCustomer" to "{amount} किस ग्राहक का बाकी है? ग्राहक का नाम बता दीजिए — बाकी को मैं आय नहीं लिखूँगा, सिर्फ उधार दर्ज करूँगा।",
            "askCommission" to "Money Transfer {amount} — कमीशन कितना मिला? (कमीशन बताए बिना मैं मुनाफा गलत नहीं लिखना चाहता।)",
            "askDirection" to "ट्रांसफर किस तरफ हुआ — Cash से UPI, या UPI से Cash?",
            "refund" to "रिफंड किस एंट्री का है? कौनसी सेवा / कितने रुपये / Cash या UPI — रिफंड को मैं वापसी (reversal) की तरह दर्ज करूँगा, खर्चा नहीं।",
            "kal" to "\"कल\" से आपका मतलब बीता हुआ कल है या आने वाला कल? तारीख कन्फर्म करें, फिर मैं एंट्री बना दूँगा।",
            "cancelled" to "ठीक है — यह एंट्री सेव नहीं की गई। कुछ भी बदला नहीं है।"
        ),
        AiLanguage.GUJARATI to mapOf(
            "previewHeader" to "Mane aa samjayu chhe — confirm karo to save karish:",
            "totalLine" to "Total: {total}",
            "askMode" to "{amount} Cash ma malyu ke UPI ma?",
            "askService" to "Aa kai service ni entry chhe — Xerox, Printing, Smart Card, ke biji? Amount mane samjai gayo chhe ({amount}), service kaho.",
            "askAmount" to "Kai service ane ketla rupiya? Udaharan: \"Aaje Xerox na 300 rupiya cash thaya\".",
            "askAgent" to "Kaya agent ne {amount} aapya? Agent nu naam kaho.",
            "askCustomer" to "{amount} kaya customer na baki chhe? Customer nu naam kaho — baki ne hu income nahi lakhish, fakt udhaar record karish.",
            "askCommission" to "Money Transfer {amount} — commission ketlu malyu? (Commission kahya vagar hu nafo khoto nahi lakhva mangu.)",
            "askDirection" to "Transfer kai disha ma thayu — Cash thi UPI, ke UPI thi Cash?",
            "refund" to "Refund kai entry no chhe? Kai service / ketla rupiya / Cash ke UPI — refund ne hu paachhu (reversal) tarike record karish, kharcho nahi.",
            "kal" to "\"Kaale\" thi tamaro matlab gayo kal chhe ke aavto kal? Date confirm karo, pachhi hu entry banavish.",
            "cancelled" to "Barabar — aa entry save nathi thai. Kai pan badlayu nathi."
        ),
        AiLanguage.MARATHI to mapOf(
            "previewHeader" to "Mala he samajle — confirm kelat tar save karen:",
            "totalLine" to "Ekun: {total}",
            "askMode" to "{amount} Cash madhe milale ki UPI madhe?",
            "askService" to "Hi kontya sevachi entry aahe — Xerox, Printing, Smart Card, ki dusri? Rakam mala samajli aahe ({amount}), seva sanga.",
            "askAmount" to "Konti seva aani kiti rupaye? Udaharan: \"Aaj Xerox che 300 rupaye cash milale\".",
            "askAgent" to "Kontya agent la {amount} dile? Agent che naav sanga.",
            "askCustomer" to "{amount} kontya customer che baki aahe? Customer che naav sanga — baki la mi income lihinar nahi, fakt udhaar nond karen.",
            "askCommission" to "Money Transfer {amount} — commission kiti milale? (Commission sangitlyashivay mi nafa chukicha lihaycha nahi.)",
            "askDirection" to "Transfer kontya dishene zale — Cash to UPI, ki UPI to Cash?",
            "refund" to "Refund kontya entry cha aahe? Konti seva / kiti rupaye / Cash ki UPI — refund mi parat (reversal) mhanun nond karen, kharcha nahi.",
            "kal" to "\"Kal\" mhanje tumhala gela kal hava aahe ki yenara kal? Tarih confirm kara, mag mi entry karen.",
            "cancelled" to "Theek aahe — hi entry save keleli nahi. Kahi hi badallele nahi."
        ),
        AiLanguage.BENGALI to mapOf(
            "previewHeader" to "Ami eta bujhechi — confirm korle save korbo:",
            "totalLine" to "Mot: {total}",
            "askMode" to "{amount} Cash e pelen na UPI te?",
            "askService" to "Eta kon service er entry — Xerox, Printing, Smart Card, na onno? Amount ami bujhechi ({amount}), service ta bolun.",
            "askAmount" to "Kon service ar koto taka? Udahoron: \"Aaj Xerox er 300 taka cash hoyeche\".",
            "askAgent" to "Kon agent ke {amount} dilen? Agent er naam bolun.",
            "askCustomer" to "{amount} kon customer er baki ache? Customer er naam bolun — baki ke ami income likhbo na, sudhu dhaar hisebe record korbo.",
            "askCommission" to "Money Transfer {amount} — commission koto pelen? (Commission na bolle ami profit bhul likhte chai na.)",
            "askDirection" to "Transfer kon dike holo — Cash theke UPI, na UPI theke Cash?",
            "refund" to "Refund kon entry er? Kon service / koto taka / Cash na UPI — refund ami ferot (reversal) hisebe record korbo, khoroch na.",
            "kal" to "\"Kaal\" bolte apni goto kaal bojhachen na aagami kaal? Tarikh confirm korun, tarpor ami entry korbo.",
            "cancelled" to "Thik ache — ei entry save kora hoy ni. Kichu bodlay ni."
        ),
        AiLanguage.PUNJABI to mapOf(
            "previewHeader" to "Main eh samjheya — confirm karo te save karanga:",
            "totalLine" to "Kul: {total}",
            "askMode" to "{amount} Cash vich mileya ja UPI vich?",
            "askService" to "Eh kis service di entry hai — Xerox, Printing, Smart Card, ja hor? Amount main samajh leya hai ({amount}), service dasso.",
            "askAmount" to "Kehri service ate kinne rupaye? Misaal: \"Aaj Xerox de 300 rupaye cash mile\".",
            "askAgent" to "Kis agent nu {amount} ditte? Agent da naa dasso.",
            "askCustomer" to "{amount} kis customer da baki hai? Customer da naa dasso — baki nu main income nahi likhanga, sirf udhaar record karanga.",
            "askCommission" to "Money Transfer {amount} — commission kinna mileya? (Commission dasse bina main munafa galat nahi likhna chahunda.)",
            "askDirection" to "Transfer kis passe hoya — Cash to UPI, ja UPI to Cash?",
            "refund" to "Refund kis entry da hai? Kehri service / kinne rupaye / Cash ja UPI — refund nu main wapas (reversal) wangu record karanga, kharcha nahi.",
            "kal" to "\"Kall\" to tuhada matlab beetea kall hai ja aun wala kall? Tarikh confirm karo, phir main entry bana devanga.",
            "cancelled" to "Theek hai — eh entry save nahi kiti gayi. Kuch vi nahi badleya."
        ),
        AiLanguage.TAMIL to mapOf(
            "previewHeader" to "Idhu naan purinjikitten — confirm panna save pannuven:",
            "totalLine" to "Motham: {total}",
            "askMode" to "{amount} Cash la vandhadha illa UPI la?",
            "askService" to "Idhu endha service entry — Xerox, Printing, Smart Card, illana vera? Amount purinjiruchu ({amount}), service sollunga.",
            "askAmount" to "Endha service, evlo rupees? Udhaaranam: \"Inniki Xerox 300 cash vandhadhu\".",
            "askAgent" to "Endha agent ku {amount} kudutheenga? Agent peru sollunga.",
            "askCustomer" to "{amount} endha customer bakki? Customer peru sollunga — bakkiya naan income nu ezhudha maaten, kadan aave record pannuven.",
            "askCommission" to "Money Transfer {amount} — commission evlo vandhadhu? (Commission sollama naan laabam thappa ezhudha virumbala.)",
            "askDirection" to "Transfer endha pakkam ponadhu — Cash la irundhu UPI, illa UPI la irundhu Cash?",
            "refund" to "Refund endha entry ku? Endha service / evlo rupees / Cash illa UPI — refund naan thiruppi (reversal) aave record pannuven, selavu illa.",
            "kal" to "\"Naetru/Naalai\" na neenga sendha naala illa varum naala? Date confirm pannunga, apparam naan entry pannuven.",
            "cancelled" to "Sari — indha entry save pannala. Edhuvum maara la."
        ),
        AiLanguage.TELUGU to mapOf(
            "previewHeader" to "Nenu idhi ardham chesukunna — confirm chesthe save chestha:",
            "totalLine" to "Motham: {total}",
            "askMode" to "{amount} Cash lo vachinda leda UPI lo?",
            "askService" to "Idhi ye service entry — Xerox, Printing, Smart Card, leda inkoti? Amount naku ardham ayyindi ({amount}), service cheppandi.",
            "askAmount" to "Ye service, entha rupees? Udaharana: \"Eeroju Xerox 300 cash vachindi\".",
            "askAgent" to "Ye agent ki {amount} icharu? Agent peru cheppandi.",
            "askCustomer" to "{amount} ye customer baki? Customer peru cheppandi — baki ni nenu income ga rayanu, appu ga matrame record chestha.",
            "askCommission" to "Money Transfer {amount} — commission entha vachindi? (Commission cheppakunda nenu labham tappu ga rayalanukovatledu.)",
            "askDirection" to "Transfer ye vaipu jarigindi — Cash nunchi UPI, leda UPI nunchi Cash?",
            "refund" to "Refund ye entry ki? Ye service / entha rupees / Cash leda UPI — refund ni nenu venakki (reversal) ga record chestha, kharchu kadu.",
            "kal" to "\"Ninna/Repu\" ante meeru gatha dinama leda repatidi? Date confirm cheyandi, taruvatha nenu entry chestha.",
            "cancelled" to "Sare — ee entry save cheyaledu. Emi maraledu."
        ),
        AiLanguage.KANNADA to mapOf(
            "previewHeader" to "Naanu idu artha madikonde — confirm madidre save maduve:",
            "totalLine" to "Ottu: {total}",
            "askMode" to "{amount} Cash nalli bandideya athava UPI nalli?",
            "askService" to "Idu yava service entry — Xerox, Printing, Smart Card, athava innondu? Amount nanage artha aayitu ({amount}), service heli.",
            "askAmount" to "Yava service, eshtu rupaye? Udaharane: \"Indu Xerox 300 cash bandide\".",
            "askAgent" to "Yava agent ge {amount} kotti? Agent hesaru heli.",
            "askCustomer" to "{amount} yava customer baki? Customer hesaru heli — baki yannu naanu income anta bareyodilla, sala aagi matra record maduve.",
            "askCommission" to "Money Transfer {amount} — commission eshtu bandide? (Commission helade naanu labha tappagi bareyalu bayasodilla.)",
            "askDirection" to "Transfer yava kadige aayitu — Cash inda UPI, athava UPI inda Cash?",
            "refund" to "Refund yava entry ge? Yava service / eshtu rupaye / Cash athava UPI — refund nannu hinde (reversal) aagi record maduve, kharchu alla.",
            "kal" to "\"Ninne/Naale\" andre neevu kaleya dina athava baruvudina? Date confirm madi, nanantara naanu entry maduve.",
            "cancelled" to "Sari — ee entry save madalilla. Enu badalagilla."
        ),
        AiLanguage.MALAYALAM to mapOf(
            "previewHeader" to "Ithu njan manassilayi — confirm cheythal save cheyyam:",
            "totalLine" to "Aake: {total}",
            "askMode" to "{amount} Cash il kittiyo atho UPI il?",
            "askService" to "Ithu eth service entry aanu — Xerox, Printing, Smart Card, atho mattu? Amount enikku manassilayi ({amount}), service parayu.",
            "askAmount" to "Eth service, ethra rupa? Udaharanam: \"Innu Xerox 300 cash kitti\".",
            "askAgent" to "Eth agent inu {amount} koduthu? Agent te peru parayu.",
            "askCustomer" to "{amount} eth customer te bakki aanu? Customer te peru parayu — bakki njan income aayi ezhuthilla, kadam aayi mathram record cheyyam.",
            "askCommission" to "Money Transfer {amount} — commission ethra kitti? (Commission parayathe njan labham thettayi ezhuthan agrahikkunnilla.)",
            "askDirection" to "Transfer eth vashathottu poyi — Cash il ninnu UPI, atho UPI il ninnu Cash?",
            "refund" to "Refund eth entry te aanu? Eth service / ethra rupa / Cash atho UPI — refund njan thirichu (reversal) aayi record cheyyam, chelavu alla.",
            "kal" to "\"Innale/Naale\" ennathu ningal kazhinja divasamo varunna divasamo? Date confirm cheyyu, ennit njan entry cheyyam.",
            "cancelled" to "Sheri — ee entry save cheythilla. Onnum mariyilla."
        ),
        AiLanguage.ODIA to mapOf(
            "previewHeader" to "Mu eha bujhili — confirm kale save karibi:",
            "totalLine" to "Mota: {total}",
            "askMode" to "{amount} Cash re milila ki UPI re?",
            "askService" to "Eha kou service ra entry — Xerox, Printing, Smart Card, ki au? Amount mu bujhili ({amount}), service kuha.",
            "askAmount" to "Kou service au kete tanka? Udaharana: \"Aji Xerox 300 tanka cash milila\".",
            "askAgent" to "Kou agent ku {amount} dele? Agent ra naa kuha.",
            "askCustomer" to "{amount} kou customer ra baki achhi? Customer ra naa kuha — baki ku mu income lekhini, kebala udhaar record karibi.",
            "askCommission" to "Money Transfer {amount} — commission kete milila? (Commission na kahile mu labha bhul lekhaku chahuni.)",
            "askDirection" to "Transfer kou adaku hela — Cash ru UPI, ki UPI ru Cash?",
            "refund" to "Refund kou entry ra? Kou service / kete tanka / Cash ki UPI — refund ku mu pheranta (reversal) hisabe record karibi, kharcha nuhe.",
            "kal" to "\"Kali\" kahile tumara matlab gata kali ki asanta kali? Tarikh confirm kara, tapare mu entry karibi.",
            "cancelled" to "Thik achhi — ehi entry save heini. Kichhi badalini."
        ),
        AiLanguage.ASSAMESE to mapOf(
            "previewHeader" to "Moi eitu bujilu — confirm korile save korim:",
            "totalLine" to "Mut: {total}",
            "askMode" to "{amount} Cash ot palo ne UPI ot?",
            "askService" to "Eitu kun service or entry — Xerox, Printing, Smart Card, ne an? Amount moi bujilu ({amount}), service tu kuwa.",
            "askAmount" to "Kun service aru kiman toka? Udahoron: \"Aji Xerox 300 toka cash palo\".",
            "askAgent" to "Kun agent ok {amount} dila? Agent or naam kuwa.",
            "askCustomer" to "{amount} kun customer or baki ase? Customer or naam kuwa — baki moi income nolikhim, kebol dhar hisape record korim.",
            "askCommission" to "Money Transfer {amount} — commission kiman palo? (Commission nokoile moi labh bhul nolikhim.)",
            "askDirection" to "Transfer kun phale hol — Cash or pora UPI, ne UPI or pora Cash?",
            "refund" to "Refund kun entry or? Kun service / kiman toka / Cash ne UPI — refund moi ghurai (reversal) hisape record korim, khoroch nohoi.",
            "kal" to "\"Kali\" bulile tumi juwa kali bujaisa ne oha kali? Tarikh confirm kora, pisot moi entry korim.",
            "cancelled" to "Thik ase — ei entry save kora nohol. Kunu nosolil."
        ),
        AiLanguage.URDU to mapOf(
            "previewHeader" to "Main ne ye samjha hai — confirm karein to save karunga:",
            "totalLine" to "Total: {total}",
            "askMode" to "{amount} Cash mein mila ya UPI mein?",
            "askService" to "Ye kis service ki entry hai — Xerox, Printing, Smart Card, ya koi aur? Amount main samajh gaya hun ({amount}), service bata dein.",
            "askAmount" to "Kaunsi service aur kitne rupaye? Misal: \"Aaj Xerox ke 300 rupaye cash mile\".",
            "askAgent" to "Kis agent ko {amount} diye? Agent ka naam bata dein.",
            "askCustomer" to "{amount} kis customer ka baqi hai? Customer ka naam bata dein — baqi ko main income nahi likhunga, sirf udhaar record karunga.",
            "askCommission" to "Money Transfer {amount} — commission kitna mila? (Commission bataye bina main munafa ghalat nahi likhna chahta.)",
            "askDirection" to "Transfer kis taraf hua — Cash se UPI, ya UPI se Cash?",
            "refund" to "Refund kis entry ka hai? Kaunsi service / kitne rupaye / Cash ya UPI — refund ko main wapas (reversal) ki tarah record karunga, kharcha nahi.",
            "kal" to "\"Kal\" se aapka matlab guzra hua kal hai ya aane wala kal? Date confirm karein, phir main entry bana dunga.",
            "cancelled" to "Theek hai — ye entry save nahi ki gayi. Kuch bhi tabdeel nahi hua."
        ),
        AiLanguage.NEPALI to mapOf(
            "previewHeader" to "Maile yo bujhe — confirm garnus bhane save garchu:",
            "totalLine" to "Kul: {total}",
            "askMode" to "{amount} Cash ma milyo ki UPI ma?",
            "askService" to "Yo kun service ko entry ho — Xerox, Printing, Smart Card, ki aru? Raha maile bujhe ({amount}), service bhannus.",
            "askAmount" to "Kun service ra kati rupaiya? Udaharan: \"Aaja Xerox ko 300 rupaiya cash milyo\".",
            "askAgent" to "Kun agent lai {amount} dinus? Agent ko naam bhannus.",
            "askCustomer" to "{amount} kun customer ko baki cha? Customer ko naam bhannus — baki lai ma income lekhne chhaina, matra udharo record garchu.",
            "askCommission" to "Money Transfer {amount} — commission kati milyo? (Commission nabhani ma nafa galat lekhna chahanna.)",
            "askDirection" to "Transfer kun dishama bhayo — Cash bata UPI, ki UPI bata Cash?",
            "refund" to "Refund kun entry ko ho? Kun service / kati rupaiya / Cash ki UPI — refund lai ma phirta (reversal) gari record garchu, kharcha hoina.",
            "kal" to "\"Bholiko/Bijako\" bhaneko tapai hijo bhannu bhako ki bholi? Date confirm garnus, ani ma entry banaunchu.",
            "cancelled" to "Thik cha — yo entry save garieko chhaina. Kehi pani pariwartan bhaeko chhaina."
        )
    )

    /** Template for [lang] + [key], falling back to Hinglish. Placeholders
     *  are replaced from [values] (e.g. "amount" to "₹500"). */
    fun get(lang: AiLanguage, key: String, vararg values: Pair<String, String>): String {
        val table = templates[lang] ?: templates[AiLanguage.HINGLISH]!!
        var out = table[key] ?: templates[AiLanguage.HINGLISH]!![key] ?: key
        for ((name, value) in values) out = out.replace("{$name}", value)
        return out
    }

    fun hasTemplates(lang: AiLanguage): Boolean = templates.containsKey(lang)
}
