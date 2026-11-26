package com.alfalah.business.domain

/**
 * AI features — Gemini API, FREE TIER ONLY (owner's decision, 2026-11-26:
 * "Esa Hoto Gemini Ki Api Use Kar Lena").
 *
 * Rules:
 *  - No paid plan, no paid API, no paid AI service — ever.
 *  - The Gemini API key is the OWNER's to provide later via secure setup
 *    if he wants AI switched on. NEVER invent, embed or ship a key.
 *    There is no sample key anywhere in this codebase.
 *  - AI is optional and future (v2 spec §AI): chatbot, sales insights,
 *    demand prediction, customer recommendations, voice commands.
 *  - Graceful fallback: when no key is set (or quota is used up) the app
 *    works fully without AI and tells the owner plainly that AI is off.
 *
 * Implementation plan (when the backend is built):
 *  - The key is stored server-side / in the secure credential store, never
 *    in the app binary and never in git.
 *  - All Gemini calls go through the backend (or a small repository layer),
 *    never directly from UI code, so the key never reaches the device.
 *  - Every AI answer is labelled as AI-generated and is never written into
 *    financial records automatically.
 *
 * IMPLEMENTED (2026-11-26) — the chatbot:
 *  - Home: purple floating chat button on the Dashboard + "Chatbot / AI
 *    Assistant" in the drawer, route Routes.CHATBOT.
 *  - [GeminiChatbotClient] implements [AiAssistant] (free tier only).
 *  - The built-in responder ([BuiltInChatbotResponder]) answers from the
 *    real Room ledgers with no key at all; Gemini only summarises those
 *    same facts when the owner added his key in Settings.
 *  - The Reports AI Insight stays in Reports as the reports-analysis
 *    entry point — the chatbot is the ask-anything entry point.
 */
object AiFeatures {
    /** AI is OFF until the owner adds his own free-tier Gemini key. */
    const val AI_ENABLED_BY_DEFAULT = false

    /** Free-tier model to use when AI is switched on. */
    const val GEMINI_FREE_MODEL = "gemini-2.0-flash"

    sealed interface AiResult {
        /** AI is not set up — show this, keep the app working. */
        data class NotAvailable(val reason: String) : AiResult
        data class Answer(val text: String) : AiResult
    }

    /** Minimal contract the future Gemini repository will implement. */
    interface AiAssistant {
        /** Ask the assistant a business question (sales insights, advice). */
        suspend fun ask(question: String, businessContext: String): AiResult
    }

    /** Fallback used until a key is provided — the app stays fully usable. */
    class OfflineFallback : AiAssistant {
        override suspend fun ask(question: String, businessContext: String): AiResult =
            AiResult.NotAvailable(
                "AI is off. Add your own free-tier Gemini API key in Settings " +
                "to switch on the assistant. The app works fully without it."
            )
    }
}
