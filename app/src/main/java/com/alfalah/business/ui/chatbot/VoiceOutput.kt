package com.alfalah.business.ui.chatbot

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * Spoken replies for the BizKhata AI Assistant (UPDATE 18).
 * Native android.speech.tts.TextToSpeech — free, no key, no account.
 * The voice is the phone's own speech service: the language is set
 * from the reply language (AiLanguage.bcp47 — all 22 languages +
 * Hinglish/Roman forms), and where the device offers an Indian voice
 * for that language it is preferred. Speech rate / pitch come from
 * the Voice settings in Settings (persisted in SettingsStore).
 *
 * This is the OUTPUT half of voice only. The intelligence behind
 * what is spoken is the same conversational client as text chat
 * (CloudAiClient.converse() via ChatbotViewModel, cloud when the
 * owner added his AI key, local engine otherwise) — this
 * class never talks to any AI service and never sees a key.
 *
 * Lifecycle: the chat screen creates one instance, calls shutdown()
 * when the screen leaves (DisposableEffect), and stop() on every
 * interruption (mic tap, Stop button, a new spoken instruction such
 * as "Bas, short mein batao"). No audio is recorded or stored here.
 */
class VoiceSpeaker(
    context: Context,
    private val onSpeechStarted: () -> Unit = {},
    private val onSpeechEnded: () -> Unit = {},
    private val onSpeechError: (String) -> Unit = {}
) {
    private var tts: TextToSpeech? = null
    private var ready = false
    private var languageTag = "hi-IN"
    private var utteranceCounter = 0L

    /** Speech rate 0.5–2.0 (1.0 = normal). Applied live. */
    var speechRate: Float = 1.0f
        set(value) {
            field = value.coerceIn(0.5f, 2.0f)
            tts?.setSpeechRate(field)
        }

    /** Pitch 0.5–2.0 (1.0 = device default). Applied live. */
    var speechPitch: Float = 1.0f
        set(value) {
            field = value.coerceIn(0.5f, 2.0f)
            tts?.setPitch(field)
        }

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            ready = status == TextToSpeech.SUCCESS
            if (ready) {
                applyLanguage()
                tts?.setSpeechRate(speechRate)
                tts?.setPitch(speechPitch)
            }
        }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = onSpeechStarted()
            override fun onDone(utteranceId: String?) = onSpeechEnded()
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) =
                onSpeechError("Bol kar sunana nahi ho paya — jawab chat mein padh sakte hain.")

            override fun onError(utteranceId: String?, errorCode: Int) =
                onSpeechError("Bol kar sunana nahi ho paya — jawab chat mein padh sakte hain.")
        })
    }

    /** Reply language, as a BCP-47 tag (e.g. "gu-IN", "hi-IN", "en-IN").
     *  Falls back to "hi-IN" when the device has no voice data for
     *  the requested language — the text reply is still shown in
     *  chat, so nothing is lost. */
    fun setLanguage(tag: String) {
        languageTag = tag.ifBlank { "hi-IN" }
        if (ready) applyLanguage()
    }

    private fun applyLanguage() {
        val engine = tts ?: return
        val locale = Locale.forLanguageTag(languageTag)
        val result = try {
            engine.setLanguage(locale)
        } catch (_: Exception) {
            TextToSpeech.LANG_NOT_SUPPORTED
        }
        if (result == TextToSpeech.LANG_MISSING_DATA ||
            result == TextToSpeech.LANG_NOT_SUPPORTED
        ) {
            // Fall back to Hindi (India) voice data, which most
            // Indian devices ship; the chat text stays in the reply
            // language either way.
            try {
                engine.setLanguage(Locale.forLanguageTag("hi-IN"))
            } catch (_: Exception) {
                // No usable voice at all — speak() will report it.
            }
            return
        }
        // Prefer an Indian voice for this language where the device
        // offers one (e.g. an en-IN / hi-IN / gu-IN voice); keep the
        // default otherwise. Never crashes on devices with no voices.
        try {
            val indianVoice = engine.voices?.firstOrNull { voice ->
                voice.locale.language == locale.language &&
                    voice.locale.country.equals("IN", ignoreCase = true)
            }
            if (indianVoice != null) engine.voice = indianVoice
        } catch (_: Exception) {
            // Voice listing failed — the language setting above stands.
        }
    }

    /** Speak [text] aloud (previous speech is stopped first — a new
     *  reply never queues behind an old one). Returns false when
     *  there is nothing to speak or the engine is not ready; the
     *  caller then relies on the text already shown in chat. */
    fun speak(text: String): Boolean {
        if (text.isBlank()) return false
        val engine = tts ?: return false
        if (!ready) return false
        utteranceCounter += 1
        val utteranceId = "bizkhata-voice-$utteranceCounter"
        return try {
            engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId) ==
                TextToSpeech.SUCCESS
        } catch (_: Exception) {
            false
        }
    }

    /** Stop speaking immediately (interruption). Safe to call when
     *  nothing is playing. */
    fun stop() {
        try {
            tts?.stop()
        } catch (_: Exception) {
            // Already stopped — nothing to do.
        }
    }

    fun isSpeaking(): Boolean = try {
        tts?.isSpeaking == true
    } catch (_: Exception) {
        false
    }

    /** Release the engine (call when the chat screen leaves). */
    fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Exception) {
            // Already shut down — nothing to do.
        } finally {
            tts = null
            ready = false
        }
    }
}
