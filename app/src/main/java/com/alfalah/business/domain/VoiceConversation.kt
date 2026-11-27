package com.alfalah.business.domain

/**
 * Voice conversation layer (UPDATE 18, 2026-11-27) — two-way voice for the
 * BizKhata AI Assistant on native Android.
 *
 * ARCHITECTURE — one AI path, not two:
 *  - The conversational intelligence behind voice is the SAME
 *    provider-neutral conversational client as text chat
 *    (CloudAiClient.converse(), reached through the existing
 *    ChatbotViewModel pipeline: send() -> handleMessage() ->
 *    handleConversational() / tryCloudConverse()). When the owner has
 *    added his AI key in Settings, that cloud conversational AI
 *    powers voice too; without a key the on-device local engine
 *    (ConversationEngine / AiAssistantParser / BusinessKnowledge)
 *    handles it. Voice builds NO separate AI path and NO separate
 *    intent logic — every transcript is routed through the existing
 *    conversation pipeline, so a spoken "Haan" confirms a preview, a
 *    spoken "Cash Book kholo" navigates, and a spoken entry gets the
 *    same preview -> confirm -> backend-verified save as typed text.
 *  - Speech-to-text stays the native Android service
 *    (SpeechRecognizer in VoiceInputHelper). Text-to-speech is NOT
 *    a device service anymore (UPDATE 25 — the owner rejected the
 *    phone's voice): spoken replies come from the real AI voice
 *    (AiVoiceClient → VoiceSpeaker/MediaPlayer), rationed to 10
 *    short replies/day with a visible counter and a hard stop, and
 *    never fall back to the device voice. That distinction is
 *    user-visible nowhere as a provider name: per UPDATE 12 the UI
 *    only ever says "BizKhata AI Assistant" / "AI voice".
 *
 *  - THIS FILE IS PURE LOGIC (no Android APIs) so it is unit-testable
 *    on the JVM and mirrored in docs/ai_assistant_mirror.py. The
 *    Android wrappers (VoiceInputHelper, VoiceSpeaker) only move
 *    strings in and out of the platform services.
 *
 * THE USER'S OWN WAY OF SPEAKING (2026-11-27 00:39 IST):
 *  ayan said he will speak in HIS own way and the AI must do it that
 *  way. There is NO rigid command grammar anywhere in the voice flow:
 *  no fixed phrases to memorise, no word-for-word script to follow.
 *  Short sentences, mixed Gujarati/Hindi/English, slang, incomplete
 *  sentences and his own word order are all understood through the
 *  existing parser (which already accepts fragments such as
 *  "Xerox 300 cash" and word-order swaps such as "300 cash Xerox").
 *  When a transcript is uncertain — low STT confidence, or a missing
 *  amount / payment mode / service / agent — the assistant asks ONE
 *  short clarification in his style ("₹500 Cash mein mila ya UPI
 *  mein?") instead of failing, staying silent, or demanding a
 *  rephrase in a fixed format. A financial action is NEVER saved
 *  from an uncertain transcription: the preview + confirm step still
 *  applies, and a voice "Haan" confirms ONLY the preview that is
 *  currently shown.
 *
 * SAFETY (unchanged from text chat):
 *  - No audio is stored anywhere; transcripts are chat text.
 *  - The mic is only active while the listening indicator is shown;
 *    continuous mode restarts listening only while its Stop/exit
 *    control is visible, and stopping it ends the session.
 *  - Money is paise (Long), never float; MT principal is never
 *    income, only commission; dues are not collected money; every
 *    write carries this profile's id and the repository checks it.
 */

/** Voice session state, shown in the chat screen at all times. */
enum class VoiceState { IDLE, LISTENING, THINKING, SPEAKING }

/** Voice preferences (persisted in SettingsStore; app-wide in v1, like
 *  the AI-language preference — see SettingsStore).
 *  UPDATE 25: the device voice is GONE (owner order 2026-11-27 —
 *  "Phone Ki Awaz Mat Do, Proper AI Ki Voice Chahiye Muje"). There is
 *  no speech rate / pitch anymore — those were device-voice settings.
 *  [voiceName] is the picked AI voice (a plain prebuilt-voice name,
 *  default "Kore"); the voice-replies toggle now controls the AI
 *  voice, off = text only. */
data class VoiceSettings(
    /** Speak replies aloud. Off = mute: chat stays text-only. */
    val responsesEnabled: Boolean = true,
    /** The picked AI voice (plain name, e.g. "Kore"). */
    val voiceName: String = AiVoiceConfig.DEFAULT_VOICE,
    /** Keep listening across turns without re-tapping the mic. */
    val continuousMode: Boolean = false
)

/** What the voice layer does with one recognised transcript. */
sealed class VoiceDecision {
    /** Route the transcript through the normal pipeline (send()). */
    data class Send(val text: String) : VoiceDecision()

    /** Stop the current spoken reply first, then route [text].
     *  [text] is blank when the user only said the interrupt phrase
     *  ("Bas, short mein batao.") — then the assistant just stops
     *  speaking and waits for the next instruction. */
    data class InterruptAndSend(val text: String) : VoiceDecision()

    /** Do NOT send: ask one short clarification instead. [reason] is
     *  "low_confidence", "empty" or "unclear" — never shown raw to
     *  the user; the ViewModel turns it into a short prompt in the
     *  user's language (VoiceText.repeatPrompt). */
    data class AskRepeat(val reason: String) : VoiceDecision()

    /** The same transcript arrived again within the duplicate window
     *  (e.g. the recogniser fired twice, or the user repeated "Haan"
     *  after the preview was already confirmed) — drop it so exactly
     *  one entry can ever result. */
    object IgnoreDuplicate : VoiceDecision()

    /** Blank / noise-only transcript — drop silently. */
    object IgnoreEmpty : VoiceDecision()
}

/**
 * Interruption phrases — the user stopping the assistant mid-speech.
 * Checked on the normalised transcript BEFORE the pipeline, so
 * "Bas, short mein batao. Aaj kitna profit hua?" stops the speech
 * AND processes the profit question, and a bare "Bas." just stops.
 * Matching is prefix-based on purpose: the instruction that follows
 * the interrupt phrase is the user's own wording, in any order.
 */
object VoiceInterrupt {
    private val phrases = listOf(
        "bas short mein batao", "bas short me batao", "short mein batao",
        "short me batao", "bas bas", "bas", "ruk", "ruko", "ruk jao",
        "stop", "chup", "chup ho jao", "bas karo", "band karo"
    )

    /**
     * Returns the text after the interrupt phrase, or "" when the
     * whole transcript IS the interrupt phrase, or null when the
     * transcript does not start with an interrupt phrase.
     */
    fun stripInterruptPrefix(text: String): String? {
        // Normalise punctuation first ("Bas, short mein batao." ->
        // "bas short mein batao"), then match the prefix on the
        // normalised form and return the remainder from that same
        // form — the pipeline normalises again anyway, so the user's
        // own words (not their capitalisation) are what matters.
        val n = text.trim().lowercase()
            .replace(Regex("[.,!?]+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        for (phrase in phrases.sortedByDescending { it.length }) {
            if (n == phrase) return ""
            if (n.startsWith("$phrase ")) return n.substring(phrase.length).trim()
        }
        return null
    }

    fun isInterruptOnly(text: String): Boolean = stripInterruptPrefix(text) == ""
}

/**
 * The transcript gate — the single place that decides whether a
 * recognised transcript reaches the conversation pipeline at all.
 * Order matters: empty -> interrupt -> duplicate -> low confidence
 * -> send. Nothing here invents an amount, mode, service, customer
 * or agent; anything missing is left for the pipeline's own short
 * clarification (Clarify result), never guessed.
 */
object VoicePipeline {
    /** Below this STT confidence the transcript is not trusted for
     *  a financial action (or any action): ask to repeat instead.
     *  UPDATE 25: unified with the website (0.5) — the same mumble
     *  is not "repeat please" on one surface and "send" on the
     *  other. A confidence of exactly -1f means "the recogniser gave
     *  no score" — treat that as unknown, not as low. */
    const val MIN_CONFIDENCE = 0.5f

    /** Same normalised transcript inside this window is a repeat
     *  firing, not a second instruction. UPDATE 25: unified with
     *  the website (5 s). */
    const val DUPLICATE_WINDOW_MS = 5000L

    fun decide(
        transcript: String,
        /** STT confidence 0.0–1.0, or -1f when the recogniser gave none. */
        confidence: Float,
        isSpeaking: Boolean,
        lastTranscript: String?,
        lastTranscriptAtMs: Long,
        nowMs: Long
    ): VoiceDecision {
        val text = transcript.trim()
        if (text.isBlank()) return VoiceDecision.IgnoreEmpty

        // Interruption wins over everything else, even while speaking.
        val afterInterrupt = VoiceInterrupt.stripInterruptPrefix(text)
        if (afterInterrupt != null) return VoiceDecision.InterruptAndSend(afterInterrupt)

        // Duplicate firing: same words, moments apart.
        val norm = AiAssistantParser.normalise(text)
        if (lastTranscript != null &&
            AiAssistantParser.normalise(lastTranscript) == norm &&
            nowMs - lastTranscriptAtMs in 0..DUPLICATE_WINDOW_MS
        ) return VoiceDecision.IgnoreDuplicate

        // Uncertain transcription: never send, never guess — ask.
        if (confidence >= 0f && confidence < MIN_CONFIDENCE) {
            return VoiceDecision.AskRepeat("low_confidence")
        }
        // A transcript with no usable words (e.g. only "uh", "hmm").
        if (norm.length < 2) return VoiceDecision.AskRepeat("unclear")

        return VoiceDecision.Send(text)
    }
}

/**
 * Continuous conversation mode — a tiny state machine so the mic is
 * never secretly active: listening restarts ONLY while the session
 * is active and the user has not pressed Stop / exited, and every
 * restart is visible through VoiceState.LISTENING + the on-screen
 * indicator. Silence ends a turn via the recogniser's own
 * onEndOfSpeech / timeout; the state machine only decides whether
 * the NEXT turn starts listening again.
 */
object ContinuousMode {
    data class Session(val active: Boolean, val turns: Int, val userStopped: Boolean)

    fun start(): Session = Session(active = true, turns = 0, userStopped = false)
    fun stop(session: Session): Session = session.copy(active = false, userStopped = true)

    /** After a result was processed: listen again if the session is
     *  still active and the user did not stop it. */
    fun shouldRestartAfterResult(session: Session): Boolean =
        session.active && !session.userStopped

    /** After the spoken reply finished: same rule — the mic only
     *  comes back when the user asked for continuous mode and has
     *  not exited it. */
    fun shouldRestartAfterSpeech(session: Session): Boolean =
        session.active && !session.userStopped

    fun nextTurn(session: Session): Session = session.copy(turns = session.turns + 1)
}

/**
 * Text prepared for speaking: the assistant's reply as TEXT stays
 * exactly as shown in chat; what is SPOKEN is a cleaned version —
 * markdown, bullets, tables and symbols are stripped so the voice
 * does not read formatting aloud, and ₹ becomes "rupaye". UPDATE 25:
 * long replies are spoken only up to the AI-voice cap (first 2
 * sentences / 400 characters — the full text stays on screen to
 * read); the cap notice is itself spoken so the user is never
 * misled into thinking the reply ended. One speech call per reply,
 * never more. Delegates to [AiVoiceText.shortenForVoice] (the single
 * spoken-text rule for the AI voice).
 */
object VoiceText {
    /** Spoken cap: first 2 sentences / ~400 characters (UPDATE 25 —
     *  the AI voice is rationed to 10 short replies/day, so a long
     *  reply must never spend a whole call on itself). */
    const val SPOKEN_CAP_CHARS = AiVoiceConfig.SPOKEN_CAP_CHARS

    fun speakable(text: String): String = AiVoiceText.shortenForVoice(text)

    /** One short "please repeat" prompt, in the user's language.
     *  Never a demand to rephrase in a fixed format — just "boliye,
     *  main sun raha hoon" (I'm listening, please say it again). */
    fun repeatPrompt(lang: AiLanguage): String = when (lang) {
        AiLanguage.ENGLISH ->
            "I couldn't hear that clearly — please say it once more, I'm listening."
        AiLanguage.HINDI ->
            "Aawaz saaf nahi aayi — ek baar phir se boliye, main sun raha hoon."
        AiLanguage.GUJARATI ->
            "Avaj saras nathi sambhlayo — ek var phari bolo, hu sambhlu chhu."
        AiLanguage.MARATHI ->
            "Aawaz spasht aala nahi — ekda parat bola, mi aikto ahe."
        else ->
            "Aawaz saaf nahi aayi — ek baar phir se boliye, main sun raha hoon."
    }

    /** Short acknowledgement after a bare interrupt ("Bas."). */
    fun interruptAck(lang: AiLanguage): String = when (lang) {
        AiLanguage.ENGLISH -> "Okay — stopped. I'm listening, go ahead."
        AiLanguage.HINDI -> "Theek hai — ruk gaya. Boliye, main sun raha hoon."
        AiLanguage.GUJARATI -> "Theek chhe — ubho rahyo. Bolo, hu sambhlu chhu."
        else -> "Theek hai — ruk gaya. Boliye, main sun raha hoon."
    }

    /**
     * Short clarification for a missing field, in the user's
     * language, reusing the same templates the typed pipeline uses
     * (MultilingualReplies) — so voice and text ask the same short
     * question, e.g. "₹500 Cash mein mila ya UPI mein?".
     * [missing] is one of "payment mode" / "service" / "amount" /
     * "agent" / "customer" / "commission". [amountText] is the
     * already-understood amount, e.g. "₹500", or "" when unknown.
     */
    fun clarificationForMissing(lang: AiLanguage, missing: String, amountText: String): String {
        val key = when (missing) {
            "payment mode" -> "askMode"
            "service" -> "askService"
            "amount" -> "askAmount"
            "agent" -> "askAgent"
            "customer" -> "askCustomer"
            "commission" -> "askCommission"
            else -> "askAmount"
        }
        return MultilingualReplies.get(lang, key, "amount" to amountText.ifBlank { "ye" })
    }
}

/**
 * Natural-phrasing check (the "his own way" rule, testable): a
 * message is understood when the existing parser produces anything
 * other than Unknown — a fragment, a word-order swap, slang, or a
 * mixed-language sentence all count. A plan ("Kal PAN Card ke 5
 * application karne hain") is NOT an entry: it must never become a
 * financial Action — it is a plan / clarification, never a save.
 */
object VoiceNaturalPhrasing {
    fun understands(
        text: String,
        context: AiAssistantParser.AiConversationContext,
        agents: List<String>,
        customers: List<String>
    ): Boolean {
        val result = AiAssistantParser.parse(text, context, agents, customers)
        return result !is AiAssistantParser.AiParseResult.Unknown
    }

    /** A spoken plan must never be treated as a financial entry. */
    fun isFinancialAction(
        text: String,
        context: AiAssistantParser.AiConversationContext,
        agents: List<String>,
        customers: List<String>
    ): Boolean {
        val result = AiAssistantParser.parse(text, context, agents, customers)
        return result is AiAssistantParser.AiParseResult.Action
    }
}
