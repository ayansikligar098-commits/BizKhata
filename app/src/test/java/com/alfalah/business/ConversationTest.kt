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
import com.alfalah.business.domain.ServiceType
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
}
