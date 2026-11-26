package com.alfalah.business.ui.chatbot

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Voice input for the AI Assistant (UPDATE 9 §12, UPDATE 11 §11,
 * UPDATE 18 two-way voice).
 * Android SpeechRecognizer — free, no key, no account. The language
 * follows the chat language (BCP-47 tag from AiLanguage — all 22
 * languages + Hinglish/Roman forms).
 *
 * UPDATE 18 — this is now the INPUT half of a two-way conversation,
 * not just a dictation button:
 *  - Final results go to [onResultWithConfidence] (or [onResult]
 *    when no confidence callback is set) so the caller can route the
 *    transcript through the normal conversation pipeline
 *    (ChatbotViewModel.onVoiceTranscript) — the same pipeline as
 *    typed text, with the same preview -> confirm -> backend save.
 *    Partial results go to [onPartial] so the user sees what was
 *    heard so far in the input field while speaking; they are NEVER
 *    sent or acted on.
 *  - The confidence score (SpeechRecognizer.CONFIDENCE_SCORES, when
 *    the recogniser provides one) travels with the result: a
 *    low-confidence transcript is asked to be repeated instead of
 *    being guessed at (VoicePipeline.MIN_CONFIDENCE). -1f means the
 *    recogniser gave no score.
 *  - For continuous mode the caller simply calls startListening()
 *    again after a result / after speech ends; stopListening()
 *    destroys the recogniser each time, so no recogniser is ever
 *    left running silently.
 *
 * SAFETY RULES (unchanged):
 *  - Recognised text is NEVER executed on its own: it goes through
 *    the pipeline, a financial action still needs the preview +
 *    Confirm, and an uncertain transcription is never saved from.
 *  - Uncertain recognition (error / empty result) shows a friendly
 *    message and does nothing else.
 *  - Live-device testing is PENDING (no microphone on this VM) —
 *    the code is implemented against the platform API and marked as
 *    such in the delivery notes; it must be click-tested in Android
 *    Studio on a real device.
 *  - Needs RECORD_AUDIO (declared in AndroidManifest.xml, requested
 *    at runtime from the chat screen before listening starts).
 */
class VoiceInputHelper(
    private val context: Context,
    private val onResult: (String) -> Unit,
    private val onError: (String) -> Unit,
    private val onListeningChanged: (Boolean) -> Unit,
    /** Live partial transcript while speaking (shown, never sent). */
    private val onPartial: (String) -> Unit = {},
    /** Final transcript + STT confidence (-1f when none given). */
    private val onResultWithConfidence: ((String, Float) -> Unit)? = null
) {
    private var recognizer: SpeechRecognizer? = null
    private var listening = false

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

    /** True while the recogniser is actively listening. */
    fun isListening(): Boolean = listening

    fun startListening(languageTag: String = "hi-IN") {
        if (!isAvailable()) {
            onError("Is phone par voice input available nahi hai.")
            return
        }
        stopListening()
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // UPDATE 13: the recogniser language follows the language the
            // user is actually chatting in (detected per message, or the
            // manual AI-language preference in Settings) — Gujarati
            // speech gets gu-IN, Tamil gets ta-IN, and so on. The
            // recognised text still only fills the input field: it is
            // NEVER sent or executed automatically.
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        val listener = object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                listening = true
                onListeningChanged(true)
            }
            override fun onBeginningOfSpeech() {
                listening = true
                onListeningChanged(true)
            }
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            // Silence detected — the turn ends here; continuous mode
            // decides in the screen whether to listen again.
            override fun onEndOfSpeech() {
                listening = false
                onListeningChanged(false)
            }
            override fun onError(error: Int) {
                listening = false
                onListeningChanged(false)
                onError(
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                            "Aawaz saaf nahi aayi — phir se boliye."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                            "Voice ke liye internet chahiye — connection check karke phir se try karein."
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                            "Microphone ki permission chahiye — Settings se allow karein."
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY ->
                            "Voice input abhi busy hai — thodi der baad try karein."
                        else -> "Voice input nahi ho paya — type karke bhej sakte hain."
                    }
                )
            }

            override fun onResults(results: Bundle?) {
                listening = false
                onListeningChanged(false)
                val heard = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()?.trim()
                if (heard.isNullOrBlank()) {
                    onError("Kuch sunai nahi diya — phir se boliye ya type karein.")
                } else {
                    // STT confidence for this result, when provided
                    // (-1f = the recogniser gave no score; the voice
                    // pipeline treats that as "unknown", not "low").
                    val confidence = results
                        ?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                        ?.firstOrNull() ?: -1f
                    onResultWithConfidence?.invoke(heard, confidence) ?: onResult(heard)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                // Live preview only — partial text is never sent.
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()?.trim()
                if (!partial.isNullOrBlank()) onPartial(partial)
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(listener)
            startListening(intent)
        }
    }

    fun stopListening() {
        listening = false
        try {
            recognizer?.stopListening()
            recognizer?.destroy()
        } catch (_: Exception) {
            // Already stopped/destroyed — nothing to do.
        } finally {
            recognizer = null
            onListeningChanged(false)
        }
    }
}
