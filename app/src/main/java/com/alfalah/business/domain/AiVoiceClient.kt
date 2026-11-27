package com.alfalah.business.domain

import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * AI voice client (UPDATE 25) — one short reply spoken with the real
 * AI voice, through the Interactions API.
 *
 * The key is the OWNER's own key, added by him in Settings under the
 * neutral label "AI key" — the same key text chat uses, read the same
 * way. It is stored only in the app-private DataStore, travels only
 * as an HTTP header to the speech service, and is never displayed,
 * never written into a chat message or a financial record, and never
 * shipped in code. There is no key anywhere in this codebase.
 *
 * No provider/model name appears in the UI or in any user-visible
 * string: the user only ever sees "AI voice" + plain voice names
 * (UPDATE 12). The model identifier lives in exactly ONE place,
 * [AiFeatures.AI_MODEL_VOICE] (code config, never UI).
 *
 * AUDIO: the service returns complete WAV (24 kHz, mono, 16-bit PCM)
 * as base64 in the reply — decoded here to bytes and handed to
 * VoiceSpeaker (MediaPlayer). No streaming in this build: the whole
 * short clip arrives before playback starts (a 1–2 sentence reply is
 * a few seconds of audio; latency is unmeasured — to be timed live
 * on the owner's phone).
 *
 * QUOTA + RATE: speech calls are serialised behind a [Mutex] with a
 * minimum gap of [AiVoiceConfig.MIN_GAP_MS] (the 3-requests-per-minute
 * ceiling) — a reply inside the gap WAITS instead of failing. A 429
 * from the service means the daily limit is hit: [AiVoiceResult.QuotaExhausted],
 * never a retry, never a device-voice fallback.
 *
 * No new dependency: plain [HttpURLConnection], manual JSON (same
 * style as CloudAiClient).
 */
class AiVoiceClient(private val apiKey: String) {

    /**
     * Speak one short reply (already shortened by
     * [AiVoiceText.shortenForVoice] — this function never shortens
     * and never spends a second call). Returns the WAV bytes, or a
     * typed failure ([AiVoiceResult.NoKey] / QuotaExhausted /
     * Failed). The key is never logged; the reply text is sent only
     * to the speech service, as the transcript to speak.
     */
    suspend fun speak(text: String, voice: String): AiVoiceResult {
        if (apiKey.isBlank()) return AiVoiceResult.NoKey
        if (text.isBlank()) return AiVoiceResult.Failed
        return try {
            withContext(Dispatchers.IO) {
                // Serialise + gap: at most one speech call in flight,
                // at least MIN_GAP_MS after the previous one started.
                callMutex.withLock {
                    val now = System.currentTimeMillis()
                    val wait = MIN_GAP_MS - (now - lastCallStartedMs)
                    if (wait > 0) {
                        // The lock is held while waiting so a second
                        // caller queues behind this one instead of
                        // racing it into the same gap.
                        delay(wait)
                    }
                    lastCallStartedMs = System.currentTimeMillis()
                }
                callOnce(text, voice)
            }
        } catch (_: Exception) {
            AiVoiceResult.Failed
        }
    }

    /** One HTTP round-trip (no retry — a 429 is a quota answer, and a
     *  network failure must not spend a second call on the same
     *  reply). Runs on Dispatchers.IO; callers are already there. */
    private fun callOnce(text: String, voice: String): AiVoiceResult {
        val body = AiVoiceRequest.buildJson(text, voice)
        val connection = (URL(AiVoiceConfig.INTERACTIONS_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 30_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("x-goog-api-key", apiKey)
        }
        try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }
            val code = connection.responseCode
            if (code == 429) return AiVoiceResult.QuotaExhausted
            if (code != HttpURLConnection.HTTP_OK) return AiVoiceResult.Failed
            val response = BufferedReader(InputStreamReader(connection.inputStream, Charsets.UTF_8))
                .use { it.readText() }
            val base64 = AiVoiceRequest.extractAudioBase64(response) ?: return AiVoiceResult.Failed
            val bytes = try {
                Base64.getDecoder().decode(base64)
            } catch (_: IllegalArgumentException) {
                return AiVoiceResult.Failed
            }
            if (bytes.isEmpty()) return AiVoiceResult.Failed
            return AiVoiceResult.Audio(bytes)
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        /** Serialises speech calls across client instances (one per
         *  reply) so the minimum gap is kept app-wide. */
        private val callMutex = Mutex()
        private var lastCallStartedMs: Long = 0L
    }
}
