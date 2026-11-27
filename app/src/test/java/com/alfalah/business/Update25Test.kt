package com.alfalah.business

import com.alfalah.business.domain.AiAssistantParser
import com.alfalah.business.domain.AiLanguage
import com.alfalah.business.domain.AiVoiceConfig
import com.alfalah.business.domain.AiVoiceRequest
import com.alfalah.business.domain.AiVoiceText
import com.alfalah.business.domain.CloudAiClient
import com.alfalah.business.domain.ConversationEngine
import com.alfalah.business.domain.ConversationIntent
import com.alfalah.business.domain.Meaning
import com.alfalah.business.domain.Multilingual
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.domain.VoiceInterrupt
import com.alfalah.business.domain.VoicePipeline
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * UPDATE 25 — BizKhata AI Assistant improvement (voice + chat
 * understanding). Mirrors the diagnosis test sets §E (voice V1–V11
 * behaviour that can be checked without a network/key, and
 * comprehension E.2 cases 1–24 that the local engine can decide).
 *
 * NOT run on a JVM here (no JDK on this VM) — the same cases are
 * mirrored in docs/ai_assistant_mirror.py and run there; the counts
 * are reported in android/docs/AI_TEST_REPORT_UPDATE25.md. Live
 * voice quality, latency and the exact daily quota can only be
 * checked on the owner's phone, with his key.
 *
 * Money is paise (Long) everywhere. No demo numbers are used as
 * expectations — every expected figure is computed from the case's
 * own input.
 */
class Update25Test {

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    private val ctx = AiAssistantParser.AiConversationContext(dayEpoch = today)
    private val agents = listOf("Ramesh", "Suresh")
    private val customers = listOf("Rahul", "Sana", "Ramesh")

    private fun parse(text: String, context: AiAssistantParser.AiConversationContext = ctx) =
        AiAssistantParser.parse(text, context, agents, customers)

    private fun conversational(
        text: String,
        context: AiAssistantParser.AiConversationContext = ctx
    ): AiAssistantParser.AiParseResult.Conversational {
        val result = parse(text, context)
        assertTrue("expected Conversational for: $text (got $result)", result is AiAssistantParser.AiParseResult.Conversational)
        return result as AiAssistantParser.AiParseResult.Conversational
    }

    private fun action(
        text: String,
        context: AiAssistantParser.AiConversationContext = ctx
    ): AiAssistantParser.AiParseResult.Action {
        val result = parse(text, context)
        assertTrue("expected Action for: $text (got $result)", result is AiAssistantParser.AiParseResult.Action)
        return result as AiAssistantParser.AiParseResult.Action
    }

    // ------------------------------------------------------------------
    // Voice — caps, quota, voices, shortening, request shape.
    // ------------------------------------------------------------------

    @Test
    fun voiceCap_dailyLimitIs10() {
        assertEquals(10, AiVoiceConfig.DAILY_LIMIT)
    }

    @Test
    fun voiceCap_shortReplyCap400CharsAnd21sGap() {
        assertEquals(400, AiVoiceConfig.SPOKEN_CAP_CHARS)
        assertEquals(21_000L, AiVoiceConfig.MIN_GAP_MS)
    }

    @Test
    fun voiceVoices_defaultKoreFourVoices() {
        assertEquals("Kore", AiVoiceConfig.DEFAULT_VOICE)
        assertEquals(listOf("Kore", "Puck", "Charon", "Fenrir"), AiVoiceConfig.VOICES)
    }

    @Test
    fun voiceQuota_pacificDayResetsAtMidnightPacific() {
        // 2026-11-27 00:30 Pacific = 08:30 UTC.
        val ms = Instant.parse("2026-11-27T08:30:00Z").toEpochMilli()
        assertEquals("2026-11-27", AiVoiceConfig.pacificDay(ms))
        assertFalse(AiVoiceConfig.isNewDay("2026-11-27", ms))
        assertTrue(AiVoiceConfig.isNewDay("2026-11-26", ms))
        assertTrue(AiVoiceConfig.isNewDay("", ms))
        assertEquals("AI awaz: 3/10", AiVoiceConfig.quotaLabel(3))
        assertEquals("AI awaz: 10/10", AiVoiceConfig.quotaLabel(10))
    }

    @Test
    fun voiceShorten_longReplySpeaksFirstTwoSentencesOnly() {
        val long = "Aaj Xerox ke 300 cash hue. UPI se 200 aaye. " +
            "Aur kal ke 200 bhi add karne hain, aur agent ko 100 dene hain, " +
            "aur printer ki servicing bhi karani hai."
        val short = AiVoiceText.shortenForVoice(long)
        assertTrue("must keep sentence 1: $short", short.contains("Aaj Xerox ke 300 cash hue."))
        assertTrue("must keep sentence 2: $short", short.contains("UPI se 200 aaye."))
        assertFalse("must drop sentence 3: $short", short.contains("kal ke 200"))
        assertTrue("must say the rest is in chat: $short", short.contains("aage ka jawab aap chat mein padh sakte hain."))
        assertTrue("spoken text stays short", short.length <= AiVoiceConfig.SPOKEN_CAP_CHARS + 60)
    }

    @Test
    fun voiceShorten_shortReplyUnchanged() {
        val reply = "Main badhiya hoon! Tum batao, aaj shop ka kaam kaisa chal raha hai?"
        assertEquals(reply, AiVoiceText.shortenForVoice(reply))
        assertEquals("", AiVoiceText.shortenForVoice("   "))
    }

    @Test
    fun voiceShorten_stripsMarkdownLinksAndRupees() {
        val reply = "Total **₹500** cash hua — details https://example.com/a par hain."
        val short = AiVoiceText.shortenForVoice(reply)
        assertFalse("no rupee sign in speech: $short", short.contains("₹"))
        assertTrue("rupaye spoken instead: $short", short.contains("rupaye"))
        assertFalse("no markdown in speech: $short", short.contains("**"))
        assertFalse("no raw link in speech: $short", short.contains("https://"))
    }

    @Test
    fun voiceRequest_jsonShapeAndAudioExtraction() {
        val json = AiVoiceRequest.buildJson("Namaste, aaj ka hisab batao.", "Kore")
        assertTrue("speech metadata style: $json", json.contains("speech_metadata"))
        assertTrue("voice name: $json", json.contains("Kore"))
        assertTrue("reply text: $json", json.contains("Namaste, aaj ka hisab batao."))
        assertTrue("user input: $json", json.contains("user_input"))
        assertTrue("audio format: $json", json.contains("\"audio\""))
        val audio = "UklGRi" + "A".repeat(200)
        val reply = "{\"steps\":[{\"content\":[{\"type\":\"audio\",\"data\":\"$audio\"}]}]}"
        assertEquals(audio, AiVoiceRequest.extractAudioBase64(reply))
        assertNull(AiVoiceRequest.extractAudioBase64("{\"steps\":[{\"content\":[{\"data\":\"short\"}]}]}"))
        assertNull(AiVoiceRequest.extractAudioBase64("{}"))
    }

    @Test
    fun voiceHonestLines_noKeyAndQuotaFinished() {
        val noKey = AiVoiceText.noKeyLine(AiLanguage.HINGLISH)
        assertTrue("no-key line guides to Settings: $noKey", noKey.contains("Settings"))
        val done = AiVoiceText.quotaFinishedLine(AiLanguage.HINGLISH)
        assertTrue("quota line names tomorrow: $done", done.contains("kal subah"))
        assertFalse("quota line never promises device voice: $done", done.contains("phone ki awaz"))
    }

    @Test
    fun stt_unifiedConfidenceAndDuplicateWindow() {
        assertEquals(0.5f, VoicePipeline.MIN_CONFIDENCE)
        assertEquals(5000L, VoicePipeline.DUPLICATE_WINDOW_MS)
    }

    // ------------------------------------------------------------------
    // C-1 — follow-up amount merges into the pending preview.
    // ------------------------------------------------------------------

    @Test
    fun c1_followUpAmountMergesIntoPendingPreview() {
        // The 04:27 IST sequence: "Aaj Xerox ke 300 cash hue" then
        // "Aur 200 UPI" — both must be saved on "Ha".
        val first = action("Aaj Xerox ke 300 cash hue")
        val firstAction = first.action as AiAssistantParser.AiAction.DailyEntries
        assertEquals(1, firstAction.entries.size)
        assertEquals(30_000L, firstAction.entries[0].amountPaise)
        assertEquals(PaymentMode.CASH, firstAction.entries[0].mode)
        val followCtx = ctx.copy(
            lastService = ServiceType.XEROX, lastServiceLabel = "Xerox",
            lastMode = PaymentMode.CASH
        )
        val follow = AiAssistantParser.parseFollowUpAmount("Aur 200 UPI", followCtx)
        assertNotNull("follow-up must parse: Aur 200 UPI", follow)
        assertEquals(1, follow!!.entries.size)
        assertEquals(20_000L, follow.entries[0].amountPaise)
        assertEquals(PaymentMode.UPI, follow.entries[0].mode)
        assertEquals(ServiceType.XEROX, follow.entries[0].service)
        // The merged preview (300 cash + 200 UPI) is a different
        // idempotency key from either half — no double-save.
        val merged = AiAssistantParser.AiAction.DailyEntries(
            firstAction.entries + follow.entries, today
        )
        assertNotEquals(
            AiAssistantParser.canonicalDaily(firstAction.entries),
            AiAssistantParser.canonicalDaily(merged.entries)
        )
    }

    // ------------------------------------------------------------------
    // C-2 — "Ha" + entry is not swallowed.
    // ------------------------------------------------------------------

    @Test
    fun c2_yesPlusEntryNotSwallowed() {
        assertEquals(
            "aur 200 upi bhi add kar do",
            AiAssistantParser.stripLeadingYes("ha aur 200 upi bhi add kar do")
        )
        assertEquals("", AiAssistantParser.stripLeadingYes("ha"))
        assertEquals("", AiAssistantParser.stripLeadingYes("haan"))
        assertNull(AiAssistantParser.stripLeadingYes("aaj xerox ke 300 cash hue"))
        assertNull(AiAssistantParser.stripLeadingYes("nahi, 500 nahi 600 tha"))
    }

    // ------------------------------------------------------------------
    // C-3 — correction picks the right number.
    // ------------------------------------------------------------------

    @Test
    fun c3_correctionPicksRightNumber() {
        // "nahi, 500 nahi 600 tha" (old ₹300 preview) → ₹600, not ₹500.
        val pair = AiAssistantParser.correctionPair("nahi, 500 nahi 600 tha")
        assertEquals(50_000L, pair.first)
        assertEquals(60_000L, pair.second)
        assertEquals(60_000L, AiAssistantParser.correctedPreviewAmount("nahi, 500 nahi 600 tha"))
        // And the reverse: "nahi, 600 nahi 500 tha" → ₹500.
        assertEquals(50_000L, AiAssistantParser.correctedPreviewAmount("nahi, 600 nahi 500 tha"))
        // A single number is the rejected (old) one, never a new amount.
        val single = AiAssistantParser.correctionPair("nahi 500 tha")
        assertEquals(50_000L, single.first)
        assertNull(single.second)
    }

    // ------------------------------------------------------------------
    // C-4 — number words route.
    // ------------------------------------------------------------------

    @Test
    fun c4_numberWordsRoute() {
        val first = action("do sau xerox cash hue")
        val entries = (first.action as AiAssistantParser.AiAction.DailyEntries).entries
        assertEquals(1, entries.size)
        assertEquals(20_000L, entries[0].amountPaise)
        assertEquals(PaymentMode.CASH, entries[0].mode)
        val second = action("teen sau printing upi hue")
        val entries2 = (second.action as AiAssistantParser.AiAction.DailyEntries).entries
        assertEquals(30_000L, entries2[0].amountPaise)
        assertEquals(PaymentMode.UPI, entries2[0].mode)
    }

    // ------------------------------------------------------------------
    // C-5 — greeting must not hijack a question with profit in it.
    // ------------------------------------------------------------------

    @Test
    fun c5_greetingDoesNotHijackProfitQuestion() {
        val result = parse("Aaj su chale chhe, ketlo profit thayo?")
        assertTrue("profit question must be factual, not casual: $result", result is AiAssistantParser.AiParseResult.Factual)
        val greeting = conversational("Kaise ho bhai")
        assertEquals("casual_greeting", greeting.intent)
        assertTrue("greeting still warm: ${greeting.text}", greeting.text.contains("Main badhiya hoon"))
    }

    // ------------------------------------------------------------------
    // C-6 — no proactive module suggestion; explicit request still specs.
    // ------------------------------------------------------------------

    @Test
    fun c6_noProactiveModuleSuggestionButExplicitRequestStillSpecs() {
        val meaning = Meaning(
            ConversationIntent.QUESTION_GENERAL, "external_limit", null, null, null,
            "UIDAI portal par Aadhaar update kar do",
            "uidai portal par aadhaar update kar do",
            AiLanguage.HINGLISH
        )
        val reply = ConversationEngine.composeLocal(meaning, ctx)
        assertEquals("external_limit", reply.intent)
        assertFalse("must not suggest asking for a module: ${reply.text}", reply.text.contains("module request"))
        assertFalse("must not offer a development request: ${reply.text}", reply.text.contains("development request"))
        assertTrue("must offer what BizKhata CAN do: ${reply.text}", reply.text.contains("Aadhaar Services"))
        // EXPLICIT request (UPDATE 20 behaviour): spec, confirm,
        // queue — never a claim it is built.
        val explicit = conversational("Aadhaar Mobile Number Update ka module bana do")
        assertEquals("app_change_spec", explicit.intent)
        assertNotNull("explicit request still produces a spec", explicit.appChangeSpec)
        assertFalse("never claimed built at spec time", explicit.appChangeConfirmed)
    }

    // ------------------------------------------------------------------
    // C-7 — key-status intent.
    // ------------------------------------------------------------------

    @Test
    fun c7_keyStatusUnderstood() {
        assertTrue(AiAssistantParser.isKeyStatusMessage("mene key dal di starting me"))
        assertTrue(AiAssistantParser.isKeyStatusMessage("key dal di hai"))
        assertFalse(AiAssistantParser.isKeyStatusMessage("aaj xerox ke 300 cash hue"))
        assertFalse(AiAssistantParser.isKeyStatusMessage("key kya hai"))
    }

    // ------------------------------------------------------------------
    // C-8 — how to add the day's business ("dhadhe").
    // ------------------------------------------------------------------

    @Test
    fun c8_howToAddDhadhe() {
        val result = parse("Batana Nahi Hai Kaise Add Karu Dhadhe Ka")
        assertTrue("how-to-add must be help, not figures: $result", result is AiAssistantParser.AiParseResult.Help)
        assertEquals("daily_report", (result as AiAssistantParser.AiParseResult.Help).topic)
    }

    // ------------------------------------------------------------------
    // C-9 — local general knowledge (capital).
    // ------------------------------------------------------------------

    @Test
    fun c9_localGeneralKnowledgeCapital() {
        val reply = conversational("Bharat ki rajdhani kya hai?")
        assertEquals("general", reply.intent)
        assertTrue("capital answer: ${reply.text}", reply.text.contains("New Delhi"))
    }

    // ------------------------------------------------------------------
    // C-10 — internal transfer routing.
    // ------------------------------------------------------------------

    @Test
    fun c10_internalTransferBothDirections() {
        val cashToUpi = action("1000 cash se UPI kar do")
        val transfer = cashToUpi.action as AiAssistantParser.AiAction.InternalTransfer
        assertEquals(100_000L, transfer.amountPaise)
        assertEquals(PaymentMode.CASH, transfer.from)
        assertTrue("never income/expense: ${cashToUpi.preview}", cashToUpi.preview.contains("income ya kharcha NAHI"))
        val upiToCash = action("500 upi se cash kar do")
        val back = upiToCash.action as AiAssistantParser.AiAction.InternalTransfer
        assertEquals(50_000L, back.amountPaise)
        assertEquals(PaymentMode.UPI, back.from)
    }

    // ------------------------------------------------------------------
    // C-11 — multi-date entries keep their own day.
    // ------------------------------------------------------------------

    @Test
    fun c11_multiDateEntriesKeepTheirOwnDay() {
        val result = action("Aaj printing ke 150 cash hue, aur kal ke 200 upi bhi add kar do")
        val entries = (result.action as AiAssistantParser.AiAction.DailyEntries).entries
        assertEquals(2, entries.size)
        assertEquals(15_000L, entries[0].amountPaise)
        assertEquals(PaymentMode.CASH, entries[0].mode)
        assertNull("today's entry keeps the action day", entries[0].dayEpoch)
        assertEquals(20_000L, entries[1].amountPaise)
        assertEquals(PaymentMode.UPI, entries[1].mode)
        assertEquals("yesterday's entry is dated yesterday", today - 1, entries[1].dayEpoch)
        assertTrue("preview marks yesterday: ${result.preview}", result.preview.contains("(kal)"))
        // A lone "kal" still clarifies — the date is never guessed.
        val lone = parse("Kal ke 200 xerox cash hue")
        assertTrue("lone kal must clarify: $lone", lone is AiAssistantParser.AiParseResult.Clarify)
        assertEquals(listOf("date"), (lone as AiAssistantParser.AiParseResult.Clarify).missing)
    }

    // ------------------------------------------------------------------
    // C-12 — due split: received + due = total.
    // ------------------------------------------------------------------

    @Test
    fun c12_dueSplitReceivedPlusDueEqualsTotal() {
        val result = parse("Ramesh ne 200 diye, baaki 300 udhaar")
        assertTrue("due split must clarify the missing service: $result", result is AiAssistantParser.AiParseResult.Clarify)
        val clarify = result as AiAssistantParser.AiParseResult.Clarify
        assertTrue("missing service: ${clarify.missing}", clarify.missing.contains("service"))
        val partial = clarify.partial as? AiAssistantParser.AiAction.RecordCustomerDue
        assertNotNull("partial due must be carried: $clarify", partial)
        assertEquals("Ramesh", partial!!.customerName)
        assertEquals("total is received + due: 200 + 300", 50_000L, partial.amountPaise)
        assertEquals("received part kept, not dropped", 20_000L, partial.receivedPaise)
        assertNull("mode still to ask — never invented", partial.receivedMode)
    }

    // ------------------------------------------------------------------
    // C-13 — "likho" translates one reply; "samjhao" switches.
    // ------------------------------------------------------------------

    @Test
    fun c13_translateVsSwitch() {
        val translate = conversational("Aur English mein likho")
        assertEquals("translate_reply", translate.intent)
        assertEquals(AiLanguage.ENGLISH, translate.requestedLanguage)
        val switch = conversational("Mujhe English mein samjhao")
        assertEquals("language_request", switch.intent)
        assertEquals(AiLanguage.ENGLISH, switch.requestedLanguage)
        val switchGu = conversational("Mujhe Gujarati mein samjhao")
        assertEquals("language_request", switchGu.intent)
        assertEquals(AiLanguage.GUJARATI, switchGu.requestedLanguage)
    }

    // ------------------------------------------------------------------
    // C-14 — Hinglish markers + low-confidence fallback.
    // ------------------------------------------------------------------

    @Test
    fun c14_hinglishMarkersAndLowConfidenceFallback() {
        assertEquals(AiLanguage.HINGLISH, Multilingual.detectLanguage("Aur 200 UPI").language)
        assertEquals(AiLanguage.HINGLISH, Multilingual.detectLanguage("Mujhe samjhao").language)
        assertEquals(AiLanguage.HINGLISH, Multilingual.detectLanguage("Kaise Ho Bhai").language)
        assertEquals(AiLanguage.GUJARATI, Multilingual.detectLanguage("Aaje su chale chhe?").language)
        // A bare number carries no language signal — the parser keeps
        // the conversation's last language (never flips on it).
        val bare = Multilingual.detectLanguage("300")
        assertEquals(AiLanguage.UNKNOWN, bare.language)
        assertEquals(0.0, bare.confidence, 0.001)
    }

    // ------------------------------------------------------------------
    // C-15 — cloud reply language check.
    // ------------------------------------------------------------------

    @Test
    fun c15_cloudReplyLanguageChecked() {
        assertFalse(CloudAiClient.isWrongLanguage("Aaj Xerox ke 300 cash hue", AiLanguage.HINGLISH))
        assertFalse("short/mixed text is never flagged", CloudAiClient.isWrongLanguage("Aur 200 UPI", AiLanguage.HINGLISH))
        assertTrue(
            "a confident English reply to a Hinglish chat is wrong-language",
            CloudAiClient.isWrongLanguage("What is the total income today please tell me", AiLanguage.HINGLISH)
        )
    }

    // ------------------------------------------------------------------
    // C-17 — typed interrupt ("Bas, short mein batao").
    // ------------------------------------------------------------------

    @Test
    fun c17_typedInterruptPrefix() {
        assertEquals("", VoiceInterrupt.stripInterruptPrefix("Bas, short mein batao"))
        assertEquals("yeh batao kitna profit hua", VoiceInterrupt.stripInterruptPrefix("Bas, yeh batao kitna profit hua"))
        assertTrue(VoiceInterrupt.isInterruptOnly("Bas"))
        assertNull(VoiceInterrupt.stripInterruptPrefix("Aaj Xerox ke 300 cash hue"))
    }

    // ------------------------------------------------------------------
    // C-18 — ordinal delete picks the shown order.
    // ------------------------------------------------------------------

    @Test
    fun c18_ordinalDeletePicksShownOrder() {
        assertEquals(0, AiAssistantParser.ordinalIndex("pehli wali entry hata do"))
        assertEquals(0, AiAssistantParser.ordinalIndex("pehla wala delete kar do"))
        assertEquals(1, AiAssistantParser.ordinalIndex("dusra wala delete kar do"))
        assertEquals(1, AiAssistantParser.ordinalIndex("doosri entry delete kar do"))
        assertEquals(2, AiAssistantParser.ordinalIndex("teesri entry delete kar do"))
        assertNull(AiAssistantParser.ordinalIndex("600 wali aadhaar entry delete kar do"))
        assertNull(AiAssistantParser.ordinalIndex("isko remove kar do"))
    }

    // ------------------------------------------------------------------
    // Regression guards — UPDATE 23 delete, Marathi guard.
    // ------------------------------------------------------------------

    @Test
    fun regression_deletePronounStillResolvesToLastSaved() {
        val savedCtx = ctx.copy(
            lastSavedEntry = AiAssistantParser.LastSavedEntry(
                transactionId = 42L, label = "Aadhaar 600 (UPI)",
                serviceLabel = "Aadhaar", amountPaise = 60_000L,
                mode = PaymentMode.UPI, dayEpoch = today
            )
        )
        val result = action("Isko remove kar do", savedCtx)
        val delete = result.action as AiAssistantParser.AiAction.DeleteTransaction
        assertEquals(42L, delete.transactionId)
        // An amount-only delete never blind-deletes — it clarifies
        // which exact entry (the ViewModel resolves it).
        val amountOnly = parse("600 wali Aadhaar entry delete kar do", savedCtx)
        assertTrue("amount-only delete must clarify: $amountOnly", amountOnly is AiAssistantParser.AiParseResult.Clarify)
        assertEquals(
            listOf("exact entry"),
            (amountOnly as AiAssistantParser.AiParseResult.Clarify).missing
        )
    }

    @Test
    fun regression_greetingNeverAnsweredWithNoRecords() {
        val reply = conversational("Kaise Ho Bhai")
        assertTrue(reply.text.contains("Main badhiya hoon"))
        assertFalse(reply.text.contains("koi record nahi", ignoreCase = true))
        assertFalse(reply.text.contains("no record", ignoreCase = true))
    }
}
