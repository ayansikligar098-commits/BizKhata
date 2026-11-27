package com.alfalah.business.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Real AI voice for the BizKhata AI Assistant (UPDATE 25, 2026-11-27).
 *
 * OWNER ORDER (2026-11-27 19:01 IST, exact words): "Phone Ki Awaz Mat
 * Do Proper Ai Ki Voice Chahiye Muje" — NO phone/device voice. The
 * device speech path (the phone's built-in speech) is GONE from this app:
 * VoiceOutput.kt no longer references it, and no code path in the
 * assistant ever speaks through it again. Spoken replies come from
 * the AI speech service ([AiVoiceClient]) and are played back as
 * audio (MediaPlayer). When the voice cannot speak — no key saved,
 * daily limit reached, network failure — the reply stays TEXT ONLY,
 * plus one honest line in the user's language. NEVER a silent fall
 * back to the device voice.
 *
 * THIS FILE IS PURE LOGIC (no Android APIs, no network) so every rule
 * here is unit-testable on the JVM (see Update25Test) and mirrored in
 * docs/ai_assistant_mirror.py. The network call lives in
 * [AiVoiceClient]; playback lives in VoiceSpeaker (MediaPlayer).
 *
 * QUOTA (the honest headline — the owner must hear this plainly):
 * the speech model has its OWN daily quota, separate from chat
 * (limits are per-model, per-project; the speech quota does NOT
 * consume the chat budget). The exact number for the owner's project
 * is not published by the provider anymore — the best available
 * community numbers are ~10 spoken replies/day — so this build is
 * CONSERVATIVE: [DAILY_LIMIT] = 10 spoken replies/day, reset at
 * midnight Pacific (the provider's reset rule). The counter is
 * VISIBLE (chat + Settings → Voice) and the limit is a HARD STOP:
 * at 10/10 the assistant stops speaking and says so honestly. No
 * retry spam, no second call spent on a long reply.
 *
 * RATIONING RULES (so 10 calls last the day):
 *  - Speak SHORT replies only: [shortenForVoice] keeps the first
 *    2 sentences / [SPOKEN_CAP_CHARS] characters; a long reply
 *    speaks a short summary line and the full text stays on screen.
 *  - Exactly ONE speech call per reply, never one per sentence.
 *  - Speech calls are serialised with a minimum gap
 *    ([MIN_GAP_MS] = 21 s, the 3-requests-per-minute ceiling): a
 *    second reply inside the gap WAITS (never 429s the user).
 *  - Roman Hinglish is NOT transliterated in this build: whether
 *    the speech model reads Roman Hindi naturally can only be judged
 *    by hearing it on the owner's phone (see the V1–V3 hearing
 *    tests in the UPDATE 25 report). The chat text on screen stays
 *    exactly as written either way.
 *
 * KEY: the same key the owner already entered (Settings → AI Chat,
 * SettingsStore key "ai_key") — no new key, no new setup for him.
 * The key is passed per call, never stored here, never logged, never
 * shown in the UI (UPDATE 12: no provider/model names anywhere in
 * the UI — the user only ever sees "AI voice" + plain voice names).
 */
object AiVoiceConfig {
    /** Spoken replies per day (conservative working assumption — see
     *  the header; the exact number for the owner's project can only
     *  be read from his own account's rate-limit page). */
    const val DAILY_LIMIT = 10

    /** Short replies only: first 2 sentences, at most this many
     *  characters. A long reply speaks a short summary, never the
     *  whole text, and never spends a second call. */
    const val SPOKEN_CAP_CHARS = 400

    /** Minimum gap between speech calls (3 requests/minute ceiling
     *  → one call per 20 s; 21 s leaves a safety margin). A reply
     *  inside the gap waits its turn instead of failing. */
    const val MIN_GAP_MS = 21_000L

    /** The speech endpoint (Interactions API — the chat endpoint is
     *  text-only and must NOT be used for audio). The key travels as
     *  an `x-goog-api-key` header (see AiVoiceClient), never in the
     *  URL and never in a log. */
    const val INTERACTIONS_URL =
        "https://generativelanguage.googleapis.com/v1beta/interactions"

    /** Prebuilt voices the owner can hear and pick (Settings →
     *  Voice). Names are plain voice names, never a provider or
     *  model name. [DEFAULT_VOICE] is the first pick until the
     *  owner hears them and chooses his own. */
    const val DEFAULT_VOICE = "Kore"
    val VOICES: List<String> = listOf("Kore", "Puck", "Charon", "Fenrir")

    /** Style sent with every speech request (a direction for how the
     *  reply is spoken, never part of the spoken text itself). */
    const val SPEECH_STYLE = "warm, friendly, speaking clearly and slowly, natural"

    /** Pacific time zone: the provider resets daily quotas at
     *  midnight Pacific, so the counter resets on the same day. */
    val PACIFIC_ZONE: ZoneId = ZoneId.of("America/Los_Angeles")
    private val PACIFIC_DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    /** The Pacific calendar day (yyyy-MM-dd) a timestamp falls on. */
    fun pacificDay(epochMs: Long): String =
        LocalDate.ofInstant(Instant.ofEpochMilli(epochMs), PACIFIC_ZONE).format(PACIFIC_DAY)

    /** True when the stored counter day is not today (Pacific) — the
     *  counter must reset to zero before the next spoken reply. */
    fun isNewDay(storedDay: String, nowMs: Long): Boolean =
        storedDay.isBlank() || storedDay != pacificDay(nowMs)

    /** Counter label, e.g. "AI awaz: 7/10". */
    fun quotaLabel(usedToday: Int): String = "AI awaz: $usedToday/$DAILY_LIMIT"
}

/** Outcome of one attempt to speak a reply with the AI voice. */
sealed class AiVoiceResult {
    /** Real speech audio: complete WAV (24 kHz, mono, 16-bit PCM),
     *  ready to hand to MediaPlayer. */
    data class Audio(val wavBytes: ByteArray) : AiVoiceResult()

    /** No key saved — the user must save the key in Settings → AI
     *  Chat first. Never speak, never fall back to the device. */
    object NoKey : AiVoiceResult()

    /** The daily limit is reached (or the service answered 429) —
     *  text only until tomorrow, plus the honest line. */
    object QuotaExhausted : AiVoiceResult()

    /** Network / service failure (not a quota hit) — the reply is
     *  already on screen as text, so nothing is lost. */
    object Failed : AiVoiceResult()
}

/**
 * Text prepared for the AI voice: the assistant's reply as TEXT stays
 * exactly as shown in chat; what is SPOKEN is a cleaned, SHORT
 * version — markdown, bullets, links and symbols are stripped so the
 * voice does not read formatting aloud, ₹ becomes "rupaye", and only
 * the first 2 sentences (at most [AiVoiceConfig.SPOKEN_CAP_CHARS]
 * characters) are spoken. A truncated reply ends with a spoken
 * pointer to the chat, so the user is never misled into thinking the
 * reply ended. Exactly ONE speech call is ever spent per reply.
 */
object AiVoiceText {
    fun shortenForVoice(text: String): String {
        var s = text
        s = s.replace(Regex("https?://\\S+"), " link ")
        s = s.replace("₹", " rupaye ")
        s = s.replace("✓", "")
        s = s.replace(Regex("[#*_`>]+"), " ")
        s = s.replace("•", ", ")
        s = s.replace(Regex("\\n\\s*[-•]\\s*"), ", ")
        s = s.replace(Regex("\\s+"), " ").trim()
        if (s.isBlank()) return ""
        // First 2 sentences only (a sentence ends on . ! ? — a decimal
        // point inside a number is not a sentence end, so require the
        // punctuation to be followed by a space or the end of text).
        val sentences = s.split(Regex("(?<=[.!?])\\s+"))
        val short = sentences.take(2).joinToString(" ").trim()
        val capped = if (short.length > AiVoiceConfig.SPOKEN_CAP_CHARS) {
            short.take(AiVoiceConfig.SPOKEN_CAP_CHARS).trimEnd()
        } else short
        val wasCut = capped.length < s.length
        return if (wasCut) {
            "$capped ... aage ka jawab aap chat mein padh sakte hain."
        } else capped
    }

    /** The honest line when today's AI voice is finished (in the
     *  user's language — never a silent stop, never the device
     *  voice as a substitute). */
    fun quotaFinishedLine(lang: AiLanguage): String = when (lang) {
        AiLanguage.ENGLISH ->
            "Aaj ki AI awaz khatm ho gayi hai — kal subah phir milegi. Tab tak jawab chat mein padh lo."
        AiLanguage.GUJARATI ->
            "Aaj ni AI awaz khatm thai gai chhe — kale savare phari malshe. Tya sudhi jawab chat ma vanchi lo."
        AiLanguage.HINDI ->
            "आज की AI आवाज़ खत्म हो गई है — कल सुबह फिर मिलेगी। तब तक जवाब chat में पढ़ लो।"
        else ->
            "Aaj ki AI awaz khatm ho gayi hai — kal subah phir milegi. Tab tak jawab chat mein padh lo."
    }

    /** The honest line when no key is saved (never the device voice
     *  as a substitute). */
    fun noKeyLine(lang: AiLanguage): String = when (lang) {
        AiLanguage.ENGLISH ->
            "AI awaz ke liye AI key chahiye — Settings → AI Chat mein key save karo, phir jawab bol kar sunaya jayega. Tab tak jawab chat mein padh lo."
        AiLanguage.GUJARATI ->
            "AI awaz mate AI key joie chhe — Settings → AI Chat ma key save karo, pachhi jawab boline sambhlavvama avshe. Tya sudhi jawab chat ma vanchi lo."
        AiLanguage.HINDI ->
            "AI आवाज़ के लिए AI key चाहिए — Settings → AI Chat में key save करो, फिर जवाब बोल कर सुनाया जाएगा। तब तक जवाब chat में पढ़ लो।"
        else ->
            "AI awaz ke liye AI key chahiye — Settings → AI Chat mein key save karo, phir jawab bol kar sunaya jayega. Tab tak jawab chat mein padh lo."
    }
}

/**
 * Interactions-API request/response (pure JSON string building and
 * extraction — no network here; [AiVoiceClient] does the call).
 * The request body follows the provider's documented speech shape:
 * model + user_input text with speech_metadata style + audio
 * response format + speech_config voice. The reply carries the audio
 * as base64 in `steps[].content[].data`; [extractAudioBase64] pulls
 * that one field out (a hand-rolled search, same style as the
 * existing SseParser — no new JSON dependency).
 */
object AiVoiceRequest {
    /** Build the Interactions-API request body for one short reply. */
    fun buildJson(text: String, voice: String): String {
        val out = StringBuilder("{")
        out.append("\"model\":").append(jsonString(AiFeatures.AI_MODEL_VOICE))
        out.append(",\"input\":[{\"type\":\"user_input\",\"content\":[{\"type\":\"text\",\"text\":")
        out.append(jsonString(text))
        out.append(",\"annotations\":[{\"type\":\"speech_metadata\",\"style\":")
        out.append(jsonString(AiVoiceConfig.SPEECH_STYLE))
        out.append("}]}]}")
        out.append(",\"response_format\":{\"type\":\"audio\"}")
        out.append(",\"generation_config\":{\"speech_config\":[{\"voice\":")
        out.append(jsonString(voice))
        out.append("}]}")
        out.append("}")
        return out.toString()
    }

    /** The base64 audio payload from an Interactions-API reply, or
     *  null when the reply carries no audio (error / empty). Looks
     *  for the first `"data":"<base64>"` field — the audio entry in
     *  steps[].content[]. The value is returned untouched; the
     *  caller decodes it (base64 → WAV bytes). */
    fun extractAudioBase64(json: String): String? {
        val key = "\"data\""
        var idx = json.indexOf(key)
        while (idx >= 0) {
            var i = idx + key.length
            while (i < json.length && (json[i] == ' ' || json[i] == ':')) i++
            if (i < json.length && json[i] == '"') {
                val end = json.indexOf('"', i + 1)
                if (end > i + 1) {
                    val value = json.substring(i + 1, end)
                    // Base64 audio is long; a short "data" value is
                    // some other field, not the clip — keep looking.
                    if (value.length > 100) return value
                }
            }
            idx = json.indexOf(key, idx + 1)
        }
        return null
    }

    /** Escape a string as a JSON string literal. Written with
     *  character codes (34 = quote, 92 = backslash) instead of
     *  quote/backslash char literals, so the JVM-free verifier's
     *  simple string/char stripper cannot misread this file — the
     *  same trick CloudAiClient.jsonString uses. */
    fun jsonString(value: String): String {
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
}
