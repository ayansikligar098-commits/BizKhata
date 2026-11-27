package com.alfalah.business.domain

import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext

/**
 * Cloud AI client — the OPTIONAL cloud summary behind BizKhata AI
 * (owner order 2026-11-26 22:16 IST / UPDATE 12: the underlying AI
 * provider is approved, but its name must NEVER appear in the UI).
 *
 * Provider-neutral naming is used everywhere in code and in every
 * user-visible string: the user sees only "BizKhata AI Assistant".
 * The API key is the OWNER's own key, added by him in Settings under
 * the neutral label "AI key". It is stored only in the app-private
 * DataStore, travels only as an HTTP header to the AI service, and is
 * never displayed, never written into a chat message or a financial
 * record, and never shipped in code. There is no key anywhere in this
 * codebase.
 *
 * UPDATE 19 (2026-11-27) — service address + model field. All cloud
 * calls go to the service's OpenAI-compatible chat-completions
 * endpoint (see CHAT_COMPLETIONS_URL) with Bearer auth and
 * OpenAI-style messages. EVERY request body carries
 * "model": AiFeatures.AI_MODEL — the endpoint REQUIRES the model
 * field; a request without it fails even with a valid key (the same
 * bug the website fixed in commit d99e85b9). The model value lives
 * in exactly ONE place, [AiFeatures.AI_MODEL] (see the UPDATE 19
 * note there — the previous 2.0-flash value is shut down, so it must
 * never come back). Non-streaming replies are
 * read from choices[0].message.content; streaming replies arrive as
 * SSE events whose choices[0].delta.content is emitted per chunk
 * (parsed by [SseParser] with the "content" key).
 *
 * The client is used ONLY to word the same snapshot facts more
 * naturally. The prompt tells it to use ONLY those facts, never to
 * invent a number, and to answer in the user's language (Hinglish /
 * English / Hindi). The numbers in its answer still come from the real
 * ledgers — the cloud only words them.
 *
 * Any failure (no internet, bad key, service unavailable, bad response)
 * returns [AiFeatures.AiResult.NotAvailable] with a PLAIN, friendly
 * message — no provider name, no HTTP code, no key talk. The
 * chatbot then falls back to the built-in responder and says so in
 * plain words. The app never shows a spinner forever and never fakes
 * an answer. No new dependency: plain [HttpURLConnection], manual JSON.
 */
class CloudAiClient(private val apiKey: String) : AiFeatures.AiAssistant {

    /** Parses OpenAI-style payloads (choices / message / delta). */
    private val contentParser = SseParser("content")

    override suspend fun ask(question: String, businessContext: String): AiFeatures.AiResult {
        if (apiKey.isBlank()) {
            return AiFeatures.AiResult.NotAvailable(
                "AI summary off hai — Settings me apni AI key add karein."
            )
        }
        return try {
            val answer = withContext(Dispatchers.IO) { callAi(question, businessContext) }
            if (answer.isNullOrBlank()) {
                AiFeatures.AiResult.NotAvailable("AI se khaali jawab mila — built-in jawab dikhaya ja raha hai.")
            } else {
                AiFeatures.AiResult.Answer(answer.trim())
            }
        } catch (_: Exception) {
            AiFeatures.AiResult.NotAvailable(
                "AI abhi available nahi hai, baad me try karo — built-in jawab dikhaya ja raha hai."
            )
        }
    }

    private fun callAi(question: String, businessContext: String): String? {
        val system = "You are BizKhata AI Assistant, a shop accounting helper. " +
            "Answer in the SAME language and style as the question — it may be Hinglish, English, Hindi, " +
            "Gujarati, Marathi, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Urdu, " +
            "Nepali or another Indian language, in native script or Roman letters. Reply naturally in that language. " +
            "Use ONLY the facts in the user's message. NEVER invent a number, a name or a record. " +
            "NEVER claim that you saved, deleted, corrected or refunded any record — you cannot perform " +
            "financial actions; only the app does that, after the user confirms it. " +
            "If the facts say there is no record, say so plainly. " +
            "If the question is casual conversation, reply naturally and briefly — never mention business records unless the question asks about them. " +
            "Keep the answer short and simple, in plain words a shopkeeper understands."
        val user = businessContext + "\n\nQuestion: " + question
        return postChat(system, user, temperature = 0.7)
    }

    /** UPDATE 15 — the MAIN engine for casual / general conversation.
     *  The local engine understands meaning and handles structured
     *  work, but open-ended conversation is generated HERE, dynamically,
     *  from the user's actual words + the conversation history + the
     *  business context — never from a fixed reply. [context] carries
     *  the recent conversation (user + assistant turns), the user's
     *  language and style, and the real ledger facts. Rules for the
     *  reply: answer in the SAME language and style as the user; be
     *  natural and varied, never a canned phrase; understand the actual
     *  intention (greeting, statement, plan, question, request) and
     *  answer THAT — a plan about tomorrow is acknowledged and helped
     *  with, never turned into a question about money; figures come
     *  ONLY from the supplied facts, never invented; the assistant
     *  never performs a financial action itself — it only proposes one,
     *  and the app confirms it with the user first; if something is
     *  not known, say so honestly instead of inventing it. Returns
     *  null on any failure — the caller then uses the local reply. */
    suspend fun converse(question: String, context: String): String? {
        if (apiKey.isBlank()) return null
        return try {
            withContext(Dispatchers.IO) {
                val system = "You are BizKhata AI Assistant, a friendly personal and business assistant for a small shopkeeper in India. " +
                    "The user speaks to you in their own language and style — it may be Hinglish, English, Hindi, Gujarati, Marathi, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Urdu, Nepali or another Indian language, in native script or Roman letters. " +
                    "Reply in the SAME language and style as the user's latest message. Be natural, warm and varied — write like a helpful person, never like a form letter, and never repeat the same generic question. " +
                    "First understand the user's actual intention: a greeting, a statement about their day, a plan for tomorrow, a question, a request, or a business action. Answer THAT intention. " +
                    "If the user states a plan (for example they will do PAN Card work tomorrow), acknowledge the plan and offer relevant help such as a checklist — NEVER ask how much money was involved. " +
                    "If the user asks about their business, use ONLY the ledger facts given below — never invent a number, a name or a record; if there is no record, say so plainly and give the real figure (zero when nothing is recorded). " +
                    "You never perform a financial action yourself: if the user wants an entry, a payment or a change, say what you understood and ask them to confirm — the app handles the actual save. " +
                    "NEVER claim that you saved, deleted, corrected or refunded any record, and NEVER say a saved entry was never saved or that its figures existed before — the facts below state what was verified as saved. " +
                    "If you do not know something (live prices, news, weather, or anything outside the facts below), say so honestly in plain words instead of inventing it. " +
                    "Keep replies short and simple, in plain words a shopkeeper understands."
                val user = context + "\n\nLatest message: " + question
                postChat(system, user, temperature = 0.7)
            }
        } catch (_: Exception) {
            null
        }
    }

    /** UPDATE 17 — GENUINE backend streaming (real SSE, not a timer).
     *
     *  Posts to the owner-configured endpoint with streaming requested
     *  ("stream": true) and returns a Flow of incremental text chunks
     *  as they arrive over the wire: each `data:` event is parsed by
     *  [SseParser] (key "content" — choices[0].delta.content) and its
     *  text is emitted immediately — the first chunk is emitted as
     *  soon as it arrives, never after the whole reply is buffered.
     *  The response is read through a UTF-8 reader, so a multi-byte
     *  character split across two network reads is reassembled by the
     *  reader before parsing — it can never surface half-cut.
     *
     *  Cancellation cancels the underlying HTTP connection: collecting
     *  is done in the caller's coroutine, and cancelling it closes the
     *  reader and disconnects the connection in the finally block.
     *  Errors are typed [StreamingError] (network / HTTP status /
     *  invalid response) — the caller turns them into one plain
     *  friendly message; no raw HTTP text ever reaches the user.
     *
     *  When no key is configured there is NO backend stream: this
     *  throws [StreamingError.NoCloudConfigured] and the caller falls
     *  back to the local engine — local engine: typewriter display over locally generated text, no network stream.
     *  That fallback is labelled honestly in code and in the UI note
     *  ("built-in jawab"); it is never presented as a cloud stream. */
    fun hasCloudStream(): Boolean = apiKey.isNotBlank()

    fun converseStreaming(question: String, context: String): Flow<String> = flow {
        if (apiKey.isBlank()) throw StreamingError.NoCloudConfigured()
        val system = "You are BizKhata AI Assistant, a friendly personal and business assistant for a small shopkeeper in India. " +
            "The user speaks to you in their own language and style — it may be Hinglish, English, Hindi, Gujarati, Marathi, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Urdu, Nepali or another Indian language, in native script or Roman letters. " +
            "Reply in the SAME language and style as the user's latest message. Be natural, warm and varied — write like a helpful person, never like a form letter, and never repeat the same generic question. " +
            "First understand the user's actual intention: a greeting, a statement about their day, a plan for tomorrow, a question, a request, or a business action. Answer THAT intention. " +
            "If the user states a plan (for example they will do PAN Card work tomorrow), acknowledge the plan and offer relevant help such as a checklist — NEVER ask how much money was involved. " +
            "If the user asks about their business, use ONLY the ledger facts given below — never invent a number, a name or a record; if there is no record, say so plainly and give the real figure (zero when nothing is recorded). " +
            "You never perform a financial action yourself: if the user wants an entry, a payment or a change, say what you understood and ask them to confirm — the app handles the actual save. " +
            "NEVER claim that you saved, deleted, corrected or refunded any record, and NEVER say a saved entry was never saved or that its figures existed before — the facts below state what was verified as saved. " +
            "If you do not know something (live prices, news, weather, or anything outside the facts below), say so honestly in plain words instead of inventing it. " +
            "Keep replies short and simple, in plain words a shopkeeper understands."
        val user = context + "\n\nLatest message: " + question
        val body = chatBody(system, user, stream = true, temperature = 0.7)
        val connection = openChatConnection(stream = true)
        try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }
            val code = connection.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw StreamingError.HttpStatus(code)
            val parser = SseParser("content")
            var sawAnyText = false
            var streamDone = false
            BufferedReader(InputStreamReader(connection.inputStream, Charsets.UTF_8)).use { reader ->
                val buffer = CharArray(2048)
                while (!streamDone) {
                    currentCoroutineContext().ensureActive()
                    val read = try {
                        reader.read(buffer)
                    } catch (_: java.io.IOException) {
                        throw StreamingError.Network()
                    }
                    if (read < 0) break
                    val events = parser.feed(String(buffer, 0, read))
                    for (event in events) {
                        when (event) {
                            is SseEvent.Text -> {
                                sawAnyText = true
                                emit(event.text)
                            }
                            is SseEvent.Done -> streamDone = true
                            is SseEvent.Ignored -> Unit
                        }
                    }
                    if (parser.isDone) streamDone = true
                }
            }
            if (!sawAnyText) throw StreamingError.InvalidResponse()
        } catch (e: StreamingError) {
            throw e
        } catch (_: kotlinx.coroutines.CancellationException) {
            throw StreamingError.Cancelled()
        } catch (_: java.io.IOException) {
            throw StreamingError.Network()
        } finally {
            connection.disconnect()
        }
    }.flowOn(Dispatchers.IO)

    /** Structured understanding fallback: when the built-in parser
     *  cannot understand a message, ask the cloud AI to return a small
     *  JSON object describing the action. Returns null on any failure
     *  or invalid JSON — the caller then asks the user a clarification
     *  question instead of guessing. The JSON is validated field by
     *  field; no value from it is ever trusted without the repository's
     *  own validation. Never used for amounts the user did not state. */
    suspend fun parseAction(question: String, context: String): String? {
        if (apiKey.isBlank()) return null
        return try {
            withContext(Dispatchers.IO) {
                val system = "You are BizKhata AI Assistant. The user wrote a business message. " +
                    "The message may be in any Indian language, in native script or Romanized " +
                    "(Hinglish, Roman Gujarati, Roman Tamil, and so on) — understand the meaning, not just the script. " +
                    "Reply with ONLY a JSON object, no other text. Keys: kind (one of " +
                    "daily_income, expense, agent_payment, money_transfer, internal_transfer, " +
                    "customer_payment, question, help, unknown), service (Xerox, Printing, " +
                    "Smart Card, PAN Card, Aadhaar Services, Voter ID, Ayushman Card, " +
                    "Passport Size Photo, Scanning, Document Work, Money Transfer, or empty), " +
                    "amount_rupees (number or 0), mode (Cash, UPI or empty), name (agent or " +
                    "customer name or empty). NEVER invent an amount, a mode or a name — " +
                    "use empty / 0 when the message does not state it."
                val user = context + "\n\nMessage: " + question
                // No temperature: structured JSON must be deterministic.
                postChat(system, user, temperature = null)
            }
        } catch (_: Exception) {
            null
        }
    }

    // --- Shared chat-completions plumbing (UPDATE 19) -------------------
    // Every cloud call in this file goes through [postChat] (one-shot)
    // or [converseStreaming] (SSE). Both build their body with
    // [chatBody], which ALWAYS includes "model": AI_MODEL — the
    // endpoint requires it. There is no other request path left in
    // this file; the old native calls are gone.

    /** One non-streaming chat call; returns choices[0].message.content or null. */
    private fun postChat(system: String, user: String, temperature: Double?): String? {
        val body = chatBody(system, user, stream = false, temperature = temperature)
        val connection = openChatConnection(stream = false)
        try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
            val text = BufferedReader(InputStreamReader(connection.inputStream, Charsets.UTF_8)).use { it.readText() }
            return extractMessageContent(text)
        } finally {
            connection.disconnect()
        }
    }

    /** Pull choices[0].message.content out of a chat-completions reply. */
    private fun extractMessageContent(json: String): String? {
        val choicesIdx = json.indexOf("\"choices\"")
        if (choicesIdx < 0) return null
        return contentParser.extractFirstContent(json.substring(choicesIdx))
    }

    /** Open a POST to the chat-completions endpoint with Bearer auth. */
    private fun openChatConnection(stream: Boolean): HttpURLConnection {
        return (URL(CHAT_COMPLETIONS_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = if (stream) 0 else 30000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer " + apiKey)
            if (stream) setRequestProperty("Accept", "text/event-stream")
        }
    }

    /**
     * Build a chat-completions request body. "model" is ALWAYS
     * present (from [AiFeatures.AI_MODEL] — the single source of
     * truth, shared with the website). "stream": true only for the
     * SSE path. [temperature] is omitted (null) for structured JSON.
     */
    private fun chatBody(system: String, user: String, stream: Boolean, temperature: Double?): String {
        val out = StringBuilder("{")
        out.append("\"model\":").append(jsonString(AiFeatures.AI_MODEL))
        out.append(",\"messages\":[{\"role\":\"system\",\"content\":").append(jsonString(system))
        out.append("},{\"role\":\"user\",\"content\":").append(jsonString(user)).append("}]")
        if (temperature != null) out.append(",\"temperature\":").append(temperature.toString())
        if (stream) out.append(",\"stream\":true")
        out.append("}")
        return out.toString()
    }

    /** Escape a string as a JSON string literal (quotes, backslashes, newlines).
     *  Written with character codes (34 = quote, 92 = backslash) instead of
     *  quote/backslash char literals, so the JVM-free verifier's simple
     *  string/char stripper cannot misread this file. */
    private fun jsonString(value: String): String {
        val out = StringBuilder("\"")
        for (ch in value) {
            when (ch.code) {
                34 -> out.append("\\\"")
                92 -> out.append("\\\\")
                10 -> out.append("\\n")
                13 -> out.append("\\r")
                9 -> out.append("\\t")
                else -> out.append(ch)
            }
        }
        out.append(34.toChar())
        return out.toString()
    }

    companion object {
        /** UPDATE 23 — deterministic cloud-reply guard (the
         *  2026-11-27 16:02–16:04 IST bug: the cloud model fabricated
         *  "hata diya" and then denied a verified save). A cloud
         *  reply must NEVER claim a financial action happened: when
         *  the local engine produced no action, any such claim is a
         *  fabrication and the caller replaces the reply with
         *  [guardCloudReply]'s honest text. The patterns cover
         *  Hinglish + English claims of save / delete / correct /
         *  refund, and the contradiction ("save hi nahi ki thi",
         *  "pehle se tha") that denied a verified save. */
        private val financialClaimPatterns = listOf(
            Regex("hata\\s*diya", RegexOption.IGNORE_CASE),
            Regex("delete\\s*(kar\\s*)?diya", RegexOption.IGNORE_CASE),
            Regex("remove\\s*(kar\\s*)?diya", RegexOption.IGNORE_CASE),
            Regex("mita\\s*diya", RegexOption.IGNORE_CASE),
            Regex("delete\\s*ho\\s*gaya", RegexOption.IGNORE_CASE),
            Regex("save\\s*(kar\\s*)?diya", RegexOption.IGNORE_CASE),
            Regex("save\\s*ho\\s*gaya", RegexOption.IGNORE_CASE),
            Regex("refund\\s*(kar\\s*)?diya", RegexOption.IGNORE_CASE),
            Regex("sahi\\s*kar\\s*diya", RegexOption.IGNORE_CASE),
            Regex("correct\\s*kar\\s*diya", RegexOption.IGNORE_CASE),
            Regex("save\\s*hi\\s*nahi\\s*ki", RegexOption.IGNORE_CASE),
            Regex("save\\s*nahi\\s*ki\\s*thi", RegexOption.IGNORE_CASE),
            Regex("pehle\\s*se\\s*tha", RegexOption.IGNORE_CASE),
            Regex("pehle\\s*se\\s*hi", RegexOption.IGNORE_CASE),
            Regex("\\bsaved\\b", RegexOption.IGNORE_CASE),
            Regex("\\bdeleted\\b", RegexOption.IGNORE_CASE),
            Regex("\\brefunded\\b", RegexOption.IGNORE_CASE)
        )

        /** True when [text] claims a financial action happened
         *  (saved / deleted / corrected / refunded) or denies a
         *  verified save. Pure pattern match — no model involved. */
        fun containsFinancialActionClaim(text: String): Boolean =
            financialClaimPatterns.any { it.containsMatchIn(text) }

        /** The honest replacement for a cloud reply that claimed a
         *  financial action: states plainly that nothing was
         *  saved/deleted from chat, and grounds the last verified
         *  save ([lastSavedLabel]) instead of denying it. Returns
         *  null when the reply is clean (no claim) — the caller
         *  keeps it unchanged. */
        fun guardCloudReply(text: String, lastSavedLabel: String?): String? {
            if (!containsFinancialActionClaim(text)) return null
            val savedNote = if (lastSavedLabel != null) {
                " Aapki last verified saved entry ($lastSavedLabel) abhi bhi saved hai — maine use delete nahi kiya hai."
            } else {
                ""
            }
            return "Ruko — maine abhi chat se koi entry save ya delete nahi ki hai. " +
                "Jo entry confirm karke save ya delete hoti hai, wahi asal me hoti hai.$savedNote " +
                "Agar koi entry delete karni hai to batao — main pehle dikhaunga, phir tum confirm karoge."
        }

        /** UPDATE 25 (C-15) — true when a cloud reply is confidently
         *  in a DIFFERENT language than the conversation ([lang]).
         *  Only a confident detection (>= 0.8) counts: a mixed or
         *  low-signal reply is never flagged, so an ordinary Hinglish
         *  reply with a few English words stays. Pure language
         *  detection — no model involved. The caller then re-renders
         *  with the local reply (already in the user's language)
         *  instead of showing the wrong-language cloud text as-is. */
        fun isWrongLanguage(text: String, lang: AiLanguage): Boolean {
            val detected = Multilingual.detectLanguage(text)
            if (detected.confidence < 0.8) return false
            if (detected.language == AiLanguage.UNKNOWN) return false
            return detected.language != lang
        }

        /** UPDATE 19 service address (OpenAI-compatible chat
         *  completions). Bearer auth, OpenAI-style messages, reply in
         *  choices[0].message.content, SSE deltas in
         *  choices[0].delta.content. Code config only — never UI. */
        const val CHAT_COMPLETIONS_URL =
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    }
}
