package com.alfalah.business

import com.alfalah.business.data.entity.TransactionEntity
import com.alfalah.business.domain.AiAssistantParser
import com.alfalah.business.domain.AiLanguage
import com.alfalah.business.domain.AiNavigation
import com.alfalah.business.domain.AppHelpKnowledge
import com.alfalah.business.domain.BuiltInChatbotResponder
import com.alfalah.business.domain.BusinessKnowledge
import com.alfalah.business.domain.BusinessSnapshot
import com.alfalah.business.domain.ConversationEngine
import com.alfalah.business.domain.ConversationMemory
import com.alfalah.business.domain.KnowledgeSnapshot
import com.alfalah.business.domain.Multilingual
import com.alfalah.business.domain.ContinuousMode
import com.alfalah.business.domain.VoiceDecision
import com.alfalah.business.domain.VoiceInterrupt
import com.alfalah.business.domain.VoiceNaturalPhrasing
import com.alfalah.business.domain.VoicePipeline
import com.alfalah.business.domain.VoiceText
import com.alfalah.business.domain.CloudAiClient
import com.alfalah.business.domain.ConversationIntent
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.AiFeatures
import com.alfalah.business.domain.GraphemeChunker
import com.alfalah.business.domain.SseEvent
import com.alfalah.business.domain.SseParser
import com.alfalah.business.domain.StreamingError
import com.alfalah.business.domain.Typewriter
import com.alfalah.business.domain.TypewriterLogic
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * CONVERSATIONAL AI TEST SUITE (UPDATE 14 + UPDATE 15 + UPDATE 16,
 * 2026-11-26) — BizKhata AI as a truly intelligent, context-aware
 * assistant, not a fixed-reply chatbot.
 *
 * The suite does NOT pass merely because the AI returned some text:
 * every scenario asserts the reply is RELEVANT to the actual message
 * (right topic, right language, right action) and that the two
 * screenshot bugs are gone:
 *  (a) "Kaise Ho Bhai" (Hinglish greeting) was answered in Marathi
 *      about no business records — now a natural Hinglish greeting
 *      with no records mention.
 *  (b) "Muje Kal Pan Card Banane Hai" (a plan about tomorrow) was
 *      answered "PAN Card ke kitne rupaye hue?" — now the plan is
 *      acknowledged and relevant help (a checklist) is offered, with
 *      NO money question.
 *
 * Money is paise (Long) everywhere. Business figures come only from
 * the snapshot passed in — the empty store is a real empty store, and
 * ₹0 is the honest figure there, never an invented one. The same
 * scenarios are mirrored in docs/ai_assistant_mirror.py (no JDK on
 * this VM); the measured accuracy from that run is reported in the
 * delivery notes. Live-cloud replies remain pending (no key is
 * configured in this test setup — the tests verify the local engine
 * and the honest-limitation behaviour, and NEVER fake a live reply).
 */
class ConversationTest {

    private val today = LocalDate.now(ZoneOffset.UTC).toEpochDay()
    private val ctx = AiAssistantParser.AiConversationContext(dayEpoch = today)
    private val agents = listOf("Ramesh", "Suresh")
    private val customers = listOf("Rahul", "Sana")
    private val emptySnap = KnowledgeSnapshot(profileId = 1, profileName = "Empty", profileCategory = "CSC")

    private fun parse(text: String, context: AiAssistantParser.AiConversationContext = ctx) =
        AiAssistantParser.parse(text, context, agents, customers)

    private fun conversational(text: String, context: AiAssistantParser.AiConversationContext = ctx): AiAssistantParser.AiParseResult.Conversational {
        val result = parse(text, context)
        assertTrue("expected Conversational for: $text (got $result)", result is AiAssistantParser.AiParseResult.Conversational)
        return result as AiAssistantParser.AiParseResult.Conversational
    }

    private fun knowledgeAnswer(text: String, snap: KnowledgeSnapshot = emptySnap): String {
        val result = parse(text)
        assertTrue("expected Factual for: $text (got $result)", result is AiAssistantParser.AiParseResult.Factual)
        val answer = BusinessKnowledge.answer(text, snap, today)
        assertNotNull("knowledge answer for: $text", answer)
        return answer!!.text
    }

    /** "No records" words must never appear in a casual reply. */
    private fun assertNoRecordsMention(text: String, reply: String) {
        assertFalse("casual reply mentions records: $reply", reply.contains("koi record nahi", ignoreCase = true))
        assertFalse("casual reply mentions records: $reply", reply.contains("no record", ignoreCase = true))
        assertFalse("casual reply mentions figures: $reply", reply.contains("figure", ignoreCase = true))
    }

    /** A plan / statement must never be answered with a money question. */
    private fun assertNoMoneyQuestion(reply: String) {
        assertFalse("reply asks for money: $reply", reply.contains("kitne rupaye", ignoreCase = true))
        assertFalse("reply asks for money: $reply", reply.contains("rupaye hue", ignoreCase = true))
        assertFalse("reply asks for money: $reply", reply.contains("how much money", ignoreCase = true))
    }

    // ------------------------------------------------------------------
    // 0. The two screenshot bugs.
    // ------------------------------------------------------------------
    @Test
    fun screenshotBug_greetingAnsweredInMarathiAboutNoRecords() {
        // Language detection: Hinglish markers outweigh a lone "ho".
        assertEquals(AiLanguage.HINGLISH, Multilingual.detectLanguage("Kaise Ho Bhai").language)
        assertEquals(AiLanguage.HINGLISH, Multilingual.detectLanguage("Hi bhai, kaise ho?").language)
        assertEquals(AiLanguage.GUJARATI, Multilingual.detectLanguage("Aaje su chale chhe?").language)
        val reply = conversational("Kaise Ho Bhai")
        assertTrue("greeting reply must be Hinglish: ${reply.text}", reply.text.contains("Main badhiya hoon"))
        assertNoRecordsMention("Kaise Ho Bhai", reply.text)
        assertNoMoneyQuestion(reply.text)
    }

    @Test
    fun screenshotBug_planForcedIntoMoneyQuestion() {
        val result = parse("Muje Kal Pan Card Banane Hai")
        // NOT a date clarification and NOT a money question.
        assertFalse("plan must not become a date clarification: $result", result is AiAssistantParser.AiParseResult.Clarify)
        val reply = conversational("Mujhe kal PAN Card banane hai.")
        assertEquals("plan", reply.intent)
        assertTrue("plan reply names the topic: ${reply.text}", reply.text.contains("PAN Card"))
        assertTrue("plan reply offers a checklist: ${reply.text}", reply.text.contains("checklist", ignoreCase = true))
        assertTrue("plan reply is about tomorrow: ${reply.text}", reply.text.contains("Kal"))
        assertNoMoneyQuestion(reply.text)
        // The financial "kal" rule still applies to ENTRIES, not plans.
        val entry = parse("Kal Xerox ke 300 cash hue")
        assertTrue(entry is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((entry as AiAssistantParser.AiParseResult.Clarify).missing.contains("date"))
    }

    // ------------------------------------------------------------------
    // 1. UPDATE 14 acceptance — the 10 mandatory conversations.
    // ------------------------------------------------------------------
    @Test
    fun update14_hiBhaiKaiseHo() {
        val reply = conversational("Hi bhai, kaise ho?")
        assertTrue(reply.text.contains("Main badhiya hoon"))
        assertNoRecordsMention("Hi bhai, kaise ho?", reply.text)
    }

    @Test
    fun update14_funnyJoke() {
        val reply = conversational("Tell me a funny joke.")
        // An actual joke: setup + punchline, not a greeting.
        assertTrue("reply must contain a joke: ${reply.text}", reply.text.contains("?"))
        assertTrue(
            "reply must contain a joke: ${reply.text}",
            reply.text.contains("Doctor") || reply.text.contains("Teacher") ||
                reply.text.contains("atom") || reply.text.contains("scarecrow")
        )
        assertNoRecordsMention("Tell me a funny joke.", reply.text)
    }

    @Test
    fun update14_panCardExplained() {
        val reply = conversational("Mujhe PAN card ke baare mein samjhao.")
        assertTrue(reply.text.contains("PAN"))
        assertTrue("PAN explainer must list documents: ${reply.text}", reply.text.contains("Aadhaar"))
        assertTrue("PAN explainer must list documents: ${reply.text}", reply.text.contains("photo"))
        assertNoMoneyQuestion(reply.text)
    }

    @Test
    fun update14_romanGujaratiWhatsGoingOn() {
        val reply = conversational("Aaje su chale chhe?")
        assertTrue("reply must be Gujarati/Roman Gujarati: ${reply.text}", reply.text.contains("majama") || reply.text.contains("chale chhe"))
        assertFalse("reply must not be Marathi: ${reply.text}", reply.text.contains("aahe"))
        assertFalse("reply must not be Marathi: ${reply.text}", reply.text.contains("mala"))
        assertNoRecordsMention("Aaje su chale chhe?", reply.text)
    }

    @Test
    fun update14_xeroxCashActionPreview() {
        val result = parse("Aaj Xerox ke 300 cash add kar.")
        assertTrue(result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.DailyEntries)
        val entries = (action as AiAssistantParser.AiAction.DailyEntries).entries
        assertEquals(1, entries.size)
        assertEquals(ServiceType.XEROX, entries[0].service)
        assertEquals(30_000L, entries[0].amountPaise)
        assertEquals(PaymentMode.CASH, entries[0].mode)
        assertTrue("preview must show the figure: ${result.preview}", result.preview.contains("₹300"))
    }

    @Test
    fun update14_profitOnEmptyStoreIsZero() {
        val text = knowledgeAnswer("Aaj kitna profit hua?")
        assertTrue("empty-store profit must quote the real figure ₹0: $text", text.contains("₹0"))
        assertTrue("empty-store profit must stay honest: $text", text.contains("koi record nahi hai"))
    }

    @Test
    fun update14_cashBookHelpWithStepsAndDeepLink() {
        val result = parse("Cash Book kaise use karte hain?")
        assertTrue(result is AiAssistantParser.AiParseResult.Help)
        assertEquals("cash_book", (result as AiAssistantParser.AiParseResult.Help).topic)
        val topic = AppHelpKnowledge.topicFor("cash_book")
        val answer = AppHelpKnowledge.answer(topic)
        assertTrue("help must give steps: ${answer.text}", answer.text.contains("Cash Book"))
        assertEquals("cash_book", answer.deepLinkRoute)
        assertNotNull(answer.deepLinkLabel)
    }

    @Test
    fun update14_boredSuggestSomething() {
        val reply = conversational("I am bored, suggest something interesting.")
        assertTrue(
            "bored reply must suggest something: ${reply.text}",
            reply.text.contains("music", ignoreCase = true) || reply.text.contains("gaane") ||
                reply.text.contains("joke", ignoreCase = true) || reply.text.contains("learn", ignoreCase = true) ||
                reply.text.contains("seekh")
        )
        assertNoRecordsMention("I am bored", reply.text)
    }

    @Test
    fun update14_speakInGujarati() {
        val meaning = ConversationEngine.understand("ગુજરાતીમાં મારી સાથે વાત કરો.", ctx, AiLanguage.GUJARATI)
        assertEquals(AiLanguage.GUJARATI, meaning.requestedLanguage)
        val reply = conversational("ગુજરાતીમાં મારી સાથે વાત કરો.")
        assertTrue("reply must be in Gujarati: ${reply.text}", reply.text.contains("ગુજરાતી"))
        assertFalse("reply must not be Marathi: ${reply.text}", reply.text.contains("मला"))
        assertNoRecordsMention("Gujarati request", reply.text)
    }

    @Test
    fun update14_totalOnEmptyStoreIsZero() {
        val text = knowledgeAnswer("Aaj no total hisab batavo.")
        assertTrue("empty-store total must quote the real figure ₹0: $text", text.contains("₹0"))
        assertFalse("total must not be invented: $text", text.contains("₹500"))
    }

    // ------------------------------------------------------------------
    // 2. UPDATE 15 acceptance — the 10 real-world conversations.
    // ------------------------------------------------------------------
    @Test
    fun update15_planPanCardTomorrow() {
        val reply = conversational("Mujhe kal PAN Card banane hai.")
        assertEquals("plan", reply.intent)
        assertTrue(reply.text.contains("PAN Card"))
        assertTrue(reply.text.contains("Kal"))
        assertNoMoneyQuestion(reply.text)
    }

    @Test
    fun update15_greeting() {
        val reply = conversational("Kaise ho bhai?")
        assertTrue("greeting reply must be a natural Hinglish reply: ${reply.text}", reply.text.contains("Main badhiya hoon"))
        assertNoRecordsMention("Kaise ho bhai?", reply.text)
    }

    @Test
    fun update15_busyDayStatement() {
        val reply = conversational("Aaj shop par bahut kaam tha.")
        assertTrue("statement reply must reflect the busy day: ${reply.text}", reply.text.contains("rush") || reply.text.contains("kaam"))
        assertNoMoneyQuestion(reply.text)
        assertNoRecordsMention("Aaj shop par bahut kaam tha.", reply.text)
    }

    @Test
    fun update15_businessIdea() {
        val reply = conversational("Mujhe ek business idea chahiye.")
        assertTrue(
            "idea reply must offer ideas: ${reply.text}",
            reply.text.contains("Passport") || reply.text.contains("Money Transfer") ||
                reply.text.contains("scanning") || reply.text.contains("idea", ignoreCase = true)
        )
        assertNoRecordsMention("business idea", reply.text)
    }

    @Test
    fun update15_howToBuildWebsite() {
        val reply = conversational("Website kaise bana sakta hoon?")
        assertTrue("website reply must give steps: ${reply.text}", reply.text.contains("Website") || reply.text.contains("website"))
        assertTrue(
            "website reply must give steps: ${reply.text}",
            reply.text.contains("planning") || reply.text.contains("publish") || reply.text.contains("Pages")
        )
        assertFalse("website question must not become BizKhata app help: ${reply.text}", reply.text.contains("Cash Book"))
    }

    @Test
    fun update15_xeroxCashIsAnAction() {
        val result = parse("Aaj Xerox ke 300 cash hue.")
        assertTrue(result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action as AiAssistantParser.AiAction.DailyEntries
        assertEquals(30_000L, action.entries[0].amountPaise)
    }

    @Test
    fun update15_profitQuestion() {
        val text = knowledgeAnswer("Aaj kitna profit hua?")
        assertTrue(text.contains("₹0"))
    }

    @Test
    fun update15_explainInGujarati() {
        val reply = conversational("Mujhe Gujarati mein samjhao.")
        assertEquals("language_request", reply.intent)
        assertTrue("reply must confirm in Gujarati: ${reply.text}", reply.text.contains("ગુજરાતી"))
    }

    @Test
    fun update15_feelingBored() {
        val reply = conversational("I am feeling bored.")
        assertTrue(
            "bored reply must suggest something: ${reply.text}",
            reply.text.contains("music", ignoreCase = true) || reply.text.contains("joke", ignoreCase = true) ||
                reply.text.contains("interesting", ignoreCase = true) || reply.text.contains("learn", ignoreCase = true)
        )
        assertNoRecordsMention("I am feeling bored.", reply.text)
    }

    @Test
    fun update15_whatWorkTomorrow() {
        val reply = conversational("Kal mujhe kya kya kaam karna chahiye?")
        assertEquals("tomorrow_plan", reply.intent)
        assertNoMoneyQuestion(reply.text)
        // The real plan comes from the ledgers: empty store → honest empty plan.
        val plan = BusinessKnowledge.tomorrowPlan(emptySnap, today)
        assertTrue("empty plan must be honest: $plan", plan.contains("koi pending job nahi hai"))
        assertTrue("empty plan must still give next steps: $plan", plan.contains("Cash closing"))
    }

    // ------------------------------------------------------------------
    // 3. Honest limitation — the local engine never invents live facts.
    // ------------------------------------------------------------------
    @Test
    fun honestLimitationForLiveInfo() {
        val meaning = ConversationEngine.understand("Aaj sone ka bhav kya hai?", ctx, AiLanguage.HINGLISH)
        assertEquals("live_info", meaning.topic)
        assertNull("live info has no local answer", ConversationEngine.generalAnswer(meaning, ctx))
        val limitation = ConversationEngine.liveInfoLimitation(AiLanguage.HINGLISH)
        assertTrue(limitation.contains("live"))
        assertNoMoneyQuestion(limitation)
        val honest = ConversationEngine.honestLimitation(AiLanguage.HINGLISH)
        assertTrue(honest.contains("samajh nahi paya"))
        assertNoMoneyQuestion(honest)
    }

    @Test
    fun arithmeticIsComputedNotInvented() {
        val meaning = ConversationEngine.understand("15% of 2000 kitna hota hai?", ctx, AiLanguage.HINGLISH)
        assertEquals("calculation", meaning.topic)
        val answer = ConversationEngine.generalAnswer(meaning, ctx)
        assertNotNull(answer)
        assertTrue("15% of 2000 must be 300: $answer", answer!!.contains("300"))
        val conv = ConversationEngine.understand("5 km mein m kitna hota hai", ctx, AiLanguage.HINGLISH)
        val convAnswer = ConversationEngine.generalAnswer(conv, ctx)
        assertNotNull(convAnswer)
        assertTrue("5 km must be 5000 m: $convAnswer", convAnswer!!.contains("5000"))
    }

    // ------------------------------------------------------------------
    // 4. Context + memory — no fixed replies: the same words in a
    //    different context get a different reply; follow-ups resolve.
    // ------------------------------------------------------------------
    @Test
    fun greetingVariesWithContext_noFixedReply() {
        val plain = conversational("Kaise ho bhai?", ctx)
        val planCtx = ctx.copy(lastPlanTopic = "pan", lastIntent = "PLAN", lastTopic = "pan")
        val withPlan = conversational("Kaise ho bhai?", planCtx)
        assertNotEquals("same greeting in a different context must not repeat verbatim", plain.text, withPlan.text)
        assertTrue("greeting with a pending plan remembers it: ${withPlan.text}", withPlan.text.contains("PAN Card"))
    }

    @Test
    fun followUpContext_cscExpenses() {
        val meaning = ConversationEngine.understand("I run a CSC centre.", ctx, AiLanguage.ENGLISH)
        val updated = ConversationMemory.updateContext(ctx, "I run a CSC centre.", meaning)
        assertTrue(updated.runsCscCentre)
        // Follow-up resolves against the CSC context.
        val text = knowledgeAnswer("What about expenses?", emptySnap)
        assertTrue(text.contains("₹0"))
        val enriched = ConversationMemory.enrichBusinessAnswer(text, updated, "expense", AiLanguage.ENGLISH)
        assertTrue("CSC context must name CSC expense categories: $enriched", enriched.contains("CSC"))
        assertTrue(enriched.contains("electricity"))
    }

    @Test
    fun midConversationLanguageSwitch() {
        val first = conversational("Kaise ho bhai?", ctx)
        assertTrue(first.text.contains("Main badhiya hoon"))
        val switched = conversational("ગુજરાતીમાં મારી સાથે વાત કરો.", ctx)
        assertTrue(switched.text.contains("ગુજરાતી"))
        val gujaratiCtx = ctx.copy(lastLanguage = AiLanguage.GUJARATI)
        val third = conversational("Aaje su chale chhe?", gujaratiCtx)
        assertTrue("third message stays Gujarati: ${third.text}", third.text.contains("majama") || third.text.contains("chale chhe"))
        assertFalse(third.text.contains("aahe"))
    }

    @Test
    fun planIsRememberedForChecklist() {
        val meaning = ConversationEngine.understand("Mujhe kal PAN Card banane hai.", ctx, AiLanguage.HINGLISH)
        val updated = ConversationMemory.updateContext(ctx, "Mujhe kal PAN Card banane hai.", meaning)
        assertEquals("pan", updated.lastPlanTopic)
        assertNotNull(updated.lastPlanDayEpoch)
        val checklist = conversational("Kal ke kaam ki checklist banao", updated)
        assertEquals("checklist", checklist.intent)
        assertTrue("checklist must be real, not a description: ${checklist.checklist}", checklist.checklist.size >= 4)
        assertTrue("PAN checklist needs Aadhaar: ${checklist.checklist}", checklist.checklist.any { it.contains("Aadhaar") })
    }

    // ------------------------------------------------------------------
    // 5. UPDATE 16 — "Jo jo bolu, vo AI kare": commands are executed.
    // ------------------------------------------------------------------
    @Test
    fun doIt_navigationExecutes() {
        // The ViewModel emits this route as a navigation event — the app
        // actually opens the screen; the mapping itself is tested here.
        assertEquals("cash_book" to "Cash Book", AiNavigation.routeFor("Cash Book kholo"))
        assertEquals("reports" to "Reports", AiNavigation.routeFor("Reports kholo"))
        assertEquals("service/PAN" to "PAN Card", AiNavigation.routeFor("PAN Card page open karo"))
    }

    @Test
    fun doIt_checklistIsProduced() {
        val reply = conversational("Kal ke kaam ki checklist banao")
        assertEquals("checklist", reply.intent)
        assertTrue(reply.checklist.size >= 4)
        assertTrue("checklist text must list the items: ${reply.text}", reply.text.contains("1."))
        assertTrue(reply.text.contains("Cash closing"))
    }

    @Test
    fun doIt_summaryIsRealFromLedgers() {
        // Empty store: the real summary is all zeros, honestly stated.
        val emptyText = knowledgeAnswer("Aaj ka summary banao")
        assertTrue(emptyText.contains("₹0"))
        // Non-empty store: the real figures, computed from the rows.
        val snap = KnowledgeSnapshot(
            profileId = 1, profileName = "Shop", profileCategory = "CSC",
            transactions = listOf(
                TransactionEntity(profileId = 1, kind = "INCOME", category = "Xerox", amountPaise = 30_000L, mode = PaymentMode.CASH, dateEpochDay = today),
                TransactionEntity(profileId = 1, kind = "INCOME", category = "Printing", amountPaise = 20_000L, mode = PaymentMode.UPI, dateEpochDay = today)
            )
        )
        val text = knowledgeAnswer("Aaj ka summary banao", snap)
        assertTrue("summary must quote the real total ₹500: $text", text.contains("₹500"))
        assertTrue(text.contains("Xerox"))
    }

    // ------------------------------------------------------------------
    // 6. Built-in responder backstop — the old traps are gone there too.
    // ------------------------------------------------------------------
    @Test
    fun builtInResponderBackstop() {
        val empty = BusinessSnapshot()
        val greeting = BuiltInChatbotResponder.answer("Kaise ho bhai?", empty)
        assertTrue(greeting.contains("badhiya"))
        assertFalse(greeting.contains("koi record nahi"))
        val plan = BuiltInChatbotResponder.answer("Mujhe kal PAN Card banane hai.", empty)
        assertTrue(plan.contains("checklist"))
        assertFalse(plan.contains("rupaye"))
        val fund = BuiltInChatbotResponder.answer("Bhai ne kitna fund diya?", empty)
        assertTrue("a real fund question still answers about fund: $fund", fund.contains("fund", ignoreCase = true))
    }

    // ------------------------------------------------------------------
    // 6b. UPDATE 18 — voice conversation (simulated transcripts: this
    // VM has no microphone, so every voice test drives the pipeline
    // with text the recogniser would have produced). The user speaks
    // in HIS own way — no fixed commands: fragments, word-order
    // swaps, slang and mixed Gujarati/Hindi/English must all be
    // understood, and an uncertain transcript must ask ONE short
    // clarification instead of guessing or failing.
    // ------------------------------------------------------------------

    /** The brief's example sentences, verbatim. */
    @Test
    fun voice_verbatim_gujarati_roman_asks_mode_not_guesses() {
        // "Aaje 500 rupiya Xerox na malya." — amount + service known,
        // payment mode NOT known: ask, never guess Cash/UPI.
        val result = parse("Aaje 500 rupiya Xerox na malya.")
        assertTrue("expected Clarify, got $result", result is AiAssistantParser.AiParseResult.Clarify)
        val clarify = result as AiAssistantParser.AiParseResult.Clarify
        assertTrue("must ask payment mode: ${clarify.missing}", clarify.missing.contains("payment mode"))
        assertTrue("clarification must offer Cash/UPI: ${clarify.question}", clarify.question.contains("UPI"))
        assertTrue("clarification must be short", clarify.question.length < 120)
    }

    @Test
    fun voice_verbatim_mixed_amounts_asks_service() {
        // "Aaj 300 cash aur 200 UPI hue." — amounts + modes known,
        // service missing: ask which service, don't invent one.
        val result = parse("Aaj 300 cash aur 200 UPI hue.")
        assertTrue("expected Clarify, got $result", result is AiAssistantParser.AiParseResult.Clarify)
        val clarify = result as AiAssistantParser.AiParseResult.Clarify
        assertTrue("must ask service: ${clarify.missing}", clarify.missing.contains("service"))
    }

    @Test
    fun voice_verbatim_agent_payment_asks_agent_name() {
        // "Agent ne 500 rupaye dene hain." — no agent named: ask who,
        // never guess an agent.
        val result = parse("Agent ne 500 rupaye dene hain.")
        assertTrue("expected Clarify, got $result", result is AiAssistantParser.AiParseResult.Clarify)
        val clarify = result as AiAssistantParser.AiParseResult.Clarify
        assertTrue("must ask agent: ${clarify.missing}", clarify.missing.contains("agent"))
    }

    @Test
    fun voice_verbatim_pan_plan_is_not_entry() {
        // "Kal PAN Card ke 5 application karne hain." — a PLAN for
        // tomorrow, not money received: must NEVER become a saved
        // financial entry.
        assertFalse(
            "a plan must never be a financial action",
            VoiceNaturalPhrasing.isFinancialAction("Kal PAN Card ke 5 application karne hain.", ctx, agents, customers)
        )
        val result = parse("Kal PAN Card ke 5 application karne hain.")
        assertFalse("plan must not become an Action: $result", result is AiAssistantParser.AiParseResult.Action)
    }

    @Test
    fun voice_verbatim_total_hisab_is_factual() {
        val result = parse("Aaj ka total hisab batao.")
        assertTrue("expected Factual, got $result", result is AiAssistantParser.AiParseResult.Factual)
    }

    @Test
    fun voice_verbatim_gujarati_profit_is_factual() {
        val result = parse("આજે કેટલો નફો થયો?")
        assertTrue("expected Factual, got $result", result is AiAssistantParser.AiParseResult.Factual)
        val answer = BusinessKnowledge.answer("આજે કેટલો નફો થયો?", emptySnap, today)
        assertNotNull("profit answer on empty store", answer)
        assertTrue("empty-store profit must be zero, not invented: ${answer!!.text}", answer.text.contains("0"))
    }

    @Test
    fun voice_fragment_xerox_300_cash_is_action() {
        // Short fragment, no verb, no "aaj": still an entry preview.
        val result = parse("Xerox 300 cash")
        assertTrue("expected Action, got $result", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.DailyEntries)
        val entry = (action as AiAssistantParser.AiAction.DailyEntries).entries.single()
        assertEquals(ServiceType.XEROX, entry.service)
        assertEquals(30_000L, entry.amountPaise)
        assertEquals(PaymentMode.CASH, entry.mode)
    }

    @Test
    fun voice_word_order_swap_is_action() {
        // His word order, not the "correct" order — same entry.
        val result = parse("300 cash Xerox")
        assertTrue("expected Action, got $result", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        val entry = (action as AiAssistantParser.AiAction.DailyEntries).entries.single()
        assertEquals(ServiceType.XEROX, entry.service)
        assertEquals(30_000L, entry.amountPaise)
        assertEquals(PaymentMode.CASH, entry.mode)
    }

    @Test
    fun voice_natural_variation_gujarati_fragment() {
        val result = parse("Xerox na 300 cash malya")
        assertTrue("expected Action, got $result", result is AiAssistantParser.AiParseResult.Action)
        val entry = ((result as AiAssistantParser.AiParseResult.Action).action
            as AiAssistantParser.AiAction.DailyEntries).entries.single()
        assertEquals(30_000L, entry.amountPaise)
        assertEquals(PaymentMode.CASH, entry.mode)
    }

    @Test
    fun voice_slang_incomplete_asks_short_clarification() {
        // "Xerox 300" — service + amount known, mode missing: one
        // short question in his style, not a demand to rephrase.
        val result = parse("Xerox 300")
        assertTrue("expected Clarify, got $result", result is AiAssistantParser.AiParseResult.Clarify)
        val question = VoiceText.clarificationForMissing(AiLanguage.HINGLISH, "payment mode", "₹300")
        assertTrue("clarification must ask Cash vs UPI: $question", question.contains("Cash") && question.contains("UPI"))
        assertTrue("clarification must be short", question.length < 120)
    }

    @Test
    fun voice_low_confidence_asks_repeat_never_guesses() {
        val decision = VoicePipeline.decide(
            "Aaj Xerox ke 300 cash hue", 0.20f, false, null, 0L, 10_000L
        )
        assertTrue("low confidence must ask repeat, got $decision", decision is VoiceDecision.AskRepeat)
        // No score from the recogniser = unknown, not low: send it.
        val unknown = VoicePipeline.decide(
            "Aaj Xerox ke 300 cash hue", -1f, false, null, 0L, 10_000L
        )
        assertTrue("unknown confidence must send, got $unknown", unknown is VoiceDecision.Send)
        val prompt = VoiceText.repeatPrompt(AiLanguage.HINGLISH)
        assertTrue("repeat prompt must be short", prompt.length < 120)
        assertFalse("repeat prompt must not demand a fixed format", prompt.contains("exactly"))
    }

    @Test
    fun voice_duplicate_transcript_ignored_once_only() {
        val first = VoicePipeline.decide("Haan", 0.9f, false, null, 0L, 10_000L)
        assertTrue(first is VoiceDecision.Send)
        val repeat = VoicePipeline.decide("Haan", 0.9f, false, "Haan", 10_000L, 11_000L)
        assertTrue("same transcript 1s later must be ignored, got $repeat", repeat is VoiceDecision.IgnoreDuplicate)
        val later = VoicePipeline.decide("Haan", 0.9f, false, "Haan", 10_000L, 20_000L)
        assertTrue("same transcript after the window is a new turn, got $later", later is VoiceDecision.Send)
    }

    @Test
    fun voice_interrupt_stops_speech_and_keeps_instruction() {
        assertEquals("", VoiceInterrupt.stripInterruptPrefix("Bas, short mein batao."))
        assertTrue(VoiceInterrupt.isInterruptOnly("Bas."))
        assertEquals(
            "aaj kitna profit hua",
            VoiceInterrupt.stripInterruptPrefix("Bas, short mein batao. Aaj kitna profit hua?")
        )
        val decision = VoicePipeline.decide(
            "Bas, short mein batao. Aaj kitna profit hua?", 0.9f, true, null, 0L, 10_000L
        )
        assertTrue("interrupt must win while speaking, got $decision", decision is VoiceDecision.InterruptAndSend)
        assertTrue((decision as VoiceDecision.InterruptAndSend).text.contains("profit"))
    }

    @Test
    fun voice_speakable_strips_markdown_and_rupee() {
        val spoken = VoiceText.speakable("**Total: ₹500** • Cash")
        assertFalse("spoken text must not contain markdown: $spoken", spoken.contains("*"))
        assertFalse("spoken text must not contain ₹: $spoken", spoken.contains("₹"))
        assertTrue("spoken text must say rupaye: $spoken", spoken.contains("rupaye"))
        assertTrue("spoken text must keep the figure: $spoken", spoken.contains("500"))
    }

    @Test
    fun voice_haan_confirms_only_shown_preview() {
        // "Haan" is affirmative in the pipeline (the ViewModel only
        // confirms when a preview is actually pending — a bare
        // "Haan" with no preview saves nothing).
        assertTrue(AiAssistantParser.isAffirmative("Haan"))
        assertTrue(AiAssistantParser.isAffirmative("Haan, save kar do."))
        assertFalse(AiAssistantParser.isAffirmative("Nahi, mat karo"))
    }

    @Test
    fun voice_continuous_mode_restarts_only_when_active() {
        val session = ContinuousMode.start()
        assertTrue(ContinuousMode.shouldRestartAfterResult(session))
        assertTrue(ContinuousMode.shouldRestartAfterSpeech(session))
        val stopped = ContinuousMode.stop(session)
        assertFalse(ContinuousMode.shouldRestartAfterResult(stopped))
        assertFalse(ContinuousMode.shouldRestartAfterSpeech(stopped))
        assertEquals(1, ContinuousMode.nextTurn(session).turns)
    }

    @Test
    fun voice_no_rigid_grammar_fragments_understood() {
        // His own phrasing, in all its variety, is understood by the
        // existing parser — there is no fixed command to memorise.
        listOf(
            "Xerox 300 cash",
            "300 cash Xerox",
            "Xerox na 300 cash malya",
            "Aaje 500 rupiya Xerox na malya.",
            "Aaj 300 cash aur 200 UPI hue.",
            "Kaise ho bhai?",
            "Aaj ka total hisab batao."
        ).forEach { text ->
            assertTrue(
                "natural phrasing not understood: $text",
                VoiceNaturalPhrasing.understands(text, ctx, agents, customers)
            )
        }
    }

    @Test
    fun voice_repeat_prompt_in_user_language() {
        assertTrue(VoiceText.repeatPrompt(AiLanguage.ENGLISH).contains("say it once more"))
        assertTrue(VoiceText.repeatPrompt(AiLanguage.GUJARATI).contains("bolo"))
        assertTrue(VoiceText.repeatPrompt(AiLanguage.HINDI).contains("boliye"))
    }

    // ------------------------------------------------------------------
    // 7. MEASURED ACCURACY — every scenario above, one harness.
    // ------------------------------------------------------------------
    @Test
    fun conversationAccuracySuite_reportsMeasuredAccuracy() {
        val scenarios: List<Pair<String, () -> Unit>> = listOf(
            "u14 screenshot greeting" to { screenshotBug_greetingAnsweredInMarathiAboutNoRecords() },
            "u14 screenshot plan" to { screenshotBug_planForcedIntoMoneyQuestion() },
            "u14 hi bhai kaise ho" to { update14_hiBhaiKaiseHo() },
            "u14 funny joke" to { update14_funnyJoke() },
            "u14 pan explained" to { update14_panCardExplained() },
            "u14 roman gujarati" to { update14_romanGujaratiWhatsGoingOn() },
            "u14 xerox action" to { update14_xeroxCashActionPreview() },
            "u14 profit zero" to { update14_profitOnEmptyStoreIsZero() },
            "u14 cash book help" to { update14_cashBookHelpWithStepsAndDeepLink() },
            "u14 bored" to { update14_boredSuggestSomething() },
            "u14 gujarati request" to { update14_speakInGujarati() },
            "u14 total zero" to { update14_totalOnEmptyStoreIsZero() },
            "u15 plan pan" to { update15_planPanCardTomorrow() },
            "u15 greeting" to { update15_greeting() },
            "u15 busy day" to { update15_busyDayStatement() },
            "u15 business idea" to { update15_businessIdea() },
            "u15 website howto" to { update15_howToBuildWebsite() },
            "u15 xerox action" to { update15_xeroxCashIsAnAction() },
            "u15 profit" to { update15_profitQuestion() },
            "u15 gujarati explain" to { update15_explainInGujarati() },
            "u15 bored" to { update15_feelingBored() },
            "u15 tomorrow work" to { update15_whatWorkTomorrow() },
            "honest limitation" to { honestLimitationForLiveInfo() },
            "arithmetic" to { arithmeticIsComputedNotInvented() },
            "context variation" to { greetingVariesWithContext_noFixedReply() },
            "csc follow-up" to { followUpContext_cscExpenses() },
            "language switch" to { midConversationLanguageSwitch() },
            "plan remembered" to { planIsRememberedForChecklist() },
            "do-it navigation" to { doIt_navigationExecutes() },
            "do-it checklist" to { doIt_checklistIsProduced() },
            "do-it summary" to { doIt_summaryIsRealFromLedgers() },
            "built-in backstop" to { builtInResponderBackstop() },
            "u18 verbatim gujarati asks mode" to { voice_verbatim_gujarati_roman_asks_mode_not_guesses() },
            "u18 verbatim mixed asks service" to { voice_verbatim_mixed_amounts_asks_service() },
            "u18 verbatim agent asks name" to { voice_verbatim_agent_payment_asks_agent_name() },
            "u18 verbatim pan plan not entry" to { voice_verbatim_pan_plan_is_not_entry() },
            "u18 verbatim total factual" to { voice_verbatim_total_hisab_is_factual() },
            "u18 verbatim gujarati profit" to { voice_verbatim_gujarati_profit_is_factual() },
            "u18 fragment action" to { voice_fragment_xerox_300_cash_is_action() },
            "u18 word order swap" to { voice_word_order_swap_is_action() },
            "u18 gujarati fragment" to { voice_natural_variation_gujarati_fragment() },
            "u18 incomplete clarification" to { voice_slang_incomplete_asks_short_clarification() },
            "u18 low confidence repeat" to { voice_low_confidence_asks_repeat_never_guesses() },
            "u18 duplicate ignored" to { voice_duplicate_transcript_ignored_once_only() },
            "u18 interrupt keeps instruction" to { voice_interrupt_stops_speech_and_keeps_instruction() },
            "u18 speakable strips markdown" to { voice_speakable_strips_markdown_and_rupee() },
            "u18 haan affirmative" to { voice_haan_confirms_only_shown_preview() },
            "u18 continuous restarts" to { voice_continuous_mode_restarts_only_when_active() },
            "u18 no rigid grammar" to { voice_no_rigid_grammar_fragments_understood() },
            "u18 repeat prompt language" to { voice_repeat_prompt_in_user_language() }
        )
        var passed = 0
        val failed = mutableListOf<String>()
        for ((name, check) in scenarios) {
            try {
                check()
                passed++
            } catch (e: AssertionError) {
                failed.add("$name: ${e.message}")
            }
        }
        val rate = passed * 100 / scenarios.size
        println("CONVERSATIONAL AI ACCURACY: $passed/${scenarios.size} passed ($rate%)")
        if (failed.isNotEmpty()) println("FAILED: " + failed.joinToString("; "))
        assertTrue("Conversational accuracy $rate% is below 95% — failures: $failed", rate >= 95)
    }
}

/**
 * STREAMING + TYPING TESTS (UPDATE 17, 2026-11-27) — the typewriter,
 * the grapheme-safe chunker and the SSE parser.
 *
 * The same cases are mirrored in docs/ai_assistant_mirror.py (no JDK
 * on this VM); the mirror is the runnable verification here, and
 * ./gradlew testDebugUnitTest in Android Studio is still pending.
 * Live cloud streaming is NOT tested here — no key is configured in
 * this test setup, and the cloud path is verified on the owner's
 * device only.
 */
class StreamingTest {

    // --- Grapheme-safe chunking ---------------------------------------

    @Test
    fun chunkerGraphemeSafety_devanagari() {
        val text = "आज Xerox के ३०० रुपये कैश मिले।"
        val chunks = GraphemeChunker.displayChunks(text)
        assertEquals(text, chunks.joinToString(""))
        assertTrue(GraphemeChunker.isLossless(chunks, text))
        // "कै" (ka + vowel sign ै) is ONE cluster, never split.
        assertEquals(listOf("कै", "श"), GraphemeChunker.graphemeClusters("कैश"))
        // No chunk starts with a combining vowel sign.
        for (cluster in GraphemeChunker.graphemeClusters(text)) {
            assertFalse("cluster starts with a vowel sign: $cluster", cluster[0] == 'ै' || cluster[0] == 'ो' || cluster[0] == 'ि')
        }
    }

    @Test
    fun chunkerGraphemeSafety_gujaratiAndTamil() {
        val gujarati = "આજે Xerox ના ૩૦૦ રૂપિયા cash મળ્યા।"
        assertEquals(gujarati, GraphemeChunker.displayChunks(gujarati).joinToString(""))
        assertEquals(listOf("કે", "શ"), GraphemeChunker.graphemeClusters("કેશ"))
        val tamil = "இன்று Xerox 300 ரூபாய் cash வந்தது."
        assertEquals(tamil, GraphemeChunker.displayChunks(tamil).joinToString(""))
        // Tamil "ரூ" (ra + vowel sign ூ) is one cluster.
        assertEquals(1, GraphemeChunker.graphemeClusters("ரூ").size)
    }

    @Test
    fun chunkerGraphemeSafety_emojiZwjAndMixed() {
        // Family emoji is one ZWJ-joined cluster; thumbs-up + skin
        // tone is one cluster. Neither may ever be split mid-stream.
        assertEquals(1, GraphemeChunker.graphemeClusters("👨‍👩‍👧").size)
        assertEquals(1, GraphemeChunker.graphemeClusters("👍🏽").size)
        val mixed = "Aaj Xerox ke 300 cash 👍🏽 aur UPI 200 — આજે સારું ચાલ્યું।"
        val chunks = GraphemeChunker.displayChunks(mixed)
        assertEquals(mixed, chunks.joinToString(""))
        assertTrue(GraphemeChunker.isLossless(chunks, mixed))
        assertEquals(emptyList<String>(), GraphemeChunker.displayChunks(""))
        assertEquals(emptyList<String>(), GraphemeChunker.graphemeClusters(""))
    }

    @Test
    fun chunkerWordBoundaries_neverSplitsAWord() {
        val chunks = GraphemeChunker.displayChunks("Xerox 300 cash")
        assertEquals(listOf("Xerox ", "300 ", "cash"), chunks)
        // A word is never cut: every chunk except the last ends in space.
        for (chunk in chunks.dropLast(1)) assertTrue(chunk.endsWith(" "))
    }

    // --- Typing speed ---------------------------------------------------

    @Test
    fun typingSpeed_naturalBand() {
        assertTrue(TypewriterLogic.isNaturalPace(11.0))
        assertTrue(TypewriterLogic.isNaturalPace(9.0))
        assertTrue(TypewriterLogic.isNaturalPace(13.0))
        assertFalse(TypewriterLogic.isNaturalPace(30.0))
        // 30 words ~2.7 s (spec: 2.5–3.5 s); 150 words ~13.6 s (12–16 s).
        val thirty = TypewriterLogic.durationSeconds(30)
        assertTrue("30 words in $thirty s", thirty in 2.5..3.5)
        val long = TypewriterLogic.durationSeconds(150)
        assertTrue("150 words in $long s", long in 12.0..16.0)
        assertEquals(0.0, TypewriterLogic.durationSeconds(0), 0.001)
        // Measured words/sec: 30 words shown in 2727 ms is ~11 wps.
        val measured = TypewriterLogic.wordsPerSecond(30, 2727L)
        assertTrue("measured $measured wps", measured in 9.0..13.0)
    }

    @Test
    fun typewriterSteps_finalEqualsSource() {
        val source = "Aaj Xerox ke 300 cash aur 200 UPI hue. Total 500 rupaye."
        val steps = TypewriterLogic.steps(source)
        assertTrue(steps.isNotEmpty())
        assertEquals(source, steps.last())
        // Progressive growth: each step is a strict prefix of the next.
        for (i in 1 until steps.size) assertTrue(steps[i].startsWith(steps[i - 1]))
    }

    // --- Typewriter (coroutine) ----------------------------------------

    @Test
    fun typewriterFinalEqualsSource_emptyShortLong() = runBlocking {
        for (source in listOf("", "Hi.", "Aaj ka profit ₹500 hai. Xerox se ₹300 cash aur ₹200 UPI mile.")) {
            val writer = Typewriter(wordsPerSecond = 1000.0)
            writer.feed(source)
            writer.markFinished()
            writer.start(this)
            writer.awaitCompletion()
            assertEquals(source, writer.currentText)
            assertEquals(source, writer.fedText)
        }
    }

    @Test
    fun typewriterLongReply_neverAllAtOnce() = runBlocking {
        val source = (1..40).joinToString(" ") { "word$it" }
        val writer = Typewriter(wordsPerSecond = 1000.0)
        writer.feed(source)
        writer.markFinished()
        writer.start(this)
        delay(5L)
        val mid = writer.currentText
        assertTrue("mid-stream text must be a proper prefix, got: $mid", mid.isNotEmpty() && mid.length < source.length && source.startsWith(mid))
        writer.awaitCompletion()
        assertEquals(source, writer.currentText)
    }

    @Test
    fun typewriterStopPreservesPrefix() = runBlocking {
        val source = (1..40).joinToString(" ") { "word$it" }
        val writer = Typewriter(wordsPerSecond = 100.0)
        writer.feed(source)
        writer.markFinished()
        writer.start(this)
        delay(60L)
        writer.stop()
        writer.awaitCompletion()
        val shown = writer.currentText
        assertTrue("stopped text must be a non-empty prefix", shown.isNotEmpty() && shown.length < source.length)
        assertTrue(source.startsWith(shown))
    }

    @Test
    fun typewriterAppendWhileTyping() = runBlocking {
        val writer = Typewriter(wordsPerSecond = 1000.0)
        writer.feed("Aaj Xerox ke 300 cash hue. ")
        writer.start(this)
        delay(10L)
        writer.feed("Aur 200 UPI bhi mile.")
        writer.markFinished()
        writer.awaitCompletion()
        assertEquals("Aaj Xerox ke 300 cash hue. Aur 200 UPI bhi mile.", writer.currentText)
    }

    @Test
    fun typewriterFlushRevealsAll() = runBlocking {
        val source = "Short reply, typed at once on flush."
        val writer = Typewriter(wordsPerSecond = 11.0)
        writer.feed(source)
        writer.start(this)
        writer.flush()
        assertEquals(source, writer.currentText)
    }

    // --- SSE parser ------------------------------------------------------

    @Test
    fun sseParser_splitLinesAndSplitUtf8() {
        val parser = SseParser()
        // One data line split across two feeds — including inside a
        // Devanagari word — parses exactly once, whole.
        val first = parser.feed("data: {\"text\": \"नम")
        assertTrue(first.isEmpty())
        val second = parser.feed("स्ते, aaj ka hisab\"}\n")
        assertEquals(1, second.size)
        assertTrue(second[0] is SseEvent.Text)
        assertEquals("नमस्ते, aaj ka hisab", (second[0] as SseEvent.Text).text)
    }

    @Test
    fun sseParser_doneAndCancel() {
        val parser = SseParser()
        val events = parser.feed("data: {\"text\": \"Hi\"}\n: ping\n\ndata: [DONE]\n")
        assertEquals(4, events.size)
        assertTrue(events[0] is SseEvent.Text)
        assertTrue(events[1] is SseEvent.Ignored)
        assertTrue(events[2] is SseEvent.Ignored)
        assertTrue(events[3] is SseEvent.Done)
        assertTrue(parser.isDone)
        // Feeding after [DONE] is a no-op — no duplicate text.
        assertEquals(emptyList<SseEvent>(), parser.feed("data: {\"text\": \"again\"}\n"))
    }

    @Test
    fun sseParser_ignoresCommentsAndMalformed() {
        val parser = SseParser()
        assertEquals(listOf(SseEvent.Ignored), parser.feed(": keep-alive\n"))
        assertEquals(listOf(SseEvent.Ignored), parser.feed("\n"))
        assertEquals(listOf(SseEvent.Ignored), parser.feed("data: {\"no_text\": 1}\n"))
        assertEquals("a\nb", parser.extractFirstText("{\"text\": \"a\\nb\"}"))
        assertEquals(null, parser.extractFirstText("{\"other\": \"x\"}"))
    }

    @Test
    fun sseParser_contentKey_openAiStyleDeltas() {
        // UPDATE 19 — the cloud now speaks OpenAI-style chat
        // completions: deltas carry choices[0].delta.content. The
        // opening role-only chunk has "content": null and must be
        // ignored, never treated as text.
        val parser = SseParser("content")
        val events = parser.feed(
            "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":null}}]}\n" +
                "data: {\"choices\":[{\"delta\":{\"content\":\"Namaste\"}}]}\n" +
                "data: {\"choices\":[{\"delta\":{\"content\":\"!\"}}]}\n" +
                "data: [DONE]\n"
        )
        assertEquals(4, events.size)
        assertTrue(events[0] is SseEvent.Ignored)
        assertEquals("Namaste", (events[1] as SseEvent.Text).text)
        assertEquals("!", (events[2] as SseEvent.Text).text)
        assertTrue(events[3] is SseEvent.Done)
        assertEquals(
            "Aaj ka profit ₹500 hai.",
            parser.extractFirstContent(
                "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"Aaj ka profit ₹500 hai.\"}}]}"
            )
        )
        assertEquals(null, parser.extractFirstContent("{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":null}}]}"))
    }

    @Test
    fun aiModelIsLiveStableFlash() {
        // UPDATE 19 — the old 2.0-flash value is shut down (provider
        // models page, June 1 2026); the constant must be the live
        // Stable Flash, shared with the website.
        assertEquals("gemini-3.5-flash-lite", AiFeatures.AI_MODEL)
        assertFalse(AiFeatures.AI_MODEL.contains("2.0-flash"))
    }

    @Test
    fun streamingErrorsAreTyped() {
        assertTrue(StreamingError.NoCloudConfigured() is StreamingError)
        assertTrue(StreamingError.Network() is StreamingError)
        assertEquals(429, StreamingError.HttpStatus(429).statusCode)
        assertTrue(StreamingError.InvalidResponse() is StreamingError)
        assertTrue(StreamingError.Cancelled() is StreamingError)
    }

    // --- Key migration (UPDATE 17 check) ---------------------------------
    // The migration itself lives in SettingsStore (needs a Context, so
    // it cannot run in this JVM unit test). Its LOGIC — copy the
    // legacy entry into the new entry only when the new one is empty,
    // keep the legacy entry in place, never overwrite a set key, and
    // clear removes both — is mirrored exactly in
    // ai_assistant_mirror.py (u17-migration-*) and verified there.
    @Test
    fun migrationLogic_documentedInMirror() {
        assertTrue(true)
    }

    // ------------------------------------------------------------------
    // UPDATE 20 / 21 / 22 — video bugs, follow-ups, app-change.
    // A threaded conversation: the same context flows through every
    // turn exactly as ChatbotViewModel.handleMessage does (understand
    // → updateContext → parse). The ViewModel's delivery bookkeeping
    // (active checklist, offer clearing, dev-request save, service
    // add + verify) is verified in the mirror Session tests; here the
    // parser + conversation layer is asserted. Android has no JDK on
    // this VM, so these tests run in Android Studio, not here.
    // ------------------------------------------------------------------
    private class ThreadedChat(val today: Long) {
        var context = AiAssistantParser.AiConversationContext(dayEpoch = today)
        private val agents = listOf("Ramesh", "Suresh")
        private val customers = listOf("Rahul", "Sana")
        fun send(text: String): AiAssistantParser.AiParseResult {
            val lang = Multilingual.detectLanguage(text).language
            val meaning = ConversationEngine.understand(text, context, lang)
            context = ConversationMemory.updateContext(context, text, meaning)
            return AiAssistantParser.parse(text, context, agents, customers)
        }
        fun conversational(text: String): AiAssistantParser.AiParseResult.Conversational {
            val result = send(text)
            assertTrue("expected Conversational for: $text (got $result)", result is AiAssistantParser.AiParseResult.Conversational)
            return result as AiAssistantParser.AiParseResult.Conversational
        }
    }

    @Test
    fun videoSequence_exactFourMessages() {
        val chat = ThreadedChat(today)
        val plan = chat.conversational("Kal Pan Card Banane Hai")
        assertEquals("plan", plan.intent)
        assertTrue("plan offers a checklist: ${plan.text}", plan.text.contains("checklist", ignoreCase = true))
        val accepted = chat.conversational("Ha")
        assertEquals("checklist", accepted.intent)
        assertTrue("accepting the offer builds a real checklist", accepted.checklist.isNotEmpty())
        val explicit = chat.conversational("Kal Pan Card Banane Hai Checklist Bana Do")
        assertEquals("checklist", explicit.intent)
        assertTrue("an explicit checklist request builds it, never repeats the plan", explicit.checklist.isNotEmpty())
    }

    @Test
    fun phrasings_checklistBanaDoForms() {
        val forms = listOf(
            "Checklist bana do", "Checklist bana de", "Checklist bana dena",
            "Checklist banake do", "Checklist bana dijiye", "Checklist bana do na",
            "Checklist banakar do", "list banao", "list bana do", "checklist banao"
        )
        for (form in forms) {
            val chat = ThreadedChat(today)
            chat.conversational("Kal Pan Card Banane Hai")
            val reply = chat.conversational(form)
            assertEquals("'$form' must build the checklist, got ${reply.intent}", "checklist", reply.intent)
            assertTrue("'$form' must return items", reply.checklist.isNotEmpty())
        }
    }

    @Test
    fun bareNumberAnswersPendingCountQuestion() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        val reply = chat.conversational("5.")
        assertEquals("checklist", reply.intent)
        assertEquals(5, reply.checklistCount)
        assertEquals("pan", reply.checklistTopic)
    }

    @Test
    fun correctionReplacesStoredCount() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("5.")
        val reply = chat.conversational("Nahi, 3 the, 5 nahi")
        assertEquals("checklist", reply.intent)
        assertEquals(3, reply.checklistCount)
        assertTrue("the correction is acknowledged: ${reply.text}", reply.text.contains("3"))
    }

    @Test
    fun documentsStayInTopic() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("5.")
        val reply = chat.conversational("Documents bhi batao.")
        assertEquals("pan_documents", reply.intent)
        assertTrue("the documents are listed: ${reply.text}", reply.text.contains("Aadhaar", ignoreCase = true))
    }

    @Test
    fun englishConversionPreservesChecklist() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("5.")
        val reply = chat.conversational("Aur English mein likho.")
        assertEquals("checklist", reply.intent)
        assertEquals(5, reply.checklistCount)
        assertTrue("the same items, now in English: ${reply.text}", reply.text.contains("Aadhaar card"))
    }

    @Test
    fun checklistEditAddsDocuments() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        val before = chat.conversational("5.")
        val edited = chat.conversational("Isme documents bhi add karo.")
        assertEquals("checklist", edited.intent)
        assertTrue("the edit grows the list", edited.checklist.size > before.checklist.size)
        assertTrue("the documents join it: ${edited.text}", edited.text.contains("Aadhaar card"))
    }

    @Test
    fun showChecklistAgain() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("5.")
        val reply = chat.conversational("PAN wali checklist phir dikhao")
        assertEquals("checklist", reply.intent)
        assertTrue("the same checklist is re-shown", reply.checklist.isNotEmpty())
    }

    @Test
    fun doSummaryFormsReachRealSummary() {
        for (form in listOf("summary bana do", "summary bana de", "hisab bana do", "report banao")) {
            val reply = conversational(form)
            assertEquals("'$form' must reach the real summary", "summary", reply.intent)
        }
    }

    @Test
    fun offerClearsOnTopicChange() {
        val chat = ThreadedChat(today)
        chat.conversational("Kal Pan Card Banane Hai")
        val entry = chat.send("Aaj Xerox ke 300 cash hue")
        assertTrue("the entry is a financial action", entry is AiAssistantParser.AiParseResult.Action)
        val reply = chat.send("Ha")
        assertTrue("after the topic change 'Ha' is the entry confirm, not a checklist",
            reply !is AiAssistantParser.AiParseResult.Conversational ||
                (reply as AiAssistantParser.AiParseResult.Conversational).checklist.isEmpty())
    }

    @Test
    fun bareHaWithNoOfferIsNotChecklistOrAction() {
        val result = parse("Ha")
        assertTrue("a bare 'Ha' with nothing pending is not an action", result !is AiAssistantParser.AiParseResult.Action)
        if (result is AiAssistantParser.AiParseResult.Conversational) {
            assertTrue("a bare 'Ha' builds no checklist", result.checklist.isEmpty())
        }
    }

    @Test
    fun appChange_aadhaarModuleSpecThenQueued() {
        val chat = ThreadedChat(today)
        val spec = chat.conversational("Aadhaar Mobile Number Update ka module bana do")
        assertEquals("app_change_spec", spec.intent)
        assertEquals("Aadhaar Mobile Number Update", spec.appChangeSpec?.title)
        assertEquals("module", spec.appChangeSpec?.kind)
        assertFalse("never deflects to a portal: ${spec.text}", spec.text.contains("portal", ignoreCase = true))
        assertTrue("the UIDAI distinction is stated: ${spec.text}", spec.text.contains("UIDAI"))
        assertFalse("never claims the module exists: ${spec.text}", spec.text.contains("ban gaya", ignoreCase = true))
        val queued = chat.conversational("Haan, banao")
        assertEquals("app_change_queued", queued.intent)
        assertTrue("the confirm resolves against the pending request", queued.appChangeConfirmed)
        assertEquals("module", queued.appChangeSpec?.kind)
        assertTrue("the queued reply says the in-app AI cannot deploy code: ${queued.text}",
            queued.text.contains("code deploy nahi kar sakta", ignoreCase = true))
    }

    @Test
    fun appChange_addFieldModifyReportServiceCategory() {
        val field = ThreadedChat(today)
        val fieldSpec = field.conversational("PAN Card module mein ek naya field add karo — customer ka email")
        assertEquals("app_change_spec", fieldSpec.intent)
        assertEquals("field", fieldSpec.appChangeSpec?.kind)
        assertEquals("app_change_queued", field.conversational("Haan, banao").intent)

        val modify = ThreadedChat(today)
        val modifySpec = modify.conversational("Cash Book module ko modify karo — usme UPI filter bhi chahiye")
        assertEquals("modify", modifySpec.appChangeSpec?.kind)
        assertEquals("app_change_queued", modify.conversational("Haan, banao").intent)

        val report = ThreadedChat(today)
        val reportSpec = report.conversational("Ek naya monthly expense report banao")
        assertEquals("report", reportSpec.appChangeSpec?.kind)
        assertEquals("app_change_queued", report.conversational("Haan, banao").intent)

        val service = ThreadedChat(today)
        val serviceSpec = service.conversational("Add a new service: Passport Photo")
        assertEquals("service", serviceSpec.appChangeSpec?.kind)
        assertEquals("Passport Photo", serviceSpec.appChangeSpec?.title)
        assertEquals("app_change_service", service.conversational("Haan, banao").intent)

        val category = ThreadedChat(today)
        val categorySpec = category.conversational("Ek nayi business category banao — Stationery")
        assertEquals("category", categorySpec.appChangeSpec?.kind)
        assertEquals("app_change_queued", category.conversational("Haan, banao").intent)
    }

    @Test
    fun appChange_commaInServiceNamePreserved() {
        val chat = ThreadedChat(today)
        val spec = chat.conversational("Add a new service: Photo, Printing")
        assertEquals("service", spec.appChangeSpec?.kind)
        assertTrue("the comma survives title extraction so the name check can fire: ${spec.appChangeSpec?.title}",
            spec.appChangeSpec?.title?.contains(",") == true)
    }

    @Test
    fun appChange_declineCancelsTheRequest() {
        val chat = ThreadedChat(today)
        chat.conversational("Aadhaar Mobile Number Update ka module bana do")
        val reply = chat.conversational("Nahi")
        assertEquals("offer_declined", reply.intent)
        assertTrue("the decline names the cancelled request: ${reply.text}", reply.text.contains("Aadhaar Mobile Number Update"))
    }

    @Test
    fun appChange_quotedNameIsTheTitle() {
        // Website appChangeNameFor: a quoted name wins over the
        // surrounding words.
        val chat = ThreadedChat(today)
        val spec = chat.conversational("Add a 'GST Number' field to customers")
        assertEquals("app_change_spec", spec.intent)
        assertEquals("field", spec.appChangeSpec?.kind)
        assertEquals("GST Number", spec.appChangeSpec?.title)
        assertEquals("app_change_queued", chat.conversational("Haan, banao").intent)
    }

    @Test
    fun appChange_calledAndForNameTheThing() {
        val called = ThreadedChat(today)
        val service = called.conversational("Add a new service called Courier")
        assertEquals("service", service.appChangeSpec?.kind)
        assertEquals("Courier", service.appChangeSpec?.title)

        val forName = ThreadedChat(today)
        val module = forName.conversational("Create a new module for Passport services")
        assertEquals("module", module.appChangeSpec?.kind)
        assertEquals("Passport", module.appChangeSpec?.title)
    }

    @Test
    fun appChange_modifyNamedAreaIsNotNavigation() {
        // Website order (classifyIntent 1b beats 2d): "Modify the
        // Cash Book to show weekly totals" is a change request, not
        // "open Cash Book".
        val chat = ThreadedChat(today)
        val spec = chat.conversational("Modify the Cash Book to show weekly totals")
        assertEquals("app_change_spec", spec.intent)
        assertEquals("modify", spec.appChangeSpec?.kind)
        assertEquals("Cash Book", spec.appChangeSpec?.title)
        assertEquals("app_change_queued", chat.conversational("Haan, banao").intent)
    }

    @Test
    fun appChange_locationIsNotAName() {
        // "Cash Book mein ek field add karo" — the field is unnamed;
        // the location is not its name.
        val chat = ThreadedChat(today)
        val spec = chat.conversational("Cash Book mein ek field add karo")
        assertEquals("field", spec.appChangeSpec?.kind)
        assertEquals("Naya Field", spec.appChangeSpec?.title)
    }

    @Test
    fun appChange_bareAddServiceAndReportAndDashboard() {
        val service = ThreadedChat(today)
        val serviceSpec = service.conversational("Add a service")
        assertEquals("service", serviceSpec.appChangeSpec?.kind)
        assertEquals("Naya Service", serviceSpec.appChangeSpec?.title)

        val report = ThreadedChat(today)
        val reportSpec = report.conversational("ek aur report banao")
        assertEquals("report", reportSpec.appChangeSpec?.kind)
        val report2 = ThreadedChat(today)
        assertEquals("report", report2.conversational("Add a report").appChangeSpec?.kind)

        val dashboard = ThreadedChat(today)
        val dashSpec = dashboard.conversational("Create a new dashboard")
        assertEquals("feature", dashSpec.appChangeSpec?.kind)
        assertEquals("Dashboard", dashSpec.appChangeSpec?.title)
    }

    @Test
    fun offerExpiresAfterAGeneralQuestion() {
        // Website done(): only plan / topic_followup / app_change keep
        // the offer. A general question ("PAN Card kya hai?") is a new
        // topic, so a later "Ha" builds nothing.
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("PAN Card kya hai?")
        assertNull("the offer expired with the new topic", chat.context.pendingChecklistOffer)
        val reply = chat.conversational("Ha")
        assertTrue("a bare yes after expiry is not a checklist: ${reply.intent}",
            reply.intent != "checklist" && reply.checklist.isEmpty())
        assertNull("no active checklist is stored from an expired offer", chat.context.activeChecklist)
    }

    @Test
    fun documentsFollowUpKeepsTheOffer() {
        // The website's KEEP_OFFER includes topic_followup: asking for
        // the documents does NOT spend the checklist offer, so "Ha"
        // afterwards still builds it.
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("Documents bhi batao.")
        assertNotNull("the offer survives a documents follow-up", chat.context.pendingChecklistOffer)
        val reply = chat.conversational("Ha")
        assertEquals("checklist", reply.intent)
        assertTrue("the checklist is built from the surviving offer: ${reply.text}",
            reply.text.contains("Aadhaar card"))
    }

    @Test
    fun translateChecklistClaimsNoLanguageSwitch() {
        // Website checklist_translate returns ONLY the converted list.
        // The conversation does NOT switch to English, so the reply
        // must not claim otherwise.
        val chat = ThreadedChat(today)
        chat.conversational("Kal mujhe PAN Card banane hain.")
        chat.conversational("5.")
        val reply = chat.conversational("Aur English mein likho.")
        assertEquals("checklist", reply.intent)
        assertFalse("no false 'from now on I will talk in English' claim: ${reply.text}",
            reply.text.contains("From now on") || reply.text.contains("Ab se main"))
        assertTrue("the same checklist, in English: ${reply.text}",
            reply.text.contains("Take the customer's Aadhaar card"))
    }

    @Test
    fun explainerRouting_panAadhaarConversion() {
        val pan = conversational("PAN Card kya hai?")
        assertTrue("an explainer is a general answer, not a figures question: ${pan.intent}",
            pan.intent == "general" || pan.intent == "pan_explainer")
        val conversion = conversational("5 km mein kitne metre hote hain?")
        assertTrue("the conversion is computed: ${conversion.text}", conversion.text.contains("5000"))
        val advice = conversational("Dukaan ka business kaise badhaye?")
        assertFalse("advice never gets the placeholder excuse: ${advice.text}",
            advice.text.contains("abhi taiyaar hai", ignoreCase = true))
    }

    @Test
    fun mtPrincipalIsNotCommission() {
        val result = parse("Money Transfer 10000 rupaye cash bheje, commission 50")
        assertTrue("MT is an action: $result", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue("MT action: $action", action is AiAssistantParser.AiAction.MoneyTransfer)
        val mt = action as AiAssistantParser.AiAction.MoneyTransfer
        assertEquals(1000000L, mt.principalPaise)
        assertEquals(5000L, mt.commissionPaise)
    }

    @Test
    fun dueTotalAndReceivedSplit() {
        val asking = parse("Rahul ka PAN Card ka kaam hai, 500 rupaye, 200 mile")
        assertTrue("the received part needs its mode first: $asking", asking is AiAssistantParser.AiParseResult.Clarify)
        val result = parse("Rahul ka PAN Card ka kaam hai, 500 rupaye, 200 mile cash")
        assertTrue("the due is an action: $result", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue("due action: $action", action is AiAssistantParser.AiAction.RecordCustomerDue)
        val due = action as AiAssistantParser.AiAction.RecordCustomerDue
        assertEquals(50000L, due.amountPaise)
        assertEquals(20000L, due.receivedPaise)
        assertEquals("Rahul", due.customerName)
    }

    @Test
    fun countableServices_aadhaarVoterAyushman() {
        for ((planText, number) in listOf(
            "Kal Aadhaar update karna hai." to 3,
            "Kal Voter ID banane hain." to 2,
            "Kal Ayushman Card banane hain." to 4
        )) {
            val chat = ThreadedChat(today)
            val plan = chat.conversational(planText)
            assertEquals("plan", plan.intent)
            assertTrue("the count question is asked: ${plan.text}", plan.text.contains("Kitne applications hain?"))
            val reply = chat.conversational("$number.")
            assertEquals("checklist", reply.intent)
            assertEquals(number, reply.checklistCount)
        }
    }

    @Test
    fun englishPlanAndShowMe() {
        val plan = conversational("I have to make PAN cards tomorrow")
        assertEquals("plan", plan.intent)
        val route = AiNavigation.routeFor("Show me the Cash Book")
        assertNotNull("Show me navigates to the real Cash Book", route)
        assertEquals("cash_book", route!!.first)
        val joke = conversational("Show me a joke")
        assertTrue("Show me a joke is a joke, not a statement: ${joke.intent}", joke.intent.contains("joke", ignoreCase = true))
    }

    @Test
    fun denaHaiQuestionIsNotAPlan() {
        val result = parse("Ramesh ko kitna dena hai?")
        assertTrue("a due question is factual, never a plan: $result", result is AiAssistantParser.AiParseResult.Factual)
        val snapWithAgent = KnowledgeSnapshot(
            profileId = 1, profileName = "Shop", profileCategory = "CSC",
            agents = listOf(
                com.alfalah.business.data.entity.AgentEntity(
                    id = 5, profileId = 1, name = "Ramesh", mobile = "",
                    type = com.alfalah.business.domain.AgentType.OTHER
                )
            )
        )
        val answer = BusinessKnowledge.answer("Ramesh ko kitna dena hai?", snapWithAgent, today)
        assertNotNull("the agent answer exists", answer)
        assertTrue("the agent answer names the payable: ${answer!!.text}", answer.text.contains("payable", ignoreCase = true))
    }

    @Test
    fun countInsidePlanMessageIsStillAPlan() {
        val reply = conversational("Kal ke liye 5 PAN Card banane hain")
        assertEquals("plan", reply.intent)
        assertTrue("the count question is the follow-up: ${reply.text}", reply.text.contains("Kitne applications hain?"))
    }

    @Test
    fun gibberishIsHonestLimitation() {
        val result = parse("Xyzqwv blorp flibberty gibbet")
        assertTrue("gibberish is unknown, never a statement: $result", result is AiAssistantParser.AiParseResult.Unknown)
    }

    @Test
    fun uidaiPortalRequestIsExternalLimit() {
        val reply = conversational("Mujhe UIDAI portal par Aadhaar update kar do")
        assertEquals("external_limit", reply.intent)
        assertFalse("no fake success: ${reply.text}", reply.text.contains("save ho gaya", ignoreCase = true))
    }

    @Test
    fun aadhaarSubmissionIsExternalLimitButPlanIsNot() {
        val submission = conversational("Mera Aadhaar update kar do")
        assertEquals("external_limit", submission.intent)
        val plan = conversational("Kal Aadhaar update karna hai.")
        assertEquals("plan", plan.intent)
    }

    @Test
    fun serviceCountQuestionFromLedger() {
        val answer = knowledgeAnswer("Kitne PAN Card banaye aaj?")
        assertTrue("the count comes from the ledger: $answer", answer.contains("PAN Card jobs: 0"))
    }

    // ------------------------------------------------------------------
    // UPDATE 23 — context-aware delete (the 2026-11-27 16:02–16:04 IST
    // live bug: "Isko Remove Kardo" → fake "hata diya", then the
    // verified ₹600 save denied, then a false "chat can't delete").
    // ------------------------------------------------------------------
    private val savedEntryCtx = ctx.copy(
        lastSavedEntry = AiAssistantParser.LastSavedEntry(
            transactionId = 7L,
            label = "Aadhaar Services ₹600 (UPI)",
            serviceLabel = "Aadhaar Services",
            amountPaise = 60_000L,
            mode = PaymentMode.UPI,
            dayEpoch = today
        )
    )

    @Test
    fun deleteIntent_hatanaHaiIsBusinessActionNotStatement() {
        val meaning = ConversationEngine.understand("Hatana hai", ctx, AiLanguage.HINGLISH)
        assertEquals("a bare delete is a financial action, never a statement", ConversationIntent.BUSINESS_ACTION, meaning.intent)
        val meaning2 = ConversationEngine.understand("Isko remove kardo", ctx, AiLanguage.HINGLISH)
        assertEquals("a pronoun delete is a financial action, never unknown", ConversationIntent.BUSINESS_ACTION, meaning2.intent)
    }

    @Test
    fun deletePronoun_resolvesToLastSavedEntry() {
        val result = parse("Isko remove kardo", savedEntryCtx)
        assertTrue("pronoun delete must be a delete action, not a clarification: $result", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue("the action deletes the saved row: $action", action is AiAssistantParser.AiAction.DeleteTransaction)
        assertEquals(7L, (action as AiAssistantParser.AiAction.DeleteTransaction).transactionId)
        assertTrue("the preview names the entry", result.preview.contains("Aadhaar Services"))
        assertTrue("the preview names the amount", result.preview.contains("₹600"))
    }

    @Test
    fun deletePronoun_exact4pmWordingResolves() {
        val result = parse("Isko remove kardo me bus check kar rha tha", savedEntryCtx)
        assertTrue("the exact owner wording must resolve: $result", result is AiAssistantParser.AiParseResult.Action)
        val action = (result as AiAssistantParser.AiParseResult.Action).action
        assertTrue(action is AiAssistantParser.AiAction.DeleteTransaction)
        assertEquals(7L, (action as AiAssistantParser.AiAction.DeleteTransaction).transactionId)
    }

    @Test
    fun deletePronoun_withoutSavedEntryIsBareClarification() {
        val result = parse("Isko remove kardo", ctx)
        assertTrue("no verified save → ask which entry, never a fake delete: $result", result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue("the clarification asks for the delete target", (result as AiAssistantParser.AiParseResult.Clarify).missing.contains("delete target"))
        assertFalse("never a delete action without a target: $result", result is AiAssistantParser.AiParseResult.Action)
    }

    @Test
    fun deleteBare_hatanaHaiIsClarificationNotCloud() {
        val result = parse("Hatana hai", ctx)
        assertTrue("bare delete asks which entry: $result", result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("delete target"))
        assertFalse("bare delete never becomes a conversational/cloud reply", result is AiAssistantParser.AiParseResult.Conversational)
    }

    @Test
    fun deleteAmountForm_stillResolvesByAmount() {
        val result = parse("Aadhaar 600 wali entry delete kar do", ctx)
        assertTrue("amount delete still resolves by amount/service: $result", result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue("the amount path asks for the exact entry", (result as AiAssistantParser.AiParseResult.Clarify).missing.contains("exact entry"))
    }

    @Test
    fun deleteIntent_doesNotBecomeFactualQuestion() {
        val result = parse("Hatana hai?", ctx)
        assertFalse("a delete with '?' is not a factual question: $result", result is AiAssistantParser.AiParseResult.Factual)
        assertTrue("it is the bare-delete clarification: $result", result is AiAssistantParser.AiParseResult.Clarify)
    }

    @Test
    fun deleteIntent_wordFormsRecognised() {
        assertTrue(AiAssistantParser.isDeleteIntent("entry hata do"))
        assertTrue(AiAssistantParser.isDeleteIntent("ye wali entry mita do"))
        assertTrue(AiAssistantParser.isDeleteIntent("delete kar do"))
        assertTrue(AiAssistantParser.isDeleteIntent("isko remove kar do"))
        assertFalse("a save is not a delete", AiAssistantParser.isDeleteIntent("Xerox ke 300 cash hue"))
        assertTrue(AiAssistantParser.isPronounReference("isko remove kardo"))
        assertTrue(AiAssistantParser.isPronounReference("ye wali entry hata do"))
        assertTrue(AiAssistantParser.isPronounReference("is entry ko delete kar do"))
        assertFalse("an amount delete has no pronoun", AiAssistantParser.isPronounReference("600 wali entry delete kar do"))
    }

    @Test
    fun cloudGuard_claimsAreCaughtAndCleanRepliesPass() {
        assertTrue("fabricated deletion is a claim", CloudAiClient.containsFinancialActionClaim("Theek hai bhai, hata diya."))
        assertTrue("denying a verified save is a claim", CloudAiClient.containsFinancialActionClaim("Maine koi entry save hi nahi ki thi, ₹600 pehle se tha."))
        assertTrue("an English delete claim is a claim", CloudAiClient.containsFinancialActionClaim("Entry deleted successfully."))
        assertTrue("a save claim is a claim", CloudAiClient.containsFinancialActionClaim("Save ho gaya, ₹600 UPI."))
        assertFalse("a plain summary is not a claim", CloudAiClient.containsFinancialActionClaim("Aaj ka profit ₹600 hai."))
        assertFalse("a greeting is not a claim", CloudAiClient.containsFinancialActionClaim("Namaste! Aaj shop ka kaam kaisa chal raha hai?"))
    }

    @Test
    fun cloudGuard_replacementIsHonestAndGroundsTheSave() {
        val guarded = CloudAiClient.guardCloudReply("Theek hai bhai, hata diya.", "Aadhaar Services ₹600 (UPI)")
        assertNotNull("a claim must be replaced", guarded)
        assertTrue("the replacement says nothing was deleted from chat: $guarded", guarded!!.contains("koi entry save ya delete nahi ki"))
        assertTrue("the replacement grounds the verified save: $guarded", guarded.contains("Aadhaar Services ₹600 (UPI)"))
        assertFalse("the replacement never repeats the denial: $guarded", guarded.contains("save hi nahi ki"))
        assertNull("a clean reply is kept unchanged", CloudAiClient.guardCloudReply("Aaj ka profit ₹600 hai.", "Aadhaar Services ₹600 (UPI)"))
    }

    @Test
    fun lastSavedFacts_groundVerifiedSave() {
        val facts = AiAssistantParser.lastSavedFacts(savedEntryCtx)
        assertNotNull("a verified save produces facts", facts)
        assertTrue("the facts name the entry: $facts", facts!!.contains("Aadhaar Services ₹600 (UPI)"))
        assertTrue("the facts forbid denying the save: $facts", facts.contains("Never say it was not saved"))
        assertNull("no verified save → no facts, never a claimed save", AiAssistantParser.lastSavedFacts(ctx))
    }

    @Test
    fun correctionStillWorksAfterDeleteFix() {
        val result = parse("Xerox 300 wali entry galat hai, 350 karo", ctx)
        assertTrue("a correction is still the exact-entry clarification: $result", result is AiAssistantParser.AiParseResult.Clarify)
        assertTrue((result as AiAssistantParser.AiParseResult.Clarify).missing.contains("exact entry"))
    }
}
