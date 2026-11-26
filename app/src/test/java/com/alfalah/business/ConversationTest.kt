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
import com.alfalah.business.domain.PaymentMode
import com.alfalah.business.domain.ServiceType
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
            "built-in backstop" to { builtInResponderBackstop() }
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
