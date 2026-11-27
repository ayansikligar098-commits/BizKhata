package com.alfalah.business.ui.chatbot

import android.content.Context
import android.media.MediaPlayer
import java.io.File

/**
 * Spoken replies for the BizKhata AI Assistant (UPDATE 18, rewritten
 * UPDATE 25).
 *
 * UPDATE 25 (owner order 2026-11-27 19:01 IST, exact words): "Phone
 * Ki Awaz Mat Do Proper Ai Ki Voice Chahiye Muje" — NO phone/device
 * voice. The old phone-voice path is GONE from this file
 * and from the whole app: nothing here initialises, configures or
 * calls it, and no code path can fall back to it. Spoken replies are
 * real AI-voice audio (WAV bytes from AiVoiceClient, fetched by the
 * ViewModel under the daily quota) played through [MediaPlayer].
 * No new dependency: MediaPlayer is platform API (ExoPlayer is not
 * a project dependency and none was added for this).
 *
 * This class only MOVES audio bytes to the speaker: it never talks
 * to any AI service, never sees a key, never decides what to speak
 * (the ViewModel shortens the reply, checks the key + the daily
 * counter, fetches the audio, and only then hands bytes here).
 * The reply text is already in chat, so a spoken reply is never the
 * only copy of an answer.
 *
 * Lifecycle: the chat screen creates one instance, calls shutdown()
 * when the screen leaves (DisposableEffect), and stop() on every
 * interruption (mic tap, Stop button, a new spoken instruction such
 * as "Bas, short mein batao"). Stop is immediate: the player stops
 * and resets, and nothing queued plays after it. No audio is
 * recorded or stored here beyond the single short clip file in the
 * app-private cache, overwritten by the next reply.
 */
class VoiceSpeaker(
    context: Context,
    private val onSpeechStarted: () -> Unit = {},
    private val onSpeechEnded: () -> Unit = {},
    private val onSpeechError: (String) -> Unit = {}
) {
    private val appContext = context.applicationContext
    private var player: MediaPlayer? = null

    /** Play one AI-voice clip (complete WAV bytes, 24 kHz mono
     *  16-bit PCM). Any clip already playing is stopped first — a new
     *  reply never queues behind an old one. Returns false when
     *  there is nothing to play or playback fails; the caller then
     *  relies on the text already shown in chat. */
    fun playAudio(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) return false
        return try {
            stop()
            val file = File(appContext.cacheDir, "ai-voice-reply.wav")
            file.writeBytes(bytes)
            val mp = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                setOnCompletionListener {
                    try {
                        reset()
                    } catch (_: Exception) {
                        // Already released — nothing to do.
                    }
                    onSpeechEnded()
                }
                setOnErrorListener { _, _, _ ->
                    onSpeechError("Bol kar sunana nahi ho paya — jawab chat mein padh sakte hain.")
                    true
                }
                prepare()
            }
            player = mp
            mp.start()
            onSpeechStarted()
            true
        } catch (_: Exception) {
            try {
                player?.release()
            } catch (_: Exception) {
                // Already released — nothing to do.
            }
            player = null
            onSpeechError("Bol kar sunana nahi ho paya — jawab chat mein padh sakte hain.")
            false
        }
    }

    /** Stop speaking immediately (interruption). Safe to call when
     *  nothing is playing. */
    fun stop() {
        try {
            val mp = player ?: return
            if (mp.isPlaying) mp.stop()
            mp.reset()
        } catch (_: Exception) {
            // Already stopped — nothing to do.
        }
    }

    fun isSpeaking(): Boolean = try {
        player?.isPlaying == true
    } catch (_: Exception) {
        false
    }

    /** Release the player (call when the chat screen leaves). */
    fun shutdown() {
        try {
            player?.stop()
        } catch (_: Exception) {
            // Already stopped — nothing to do.
        }
        try {
            player?.release()
        } catch (_: Exception) {
            // Already released — nothing to do.
        } finally {
            player = null
        }
    }
}

/**
 * Tiny one-shot player for the voice picker in Settings → Voice
 * (UPDATE 25): the owner taps "Suno" next to a voice, the ViewModel
 * fetches a short test clip for that voice (one daily voice reply),
 * and this plays it. Kept separate from [VoiceSpeaker] so Settings
 * never has to own the chat speaker's lifecycle. Same rules: real
 * AI-voice audio only, never the device voice.
 */
class VoiceTestPlayer(context: Context) {
    private val appContext = context.applicationContext
    private var player: MediaPlayer? = null
    var isPlaying: Boolean = false
        private set

    fun play(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) return false
        return try {
            stop()
            val file = File(appContext.cacheDir, "ai-voice-test.wav")
            file.writeBytes(bytes)
            val mp = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                setOnCompletionListener {
                    isPlaying = false
                    try {
                        reset()
                    } catch (_: Exception) {
                        // Already released — nothing to do.
                    }
                }
                setOnErrorListener { _, _, _ ->
                    isPlaying = false
                    true
                }
                prepare()
            }
            player = mp
            mp.start()
            isPlaying = true
            true
        } catch (_: Exception) {
            isPlaying = false
            try {
                player?.release()
            } catch (_: Exception) {
                // Already released — nothing to do.
            }
            player = null
            false
        }
    }

    fun stop() {
        try {
            val mp = player ?: return
            if (mp.isPlaying) mp.stop()
            mp.reset()
        } catch (_: Exception) {
            // Already stopped — nothing to do.
        } finally {
            isPlaying = false
        }
    }

    fun release() {
        try {
            player?.stop()
        } catch (_: Exception) {
            // Already stopped — nothing to do.
        }
        try {
            player?.release()
        } catch (_: Exception) {
            // Already released — nothing to do.
        } finally {
            player = null
            isPlaying = false
        }
    }
}
