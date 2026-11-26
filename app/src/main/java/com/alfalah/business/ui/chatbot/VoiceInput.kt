package com.alfalah.business.ui.chatbot

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Voice input for the AI Assistant (UPDATE 9 §12, UPDATE 11 §11).
 * Android SpeechRecognizer — Hindi/English/Hinglish speech-to-text.
 *
 * SAFETY RULES:
 *  - Recognised text goes into the message INPUT FIELD only. It is
 *    NEVER sent automatically and NEVER executes a financial action:
 *    the user reads it, corrects it if the recognition was wrong, and
 *    taps Send — then the normal preview + confirm flow applies.
 *  - Uncertain recognition (error / empty result) shows a friendly
 *    message and does nothing else. No financial action is ever taken
 *    from unconfirmed speech.
 *  - Live-device testing is PENDING (no device on this VM) — the code
 *    is implemented against the platform API and marked as such in the
 *    delivery notes; it must be click-tested in Android Studio.
 *  - Needs RECORD_AUDIO (declared in AndroidManifest.xml, requested at
 *    runtime from the chat screen before listening starts).
 */
class VoiceInputHelper(
    private val context: Context,
    private val onResult: (String) -> Unit,
    private val onError: (String) -> Unit,
    private val onListeningChanged: (Boolean) -> Unit
) {
    private var recognizer: SpeechRecognizer? = null

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(context)

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
            override fun onReadyForSpeech(params: Bundle?) = onListeningChanged(true)
            override fun onBeginningOfSpeech() = onListeningChanged(true)
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() = onListeningChanged(false)
            override fun onError(error: Int) {
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
                onListeningChanged(false)
                val heard = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()?.trim()
                if (heard.isNullOrBlank()) {
                    onError("Kuch sunai nahi diya — phir se boliye ya type karein.")
                } else {
                    onResult(heard)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(listener)
            startListening(intent)
        }
    }

    fun stopListening() {
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
