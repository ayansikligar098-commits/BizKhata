package com.alfalah.business

import com.alfalah.business.domain.AiAssistantParser
import com.alfalah.business.domain.AiLanguage
import com.alfalah.business.domain.Multilingual
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.domain.parsePeriod
import com.alfalah.business.domain.AiPeriod
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * MULTILINGUAL AI TEST SUITE (UPDATE 13 §9) — BizKhata AI Assistant in
 * all 22 scheduled Indian languages + English.
 *
 * Every language is tested in NATIVE SCRIPT, ROMANIZED typing and a
 * MIXED sentence — the difficult real-world forms, not translations —
 * plus spelling variants, dialects, voice-to-text style input (dropped
 * verbs, misheard number words), follow-ups and yes/no words.
 * The same scenarios are mirrored in docs/ai_assistant_mirror.py (no
 * JDK on this VM); the measured accuracy from that run is reported in
 * the delivery notes, per language. Device / live runs remain pending
 * in Android Studio.
 *
 * Money is paise (Long) everywhere. Expected figures come from the
 * scenario's own input, never from demo numbers.
 */
class MultilingualAiTest {

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    private val ctx = AiAssistantParser.AiConversationContext(dayEpoch = today)
    private val agents = listOf("Ramesh", "Suresh")
    private val customers = listOf("Rahul", "Sana")

    private data class LangIncome(
        val lang: AiLanguage,
        val text: String,
        val expected: List<Triple<ServiceType, Long, PaymentMode>>
    )

    private fun parseEntries(text: String): List<AiAssistantParser.AiDailyEntry> {
        val result = AiAssistantParser.parse(text, ctx, agents, customers)
        assertTrue("expected Action for: $text (got $result)", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue("expected DailyEntries for: $text", action is AiAssistantParser.AiAction.DailyEntries)
        return (action as AiAssistantParser.AiAction.DailyEntries).entries
    }

    private fun checkIncome(c: LangIncome) {
        val entries = parseEntries(c.text)
        assertEquals("entries for: ${c.text}", c.expected.size, entries.size)
        c.expected.forEachIndexed { i, (service, amount, mode) ->
            assertEquals("service for: ${c.text}", service, entries[i].service)
            assertEquals("amount for: ${c.text}", amount, entries[i].amountPaise)
            assertEquals("mode for: ${c.text}", mode, entries[i].mode)
        }
    }

    private fun langIncomeCases(): List<LangIncome> = listOf(
        LangIncome(AiLanguage.ENGLISH, "Today Xerox 300 rupees cash received.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.ENGLISH, "Today Xerox 300 cash and 200 UPI received.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.HINDI, "आज Xerox के ३०० रुपये कैश मिले।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.HINGLISH, "Aaj Xerox ke 300 rupaye cash hue.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.HINGLISH, "Aaj Xerox ke 300 cash aur 200 UPI hue.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.GUJARATI, "આજે Xerox ના ૩૦૦ રૂપિયા cash મળ્યા।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.GUJARATI, "Aaje Xerox na 300 cash ane 200 UPI thaya.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.GUJARATI, "Aaje Xerox na 500 cash ane 200 UPI thaya.",
            listOf(Triple(ServiceType.XEROX, 50_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.MARATHI, "आज Xerox चे ३०० रुपये cash मिळाले.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MARATHI, "Aaj Xerox che 300 cash milale.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MARATHI, "Aaj Xerox che 300 cash ani 200 UPI milale.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.BENGALI, "আজ Xerox এর ৩০০ টাকা cash হয়েছে।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.BENGALI, "Aaj Xerox er 300 taka cash hoyeche.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.BENGALI, "Aaj Xerox er 300 cash ar 200 UPI hoyeche.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.PUNJABI, "ਅੱਜ Xerox ਦੇ 300 ਰੁਪਏ cash ਮਿਲੇ।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.PUNJABI, "Aaj Xerox de 300 rupaye cash mile.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.PUNJABI, "Aaj Xerox de 300 cash te 200 UPI mile.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.TAMIL, "இன்று Xerox 300 ரூபாய் cash வந்தது.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.TAMIL, "Inniki Xerox 300 cash vandhadhu.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.TAMIL, "Inniki Xerox 300 cash mattrum 200 UPI vandhadhu.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.TELUGU, "ఈరోజు Xerox 300 రూపాయలు cash వచ్చింది.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.TELUGU, "Eeroju Xerox 300 cash vachindi.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.TELUGU, "Eeroju Xerox 300 cash mariyu 200 UPI vachindi.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.KANNADA, "ಇಂದು Xerox 300 ರೂಪಾಯಿ cash ಬಂತು.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.KANNADA, "Indu Xerox 300 cash bandide.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.KANNADA, "Indu Xerox 300 cash mattu 200 UPI bandide.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.MALAYALAM, "ഇന്ന് Xerox 300 രൂപ cash കിട്ടി.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MALAYALAM, "Innu Xerox 300 cash kitti.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MALAYALAM, "Innu Xerox 300 cash pinne 200 UPI kitti.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.ODIA, "ଆଜି Xerox 300 ଟଙ୍କା cash ମିଳିଲା।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.ODIA, "Aji Xerox 300 tanka cash milila.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.ODIA, "Aji Xerox 300 cash au 200 UPI milila.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.ASSAMESE, "আজি Xerox ৩০০ টকা cash পালোঁ।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.ASSAMESE, "Aji Xerox 300 toka cash palo.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.ASSAMESE, "Aji Xerox 300 cash aru 200 UPI palo.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.URDU, "آج Xerox کے 300 روپے cash ملے۔",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.URDU, "Aaj Xerox ke 300 rupaye cash mile.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.URDU, "Aaj Xerox ke 300 cash aur 200 UPI mile.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.SANSKRIT, "अद्य Xerox ३०० रुपये cash प्राप्तम्।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.SANSKRIT, "Adya Xerox 300 cash praptam.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.SANSKRIT, "Adya Xerox 300 cash cha 200 UPI praptam.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.KASHMIRI, "آج زیروکس 300 روپیہ کیش مِل۔",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.KASHMIRI, "Aaz Xerox 300 cash meel.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.KASHMIRI, "Aaz Xerox 300 cash teh 200 UPI meel.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.KONKANI, "आयज Xerox ३०० रुपये cash मेळ्ळे।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.KONKANI, "Aiz Xerox 300 cash mello.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.KONKANI, "Aiz Xerox 300 cash ani 200 UPI mello.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.NEPALI, "आज Xerox को ३०० रुपैयाँ cash मिल्यो।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.NEPALI, "Aaja Xerox ko 300 rupaiya cash milyo.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.NEPALI, "Aaja Xerox ko 300 cash ra 200 UPI milyo.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.SINDHI, "آج Xerox جا 300 روپيا cash مليا۔",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.SINDHI, "Aaj Xerox ja 300 rupia cash milyo.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.SINDHI, "Aaj Xerox ja 300 cash ain 200 UPI milyo.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.MANIPURI, "ꯍꯧꯖꯤꯛ Xerox ꯳꯰꯰ ꯔꯨꯄꯤ cash ꯐꯪꯕꯥ।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MANIPURI, "হৌজিক Xerox ৩০০ রুপি cash ফংবা।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MANIPURI, "Houjik Xerox 300 rupi cash phangba.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MANIPURI, "Houjik Xerox 300 cash amasung 200 UPI phangba.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.BODO, "दिनै Xerox ३०० cash मोन।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.BODO, "Dinai Xerox 300 cash mon.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.BODO, "Dinai Xerox 300 cash arw 200 UPI mon.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.DOGRI, "अज्ज Xerox ३०० cash मिलेआ।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.DOGRI, "Ajj Xerox 300 cash mileya.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.DOGRI, "Ajj Xerox 300 cash te 200 UPI mileya.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.MAITHILI, "आइ Xerox ३०० cash भेटल।",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MAITHILI, "Aai Xerox 300 cash bhetal.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.MAITHILI, "Aai Xerox 300 cash au 200 UPI bhetal.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI))),
        LangIncome(AiLanguage.SANTALI, "Tehen Xerox 300 taka cash namena.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH))),
        LangIncome(AiLanguage.SANTALI, "Tehen Xerox 300 cash ar 200 UPI namena.",
            listOf(Triple(ServiceType.XEROX, 30_000L, PaymentMode.CASH), Triple(ServiceType.XEROX, 20_000L, PaymentMode.UPI)))
    )

    // ------------------------------------------------------------------
    // 1. All 23 languages: native script + Romanized + mixed.
    // ------------------------------------------------------------------
    @Test
    fun allLanguagesIncome() {
        for (c in langIncomeCases()) checkIncome(c)
    }

    // ------------------------------------------------------------------
    // 2. Language detection (script + keywords, Romanized included).
    //    Roman Urdu is genuinely indistinguishable from Hinglish, so
    //    only its native script is asserted here.
    // ------------------------------------------------------------------
    @Test
    fun detectionPerLanguage() {
        val cases = listOf(
            "Today Xerox 300 rupees cash received." to AiLanguage.ENGLISH,
            "आज Xerox के ३०० रुपये कैश मिले।" to AiLanguage.HINDI,
            "આજે Xerox ના ૩૦૦ રૂપિયા cash મળ્યા।" to AiLanguage.GUJARATI,
            "Aaje Xerox na 300 cash ane 200 UPI thaya." to AiLanguage.GUJARATI,
            "आज Xerox चे ३०० रुपये cash मिळाले." to AiLanguage.MARATHI,
            "Aaj Xerox che 300 cash milale." to AiLanguage.MARATHI,
            "আজ Xerox এর ৩০০ টাকা cash হয়েছে।" to AiLanguage.BENGALI,
            "ਅੱਜ Xerox ਦੇ 300 ਰੁਪਏ cash ਮਿਲੇ।" to AiLanguage.PUNJABI,
            "Aaj Xerox de 300 cash te 200 UPI mile." to AiLanguage.PUNJABI,
            "இன்று Xerox 300 ரூபாய் cash வந்தது." to AiLanguage.TAMIL,
            "ఈరోజు Xerox 300 రూపాయలు cash వచ్చింది." to AiLanguage.TELUGU,
            "ಇಂದು Xerox 300 ರೂಪಾಯಿ cash ಬಂತು." to AiLanguage.KANNADA,
            "ഇന്ന് Xerox 300 രൂപ cash കിട്ടി." to AiLanguage.MALAYALAM,
            "ଆଜି Xerox 300 ଟଙ୍କା cash ମିଳିଲା।" to AiLanguage.ODIA,
            "আজি Xerox ৩০০ টকা cash পালোঁ।" to AiLanguage.ASSAMESE,
            "آج Xerox کے 300 روپے cash ملے۔" to AiLanguage.URDU,
            "अद्य Xerox ३०० रुपये cash प्राप्तम्।" to AiLanguage.SANSKRIT,
            "Adya Xerox 300 cash praptam." to AiLanguage.SANSKRIT,
            "آج زیروکس 300 روپیہ کیش مِل۔" to AiLanguage.KASHMIRI,
            "Aaz Xerox 300 cash meel." to AiLanguage.KASHMIRI,
            "आयज Xerox ३०० रुपये cash मेळ्ळे।" to AiLanguage.KONKANI,
            "आज Xerox को ३०० रुपैयाँ cash मिल्यो।" to AiLanguage.NEPALI,
            "آج Xerox جا 300 روپيا cash مليا۔" to AiLanguage.SINDHI,
            "Aaj Xerox ja 300 rupia cash milyo." to AiLanguage.SINDHI,
            "ꯍꯧꯖꯤꯛ Xerox ꯳꯰꯰ ꯔꯨꯄꯤ cash ꯐꯪꯕꯥ।" to AiLanguage.MANIPURI,
            "হৌজিক Xerox ৩০০ রুপি cash ফংবা।" to AiLanguage.MANIPURI,
            "दिनै Xerox ३०० cash मोन।" to AiLanguage.BODO,
            "अज्ज Xerox ३०० cash मिलेआ।" to AiLanguage.DOGRI,
            "आइ Xerox ३०० cash भेटल।" to AiLanguage.MAITHILI,
            "Tehen Xerox 300 taka cash namena." to AiLanguage.SANTALI
        )
        for ((text, want) in cases) {
            val got = Multilingual.detectLanguage(text)
            assertEquals("detection for: $text (scores ${got.scores})", want, got.language)
        }
    }

    @Test
    fun mixedMessageDetectedAsMixed() {
        val d = Multilingual.detectLanguage(
            "Aaje Xerox na 500 cash ane 200 UPI thaya, bhai total hisab batao."
        )
        assertEquals(AiLanguage.GUJARATI, d.language)
        assertTrue("expected mixed", d.mixed)
    }

    // ------------------------------------------------------------------
    // 3. The brief's 10 example sentences, verbatim.
    // ------------------------------------------------------------------
    @Test
    fun briefExampleGujaratiRomanMultiEntry() {
        val entries = parseEntries("Aaje Xerox na 500 cash ane 200 UPI thaya.")
        assertEquals(70_000L, entries.sumOf { it.amountPaise })
        assertEquals(PaymentMode.CASH, entries[0].mode)
        assertEquals(PaymentMode.UPI, entries[1].mode)
    }

    @Test
    fun briefExampleGujaratiNativeMultiEntry() {
        val entries = parseEntries("આજે Xerox ના 500 cash અને 200 UPI થયા.")
        assertEquals(70_000L, entries.sumOf { it.amountPaise })
    }

    @Test
    fun briefExampleCollectDue() {
        val result = AiAssistantParser.parse("Aaj Rahul ka baki 300 rupiya jama kar cash", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.CustomerPayment)
        val payment = action as AiAssistantParser.AiAction.CustomerPayment
        assertEquals("Rahul", payment.customerName)
        assertEquals(30_000L, payment.amountPaise)
        assertEquals(PaymentMode.CASH, payment.mode)
    }

    @Test
    fun briefExampleCollectDueUnknownCustomerAsksWho() {
        val result = AiAssistantParser.parse("Aaj customer ka baki 300 rupiya jama kar.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("customer"))
    }

    @Test
    fun briefExampleAgentPayableAsksAgent() {
        for (text in listOf("Agent ne 500 rupiya aapvana che.", "Agent ko 500 dena baki hai.")) {
            val result = AiAssistantParser.parse(text, ctx, agents, customers)
            assertTrue("expected Clarify for: $text", result is AiAssistantParser.AiParseResult.Clarify)
            assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("agent"))
        }
    }

    @Test
    fun briefExampleKalQuestionIsFactual() {
        val result = AiAssistantParser.parse("Kal na total income kitna hua?", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Factual)
    }

    @Test
    fun briefExamplePrintingNoAmountAsksAmount() {
        val result = AiAssistantParser.parse("Aaj printing ka paisa UPI ma malyo.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("amount"))
    }

    @Test
    fun briefExamplePendingDueAsksCustomer() {
        val result = AiAssistantParser.parse("આજે customer ના 200 રૂપિયા pending છે.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("customer"))
    }

    @Test
    fun briefExampleEntryPendingAsksServiceAndAmount() {
        val result = AiAssistantParser.parse("Cash ma paisa malya but entry baki che.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        val missing = (result as AiAssistantParser.AiParseResult.Clarify).missing
        assertTrue(missing.contains("service") && missing.contains("amount"))
    }

    @Test
    fun briefExampleGujaratiTotalQuestionIsFactual() {
        val result = AiAssistantParser.parse("Bhai aaj no total hisab batao.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Factual)
    }

    // ------------------------------------------------------------------
    // 4. Spelling variants, dialects, voice-to-text input.
    // ------------------------------------------------------------------
    @Test
    fun spellingVariantsToday() {
        for (w in listOf("Aaj", "Aaja", "Aje", "Aaje")) {
            val entries = parseEntries("$w Xerox ke 300 rupaye cash hue")
            assertEquals(30_000L, entries[0].amountPaise)
        }
    }

    @Test
    fun spellingVariantsDueAndExpense() {
        val expense = AiAssistantParser.parse(
            "Aaj 200 rupaye kharcho cash hue machine repair mein", ctx, agents, customers
        )
        val action = (expense as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.Expense)
        assertEquals(20_000L, (action as AiAssistantParser.AiAction.Expense).draft.amountPaise)
        val due = AiAssistantParser.parse("Rahul ka PAN ka 500 rupaye baaki hai", ctx, agents, customers)
        assertTrue((due as AiAssistantParser.AiParseResult.Action).action is AiAssistantParser.AiAction.RecordCustomerDue)
    }

    @Test
    fun voiceAsrMisheardNumberWord() {
        // "sau" misheard as "so" by speech-to-text.
        val entries = parseEntries("xerox ke teen so rupay cash hue")
        assertEquals(30_000L, entries[0].amountPaise)
    }

    @Test
    fun voiceAsrDroppedVerbStillParses() {
        val entries = parseEntries("Xerox 300 cash")
        assertEquals(ServiceType.XEROX, entries[0].service)
        assertEquals(30_000L, entries[0].amountPaise)
        assertEquals(PaymentMode.CASH, entries[0].mode)
        val tamil = parseEntries("Inniki Xerox 300 cash")
        assertEquals(30_000L, tamil[0].amountPaise)
    }

    @Test
    fun voiceAsrBareEntryWithCustomerNameIsNotGuessedAsIncome() {
        val result = AiAssistantParser.parse("Rahul ka PAN 500 cash", ctx, agents, customers)
        assertFalse(
            "a customer job must not become walk-in income",
            result is AiAssistantParser.AiParseResult.Action &&
                (result as AiAssistantParser.AiParseResult.Action).action is AiAssistantParser.AiAction.DailyEntries
        )
    }

    // ------------------------------------------------------------------
    // 5. Number words + all Indic digit blocks.
    // ------------------------------------------------------------------
    @Test
    fun numberWordsAcrossLanguages() {
        val cases = listOf(
            "Aaje Xerox na be so cash thaya." to 20_000L,
            "Aaj Xerox che don shambhar cash milale." to 20_000L,
            "Aaj Xerox er dui sho cash hoyeche." to 20_000L,
            "Inniki Xerox rendu nooru cash vandhadhu." to 20_000L,
            "Eeroju Xerox rendu vanda cash vachindi." to 20_000L,
            "Aaj Xerox ke do hazaar cash hue" to 200_000L,
            "Aaje Xerox na be hazaar cash thaya." to 200_000L
        )
        for ((text, want) in cases) {
            assertEquals("amount for: $text", want, parseEntries(text)[0].amountPaise)
        }
    }

    @Test
    fun allIndicDigitsCanonicalise() {
        for ((digits, want) in listOf(
            "३००" to "300", "૩૦૦" to "300", "৩০০" to "300",
            "੩੦੦" to "300", "௩௦௦" to "300", "౩౦౦" to "300",
            "೩೦೦" to "300", "൩൦൦" to "300", "୩୦୦" to "300",
            "۳۰۰" to "300", "꯳꯰꯰" to "300", "᱓᱐᱐" to "300"
        )) {
            assertEquals("digits $digits", want, Multilingual.canonicalise(digits))
        }
    }

    @Test
    fun panIsNotDestroyedByAlsoMapping() {
        // "pan" must stay PAN (the service), never become "bhi".
        assertEquals("pan", Multilingual.canonicalise("PAN"))
        val due = AiAssistantParser.parse("Rahul ka PAN ka 500 rupaye due hai", ctx, agents, customers)
        assertTrue((due as AiAssistantParser.AiParseResult.Action).action is AiAssistantParser.AiAction.RecordCustomerDue)
    }

    @Test
    fun rupiyaDoesNotFakeUpiMode() {
        // "rupiya" contains "upi" — it must NOT read as a UPI payment.
        assertEquals(null, AiAssistantParser.detectMode("200 rupiya"))
        val result = AiAssistantParser.parse("Aaje 200 rupiya kharcho thayo.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("payment mode"))
    }

    @Test
    fun standaloneSoDoesNotInventAnEntry() {
        // English "so" must not become a phantom ₹100.
        assertEquals("so rupaye", Multilingual.canonicalise("so rupiya"))
        assertEquals("200", Multilingual.canonicalise("be so"))
    }

    // ------------------------------------------------------------------
    // 6. Localised previews / clarifications.
    // ------------------------------------------------------------------
    @Test
    fun localisedPreview() {
        val entries = listOf(
            AiAssistantParser.AiDailyEntry(ServiceType.XEROX, "Xerox", 50_000L, PaymentMode.CASH, "x"),
            AiAssistantParser.AiDailyEntry(ServiceType.XEROX, "Xerox", 20_000L, PaymentMode.UPI, "x")
        )
        val gujarati = AiAssistantParser.previewDaily(entries, AiLanguage.GUJARATI)
        assertTrue(gujarati.contains("Mane aa samjayu chhe"))
        assertTrue(gujarati.contains("₹500") && gujarati.contains("₹200"))
        assertTrue(AiAssistantParser.previewDaily(entries, AiLanguage.TAMIL).contains("purinjikitten"))
        assertTrue(AiAssistantParser.previewDaily(entries, AiLanguage.HINDI).contains("मैंने यह समझा है"))
        assertTrue(AiAssistantParser.previewDaily(entries, AiLanguage.ENGLISH).contains("This is what I understood"))
        assertTrue(AiAssistantParser.previewDaily(entries, AiLanguage.NEPALI).contains("Maile yo bujhe"))
    }

    @Test
    fun gujaratiAskModeIsActuallyAsked() {
        val result = AiAssistantParser.parse("Aaje Xerox na 300 thaya.", ctx, agents, customers)
        assertTrue(result is AiAssistantParser.AiParseResult.Clarify)
        val clarify = result as AiAssistantParser.AiParseResult.Clarify
        assertTrue(clarify.question.contains("Cash ma malyu"))
        assertTrue(clarify.missing.contains("payment mode"))
    }

    @Test
    fun tamilRefundAndKalInTamil() {
        val refund = AiAssistantParser.parse("Xerox 100 refund pannanum.", ctx, agents, customers)
        assertTrue(refund is AiAssistantParser.AiParseResult.Clarify)
        val kal = AiAssistantParser.parse("Naalai Xerox 300 cash vandhadhu.", ctx, agents, customers)
        assertTrue(kal is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((kal as AiAssistantParser.AiParseResult.Clarify).missing.contains("date"))
    }

    // ------------------------------------------------------------------
    // 7. Follow-ups + yes/no across languages (no duplicates).
    // ------------------------------------------------------------------
    @Test
    fun gujaratiFollowUpAddsWithoutDuplicating() {
        val followCtx = ctx.copy(
            lastService = ServiceType.XEROX, lastServiceLabel = "Xerox", lastMode = PaymentMode.CASH
        )
        val action = AiAssistantParser.parseFollowUpAmount("Ane 200 UPI pan add karo.", followCtx)
        assertTrue(action != null)
        assertEquals(20_000L, action!!.entries[0].amountPaise)
        assertEquals(PaymentMode.UPI, action.entries[0].mode)
    }

    @Test
    fun yesNoAcrossLanguages() {
        assertTrue(AiAssistantParser.isAffirmative("Haan nakh de."))
        assertTrue(AiAssistantParser.isAffirmative("Ho, save kara."))
        assertTrue(AiAssistantParser.isAffirmative("Sari, save pannunga."))
        assertTrue(AiAssistantParser.isAffirmative("Haan, save kar do."))
        assertTrue(AiAssistantParser.isNegative("Nathi, reva do."))
        assertTrue(AiAssistantParser.isNegative("Na, reva do."))
        assertTrue(AiAssistantParser.isNegative("Illai, cancel pannunga."))
        assertTrue(AiAssistantParser.isNegative("Nai, rehnedo."))
    }

    // ------------------------------------------------------------------
    // 8. Multilingual periods, expense, agent, internal transfer.
    // ------------------------------------------------------------------
    @Test
    fun multilingualPeriods() {
        assertEquals(AiPeriod.LAST_7_DAYS, parsePeriod("Chhella 7 divas no hisab batao", today))
        assertEquals(AiPeriod.LAST_MONTH, parsePeriod("Gata mahina no total ketlo?", today))
        assertEquals(AiPeriod.TODAY, parsePeriod("Aaje no total hisab batao", today))
    }

    @Test
    fun punjabiAgentPayment() {
        val result = AiAssistantParser.parse("Agent Ramesh nu 500 rupaye cash ditte", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.AgentPayment)
        val payment = action as AiAssistantParser.AiAction.AgentPayment
        assertEquals("Ramesh", payment.agentName)
        assertEquals(50_000L, payment.amountPaise)
    }

    @Test
    fun totalWordNoLongerMisreadsAsInternalTransfer() {
        val result = AiAssistantParser.parse("Aaj Xerox 300 cash, 200 UPI total hua", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.DailyEntries)
        assertEquals(50_000L, (action as AiAssistantParser.AiAction.DailyEntries).entries.sumOf { it.amountPaise })
    }

    @Test
    fun gujaratiInternalTransferStillInternal() {
        val result = AiAssistantParser.parse("1000 rupiya cash thi UPI transfer karya.", ctx, agents, customers)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.InternalTransfer)
        assertEquals(PaymentMode.CASH, (action as AiAssistantParser.AiAction.InternalTransfer).from)
    }

    // ------------------------------------------------------------------
    // 9. MEASURED ACCURACY — per language + overall. The suite must
    //    stay above 95% overall; per-language results are printed so a
    //    weak language is visible, not hidden in the average.
    // ------------------------------------------------------------------
    @Test
    fun accuracySuite_reportsMeasuredAccuracyPerLanguage() {
        val scenarios: List<Triple<AiLanguage, String, () -> Unit>> = mutableListOf<Triple<AiLanguage, String, () -> Unit>>().apply {
            for (c in langIncomeCases()) add(Triple(c.lang, "income: ${c.text}", { checkIncome(c) }))
            add(Triple(AiLanguage.ENGLISH, "detection", { detectionPerLanguage() }))
            add(Triple(AiLanguage.GUJARATI, "mixed detection", { mixedMessageDetectedAsMixed() }))
            add(Triple(AiLanguage.GUJARATI, "brief gu multi", { briefExampleGujaratiRomanMultiEntry() }))
            add(Triple(AiLanguage.GUJARATI, "brief gu native multi", { briefExampleGujaratiNativeMultiEntry() }))
            add(Triple(AiLanguage.HINGLISH, "brief collect due", { briefExampleCollectDue() }))
            add(Triple(AiLanguage.HINGLISH, "brief collect unknown", { briefExampleCollectDueUnknownCustomerAsksWho() }))
            add(Triple(AiLanguage.GUJARATI, "brief agent payable", { briefExampleAgentPayableAsksAgent() }))
            add(Triple(AiLanguage.GUJARATI, "brief kal factual", { briefExampleKalQuestionIsFactual() }))
            add(Triple(AiLanguage.GUJARATI, "brief printing no amount", { briefExamplePrintingNoAmountAsksAmount() }))
            add(Triple(AiLanguage.GUJARATI, "brief pending due", { briefExamplePendingDueAsksCustomer() }))
            add(Triple(AiLanguage.GUJARATI, "brief entry pending", { briefExampleEntryPendingAsksServiceAndAmount() }))
            add(Triple(AiLanguage.GUJARATI, "brief total factual", { briefExampleGujaratiTotalQuestionIsFactual() }))
            add(Triple(AiLanguage.HINGLISH, "spelling today", { spellingVariantsToday() }))
            add(Triple(AiLanguage.HINGLISH, "spelling due/expense", { spellingVariantsDueAndExpense() }))
            add(Triple(AiLanguage.HINGLISH, "voice number word", { voiceAsrMisheardNumberWord() }))
            add(Triple(AiLanguage.HINGLISH, "voice dropped verb", { voiceAsrDroppedVerbStillParses() }))
            add(Triple(AiLanguage.HINGLISH, "voice customer not income", { voiceAsrBareEntryWithCustomerNameIsNotGuessedAsIncome() }))
            add(Triple(AiLanguage.GUJARATI, "number words", { numberWordsAcrossLanguages() }))
            add(Triple(AiLanguage.HINDI, "digits", { allIndicDigitsCanonicalise() }))
            add(Triple(AiLanguage.HINGLISH, "pan collision", { panIsNotDestroyedByAlsoMapping() }))
            add(Triple(AiLanguage.GUJARATI, "rupiya not upi", { rupiyaDoesNotFakeUpiMode() }))
            add(Triple(AiLanguage.ENGLISH, "so no phantom", { standaloneSoDoesNotInventAnEntry() }))
            add(Triple(AiLanguage.GUJARATI, "localised preview", { localisedPreview() }))
            add(Triple(AiLanguage.GUJARATI, "gujarati ask mode", { gujaratiAskModeIsActuallyAsked() }))
            add(Triple(AiLanguage.TAMIL, "tamil refund/kal", { tamilRefundAndKalInTamil() }))
            add(Triple(AiLanguage.GUJARATI, "gujarati follow-up", { gujaratiFollowUpAddsWithoutDuplicating() }))
            add(Triple(AiLanguage.TAMIL, "yes/no", { yesNoAcrossLanguages() }))
            add(Triple(AiLanguage.GUJARATI, "periods", { multilingualPeriods() }))
            add(Triple(AiLanguage.PUNJABI, "punjabi agent", { punjabiAgentPayment() }))
            add(Triple(AiLanguage.HINGLISH, "total not internal", { totalWordNoLongerMisreadsAsInternalTransfer() }))
            add(Triple(AiLanguage.GUJARATI, "gujarati internal", { gujaratiInternalTransferStillInternal() }))
        }
        var passed = 0
        val failed = mutableListOf<String>()
        val perLang = mutableMapOf<AiLanguage, Pair<Int, Int>>()
        for ((lang, name, check) in scenarios) {
            try {
                check()
                passed++
                val (p, t) = perLang[lang] ?: (0 to 0)
                perLang[lang] = (p + 1) to (t + 1)
            } catch (e: AssertionError) {
                failed.add("$name: ${e.message}")
                val (p, t) = perLang[lang] ?: (0 to 0)
                perLang[lang] = p to (t + 1)
            }
        }
        val rate = passed * 100 / scenarios.size
        println("MULTILINGUAL AI ACCURACY: $passed/${scenarios.size} passed ($rate%)")
        for ((lang, pair) in perLang.entries.sortedBy { it.key.name }) {
            println("  ${lang.code}: ${pair.first}/${pair.second} (${pair.first * 100 / pair.second}%)")
        }
        if (failed.isNotEmpty()) println("FAILED: " + failed.joinToString("; "))
        assertTrue("Multilingual accuracy $rate% is below 95% — failures: $failed", rate >= 95)
    }
}
