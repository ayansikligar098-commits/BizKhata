package com.alfalah.business.domain

/**
 * AI features — BizKhata AI Assistant (owner order 2026-11-26 22:16 IST:
 * REMOVE ALL third-party AI provider references from the app).
 *
 * Branding the user ever sees is ONLY "BizKhata AI Assistant" /
 * "Your Intelligent Business Assistant" and "AI Business Insights".
 * No provider name, no API key, no provider error text appears anywhere
 * in the UI. The assistant's real work — understanding Hinglish, the
 * knowledge engine, structured actions, confirmation, audit — is all
 * built-in and works with no key, no internet and no cloud provider.
 *
 * Provider independence (UPDATE 12): the cloud call lives behind
 * [CloudAiClient] under a provider-neutral name; its configuration is
 * the owner's own key (Settings, labelled "AI key"), stored only in the
 * app-private DataStore. The key value is never displayed and no
 * provider name, error code or integration detail ever reaches the UI.
 * If the cloud is unavailable the assistant says so in plain words and
 * answers from the built-in assistant instead. AI functionality is
 * PRESERVED — nothing was removed except provider-specific wording.
 *
 * (UPDATE 12, 2026-11-26 22:16 IST: the owner approved the underlying
 * cloud provider, but its name must NEVER appear in the UI.)
 */
object AiFeatures {
    /** Cloud AI summary is off by default; the built-in assistant is always on. */
    const val AI_ENABLED_BY_DEFAULT = false

    /** Cloud model identifier (provider configuration — never shown in the UI).
     *
     *  UPDATE 19 (2026-11-27) — model evaluation, verified against the
     *  provider's own models + OpenAI-compatibility docs that day:
     *  the previous 2.0-flash value is SHUT DOWN (models page lists it
     *  as shut down, June 1 2026) — calls to it fail, so it must never
     *  come back; 2.5-flash is deprecated and routes to 3.5-flash-lite
     *  from Dec 1 2026; 3.5-flash-lite is the Stable Flash for agentic
     *  work on the no-cost tier (fast, high-throughput everyday model,
     *  no shutdown announced). 4-hydrogen (the docs' example model) is a newer
     *  frontier reasoning model — higher latency for short chat
     *  replies, so it was NOT picked for chat. This constant is the
     *  single source of truth for Android AND the website (its
     *  UPSTREAM_MODEL / DEFAULT_MODEL constants must carry the same
     *  value). A live call with this value is still unverified — no
     *  key exists on this VM; the owner tests it on his phone. */
    const val AI_MODEL = "gemini-3.5-flash-lite"

    sealed interface AiResult {
        /** Cloud AI is not set up — show this, keep the app working. */
        data class NotAvailable(val reason: String) : AiResult
        data class Answer(val text: String) : AiResult
    }

    /** Minimal contract a future backend-hosted AI service will implement.
     *  The provider is chosen server-side; the app never knows its name. */
    interface AiAssistant {
        /** Ask the assistant a business question (insights, advice). */
        suspend fun ask(question: String, businessContext: String): AiResult
    }

    /** Fallback used until a backend AI service is configured — the app
     *  stays fully usable on its built-in assistant. */
    class OfflineFallback : AiAssistant {
        override suspend fun ask(question: String, businessContext: String): AiResult =
            AiResult.NotAvailable(
                "AI summary abhi band hai. BizKhata AI aapke real record se built-in jawab deta hai."
            )
    }
}
