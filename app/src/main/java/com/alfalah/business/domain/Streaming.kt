package com.alfalah.business.domain

import java.text.BreakIterator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Real-time streaming + natural animated typing (UPDATE 17, 2026-11-27).
 *
 * Two SEPARATE things, kept separate on purpose — do not fake one as
 * the other:
 *
 *  (1) BACKEND STREAMING — [CloudAiClient.converseStreaming] reads a
 *      real server-sent-events response incrementally ([SseParser]).
 *      It only exists when the owner configured a cloud AI key /
 *      endpoint. When nothing is configured there is NO backend
 *      stream at all.
 *  (2) FRONTEND TYPING — [Typewriter] reveals text progressively at
 *      a controlled human-like pace (~11 words/sec) whether the text
 *      came from the backend stream or from the on-device engine.
 *      local engine: typewriter display over locally generated text, no network stream.
 *      That is labelled honestly here and in the ViewModel — it is a
 *      display animation, never a fake SSE stream.
 *
 * Everything in this file is pure JVM (no Android framework), so the
 * unit tests in ConversationTest.kt (StreamingTest) and the Python
 * mirror in docs/ai_assistant_mirror.py can verify the same logic.
 * Money is never involved here — this file only moves text.
 */

/** How fast the typewriter reveals text. 30 words ~2.7 s, 150 words ~13.6 s. */
const val DEFAULT_WORDS_PER_SECOND: Double = 11.0
const val MIN_WORDS_PER_SECOND: Double = 9.0
const val MAX_WORDS_PER_SECOND: Double = 13.0

/** Lifecycle of one generation, as the UI shows it. */
enum class GenerationState {
    IDLE, THINKING, STREAMING, STOPPED, COMPLETED, FAILED
}

/** Typed streaming failures — the UI never shows raw HTTP text. */
sealed class StreamingError(message: String) : Exception(message) {
    /** No cloud AI is configured (no key / endpoint). Not an error to
     *  show loudly — the caller falls back to the local engine. */
    class NoCloudConfigured :
        StreamingError("Cloud AI configured nahi hai — built-in jawab dikhaya ja raha hai.")

    /** The network failed (no internet, connection dropped). */
    class Network(cause: Throwable? = null) :
        StreamingError("Internet se connect nahi ho paya — phir se try karein.")

    /** The server answered with a non-OK status. The code is kept
     *  internal only; the user sees a plain friendly message. */
    class HttpStatus(val statusCode: Int) :
        StreamingError("AI service se jawab nahi mila — phir se try karein.")

    /** The stream ended in a form we cannot use (empty / malformed). */
    class InvalidResponse :
        StreamingError("AI se adhura jawab mila — phir se try karein.")

    /** The user stopped the generation. Not a failure. */
    class Cancelled : StreamingError("Generation rok di gayi.")
}

/**
 * Grapheme-safe chunking.
 *
 * Text is split into display units on WORD boundaries, where a word
 * is built from grapheme clusters (java.text.BreakIterator character
 * boundaries). A cluster is never split: a Devanagari vowel sign
 * (e.g. the ि in कैश / the ो in हो), a Gujarati vowel sign, a
 * combining mark, an emoji modifier or a ZWJ-joined emoji sequence
 * always stays with its base character. Joining the chunks always
 * reproduces the source text exactly — no loss, skip or duplication.
 */
object GraphemeChunker {

    /** The grapheme clusters of [text], in order. Never empty for
     *  non-empty input; empty input gives an empty list. */
    fun graphemeClusters(text: String): List<String> {
        if (text.isEmpty()) return emptyList()
        val iterator = BreakIterator.getCharacterInstance()
        iterator.setText(text)
        val clusters = ArrayList<String>()
        var start = iterator.first()
        var end = iterator.next()
        while (end != BreakIterator.DONE) {
            clusters.add(text.substring(start, end))
            start = end
            end = iterator.next()
        }
        return clusters
    }

    /**
     * Display chunks: each chunk is one word plus its trailing
     * whitespace (or the final word). Splitting only happens at a
     * whitespace cluster boundary, so a word — and every grapheme
     * inside it — is never cut in half. Newlines are kept as their
     * own chunk boundary (a chunk never spans a newline).
     */
    fun displayChunks(text: String): List<String> {
        if (text.isEmpty()) return emptyList()
        val chunks = ArrayList<String>()
        val current = StringBuilder()
        for (cluster in graphemeClusters(text)) {
            current.append(cluster)
            val isSpace = cluster.all { it.isWhitespace() }
            if (isSpace) {
                chunks.add(current.toString())
                current.clear()
            }
        }
        if (current.isNotEmpty()) chunks.add(current.toString())
        return chunks
    }

    /** True when joining [chunks] reproduces [source] exactly. */
    fun isLossless(chunks: List<String>, source: String): Boolean =
        chunks.joinToString("") == source

    /** Word count used for the typing-speed calculation. */
    fun wordCount(text: String): Int =
        text.trim().split(Regex("\\s+")).count { it.isNotEmpty() }

    /** Seconds a reply of [wordCount] words takes at [wordsPerSecond]. */
    fun durationSeconds(wordCount: Int, wordsPerSecond: Double = DEFAULT_WORDS_PER_SECOND): Double =
        if (wordCount <= 0 || wordsPerSecond <= 0.0) 0.0 else wordCount / wordsPerSecond
}

/** Pure, clock-free typewriter maths — the mirror tests these numbers. */
object TypewriterLogic {

    /** Cumulative display strings, one per display chunk. The last
     *  step always equals [source] exactly. */
    fun steps(source: String): List<String> {
        val chunks = GraphemeChunker.displayChunks(source)
        val out = ArrayList<String>(chunks.size)
        val current = StringBuilder()
        for (chunk in chunks) {
            current.append(chunk)
            out.add(current.toString())
        }
        return out
    }

    /** Measured words/sec for [wordCount] words shown in [elapsedMs]. */
    fun wordsPerSecond(wordCount: Int, elapsedMs: Long): Double =
        if (elapsedMs <= 0L) 0.0 else wordCount * 1000.0 / elapsedMs

    /** Delay between two display chunks at [wordsPerSecond].
     *  (No clamping here — tests drive the typewriter faster; the
     *  production default is [DEFAULT_WORDS_PER_SECOND], inside the
     *  natural 9–13 words/sec band checked by [isNaturalPace].) */
    fun delayPerWordMs(wordsPerSecond: Double = DEFAULT_WORDS_PER_SECOND): Long =
        if (wordsPerSecond <= 0.0) 100L else (1000.0 / wordsPerSecond).toLong()

    /** True when [wordsPerSecond] is inside the natural typing band. */
    fun isNaturalPace(wordsPerSecond: Double): Boolean =
        wordsPerSecond in MIN_WORDS_PER_SECOND..MAX_WORDS_PER_SECOND
}

/** Typewriter state, exposed to Compose through StateFlow. */
enum class TypewriterState { IDLE, TYPING, STOPPED, COMPLETED }

/**
 * The typewriter: takes a full text OR incremental chunks (fed while
 * it is already typing — the buffer just grows, nothing is lost or
 * repeated) and reveals it progressively through [displayText].
 *
 * Emissions are word-level (one StateFlow update per display chunk),
 * never one update per character, so Compose does not thrash. The
 * final displayed text always EQUALS the fed text exactly.
 *
 *  - [feed] appends text to the queue (safe while typing).
 *  - [markFinished] says no more text is coming; the loop then ends
 *    once the queue is empty.
 *  - [stop] keeps the displayed text and ends in STOPPED.
 *  - [flush] reveals everything still queued at once and completes.
 *  - [awaitCompletion] suspends until TYPING ends (completed or
 *    stopped) — the ViewModel uses it to know when to stamp the
 *    timestamp and persist the message.
 */
class Typewriter(
    private val wordsPerSecond: Double = DEFAULT_WORDS_PER_SECOND
) {
    private val _displayText = MutableStateFlow("")
    val displayText: StateFlow<String> = _displayText.asStateFlow()

    private val _state = MutableStateFlow(TypewriterState.IDLE)
    val state: StateFlow<TypewriterState> = _state.asStateFlow()

    private val pending = ArrayDeque<String>()
    private val displayed = StringBuilder()
    private var finished = false
    private var loopJob: Job? = null
    private val lock = Any()

    /** Full text fed so far (fed chunks joined) — equals [displayText]
     *  once the typewriter completes. */
    val fedText: String
        get() = synchronized(lock) {
            val queued = pending.joinToString("")
            displayed.toString() + queued
        }

    fun feed(text: String) {
        if (text.isEmpty()) return
        synchronized(lock) {
            pending.addAll(GraphemeChunker.displayChunks(text))
        }
        if (_state.value == TypewriterState.IDLE) _state.value = TypewriterState.TYPING
    }

    fun markFinished() {
        synchronized(lock) { finished = true }
    }

    /** Start the reveal loop in [scope]. Safe to call once per run. */
    fun start(scope: CoroutineScope): Job {
        _state.value = TypewriterState.TYPING
        val job = scope.launch {
            try {
                while (true) {
                    val chunk: String? = synchronized(lock) {
                        if (pending.isNotEmpty()) pending.removeFirst() else null
                    }
                    if (chunk != null) {
                        displayed.append(chunk)
                        _displayText.value = displayed.toString()
                        delay(TypewriterLogic.delayPerWordMs(wordsPerSecond))
                    } else if (synchronized(lock) { finished }) {
                        _state.value = TypewriterState.COMPLETED
                        return@launch
                    } else {
                        delay(20L)
                    }
                }
            } catch (_: CancellationException) {
                _state.value = TypewriterState.STOPPED
                throw it
            }
        }
        loopJob = job
        job.invokeOnCompletion {
            if (_state.value == TypewriterState.TYPING) _state.value = TypewriterState.STOPPED
        }
        return job
    }

    /** Stop: keep the displayed text, drop the queue, end STOPPED. */
    fun stop() {
        synchronized(lock) {
            pending.clear()
            finished = true
        }
        loopJob?.cancel()
        _state.value = TypewriterState.STOPPED
    }

    /** Reveal everything still queued immediately and complete. */
    fun flush() {
        synchronized(lock) {
            while (pending.isNotEmpty()) displayed.append(pending.removeFirst())
            finished = true
        }
        _displayText.value = displayed.toString()
        loopJob?.cancel()
        _state.value = TypewriterState.COMPLETED
    }

    suspend fun awaitCompletion() {
        loopJob?.join()
    }

    fun reset() {
        loopJob?.cancel()
        synchronized(lock) {
            pending.clear()
            displayed.clear()
            finished = false
        }
        _displayText.value = ""
        _state.value = TypewriterState.IDLE
    }

    /** The text shown right now (a prefix of [fedText], or all of it). */
    val currentText: String get() = _displayText.value
}

/** One parsed server-sent-event. */
sealed class SseEvent {
    /** A chunk of reply text carried in a `data:` line. */
    data class Text(val text: String) : SseEvent()

    /** The stream's `[DONE]` terminator — no more events follow. */
    object Done : SseEvent()

    /** Anything else (comments, `: ping`, empty lines) — ignored. */
    object Ignored : SseEvent()
}

/**
 * Incremental SSE parser.
 *
 * Feed it raw text as it arrives from the network ([feed]); it keeps
 * a partial line buffered until its newline arrives, so a line split
 * across two reads — including a multi-byte UTF-8 character split
 * across reads, which the UTF-8 reader reassembles before we ever
 * see it — is parsed exactly once. `data:` lines yield [SseEvent.Text]
 * (the JSON payload's first [textKey] value); `[DONE]` yields
 * [SseEvent.Done] and ends the stream; everything else is ignored.
 * Feeding after [Done] is a no-op.
 *
 * [textKey] is the payload key that carries reply text: "text" for
 * the original native payloads (used by the unit tests), "content"
 * for OpenAI-style chat-completions payloads — both the one-shot
 * message (choices[0].message.content) and the streaming deltas
 * (choices[0].delta.content, UPDATE 19). A delta with a null content
 * (e.g. the opening role-only chunk) is ignored, not treated as text.
 */
class SseParser(private val textKey: String = "text") {

    private val lineBuffer = StringBuilder()
    private var done = false

    val isDone: Boolean get() = done

    /** Feed newly arrived text; returns the events completed by it. */
    fun feed(chunk: String): List<SseEvent> {
        if (done || chunk.isEmpty()) return emptyList()
        lineBuffer.append(chunk)
        val events = ArrayList<SseEvent>()
        while (true) {
            val newline = lineBuffer.indexOf("\n")
            if (newline < 0) break
            var line = lineBuffer.substring(0, newline)
            lineBuffer.delete(0, newline + 1)
            if (line.endsWith("\r")) line = line.dropLast(1)
            events.add(parseLine(line))
            if (done) {
                lineBuffer.clear()
                break
            }
        }
        return events
    }

    private fun parseLine(line: String): SseEvent {
        if (line.isBlank()) return SseEvent.Ignored
        if (line.startsWith(":")) return SseEvent.Ignored
        if (!line.startsWith("data:")) return SseEvent.Ignored
        val data = line.removePrefix("data:").trim()
        if (data == "[DONE]") {
            done = true
            return SseEvent.Done
        }
        val text = extractFirstText(data) ?: return SseEvent.Ignored
        return if (text.isEmpty()) SseEvent.Ignored else SseEvent.Text(text)
    }

    /** The first [textKey] value in a JSON payload (default key). */
    fun extractFirstText(json: String): String? = extractFirstValue(json, textKey)

    /** The first "content" value — OpenAI-style message / delta. */
    fun extractFirstContent(json: String): String? = extractFirstValue(json, "content")

    /**
     * Pull the first [key] value out of a JSON payload, honouring
     * backslash escapes. A non-string value (e.g. "content": null in
     * an opening delta chunk) is skipped and the search continues.
     * Same hand-rolled parse as CloudAiClient (no JSON dependency).
     * Character codes (34 = quote, 92 = backslash) are used instead
     * of quote/backslash char literals, so the JVM-free verifier's
     * simple string/char stripper cannot misread this file.
     */
    fun extractFirstValue(json: String, key: String): String? {
        val keyText = "\"" + key + "\""
        var idx = json.indexOf(keyText)
        while (idx >= 0) {
            var i = idx + keyText.length
            while (i < json.length && (json[i] == ' ' || json[i] == ':')) i++
            if (i < json.length && json[i].code == 34) {
                val out = StringBuilder()
                var j = i + 1
                while (j < json.length) {
                    val ch = json[j]
                    if (ch.code == 92 && j + 1 < json.length) {
                        when (json[j + 1]) {
                            'n' -> out.append('\n')
                            'r' -> out.append('\r')
                            't' -> out.append('\t')
                            'u' -> {
                                val hex = json.substring(j + 2, (j + 6).coerceAtMost(json.length))
                                val code = hex.toIntOrNull(16)
                                if (code != null) out.append(code.toChar()) else out.append('u')
                                j += 6
                                continue
                            }
                            else -> out.append(json[j + 1])
                        }
                        j += 2
                    } else if (ch.code == 34) {
                        return out.toString()
                    } else {
                        out.append(ch)
                        j++
                    }
                }
                return null
            }
            idx = json.indexOf(keyText, idx + 1)
        }
        return null
    }
}
