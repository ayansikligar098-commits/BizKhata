/**
 * BizKhata AI streaming + typewriter — UPDATE 17.
 *
 * STREAMING ARCHITECTURE (honest split — read this before changing it):
 *
 * There are TWO different things here, and they must never be confused:
 *
 *   1. BACKEND STREAMING (genuine SSE): when the owner has configured an
 *      AI service in Settings (endpoint + key), the chat UI calls the
 *      Cloudflare Pages Function at /api/ai-chat (functions/api/ai-chat.ts),
 *      which forwards the request to the owner's own configured endpoint
 *      asking for a streaming response and relays the SSE stream back.
 *      `consumeSSE` below parses that stream. The key + endpoint come
 *      from the owner's own Settings and are never stored server-side.
 *
 *   2. TYPEWRITER DISPLAY (local engine): when NO service is configured,
 *      there is NO backend stream at all. The on-device engine
 *      (general.ts / intent.ts / conversation.ts) generates the whole
 *      reply locally, and the `Typewriter` below reveals it progressively
 *      at a natural human-like pace (~11 words/sec). This is a display
 *      animation over locally generated text — it is NOT backend
 *      streaming, and the UI must never label it as such.
 *
 * Both paths share the same display machinery (thinking indicator,
 * blinking cursor, Stop / Regenerate / Copy / Retry) so the experience
 * is identical — but only path (1) is a real stream.
 *
 * UNICODE SAFETY: text is always split on grapheme-cluster boundaries
 * (Intl.Segmenter, granularity 'grapheme', with an Array.from fallback),
 * so a Devanagari/Gujarati vowel sign, a combining mark, an emoji or a
 * ZWJ sequence is never split from its base character, mid-stream or
 * in the typewriter. Words are never shown half-typed: a chunk is a
 * whole word (plus its trailing space), and a partial word at the end
 * of an incoming stream is held back until it completes or the stream
 * ends. The final displayed text always equals the source text exactly.
 */

/* ================= Chunking (grapheme-safe, word-boundary) ================= */

/** Split text into grapheme clusters (never splits a code point, a
 *  combining mark, an emoji/ZWJ sequence, or an Indic grapheme). */
type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity: string },
) => { segment: (text: string) => Iterable<{ segment: string }> };

export function graphemes(text: string): string[] {
  // Typed through a narrow local interface: the test-suite tsc run
  // targets es2020, whose lib has no Intl.Segmenter type (runtime
  // feature-detects it all the same; behaviour unchanged).
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (typeof Intl !== 'undefined' && Segmenter) {
    try {
      const seg = new Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(seg.segment(text), (s) => s.segment);
    } catch { /* fall through to the code-point fallback */ }
  }
  return Array.from(text);
}

/** A chunk must end at a word boundary: whole words plus trailing
 *  whitespace. A single very long token (URL, long word) is broken
 *  into grapheme-safe pieces of at most MAX_GRAPHEMES so progress
 *  never stalls waiting for whitespace. */
const MAX_GRAPHEMES_PER_CHUNK = 24;

/**
 * Split text into display chunks. Joining the chunks reproduces the
 * input exactly (splitIntoChunks(t).join('') === t), no chunk starts
 * with a combining mark, and no chunk ends in the middle of a word
 * (unless the word itself was longer than MAX_GRAPHEMES_PER_CHUNK).
 */
export function splitIntoChunks(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const gs = graphemes(text);
  let cur = '';
  const flush = () => {
    if (!cur) return;
    // Break an over-long token into grapheme-safe pieces.
    const parts = graphemes(cur);
    if (parts.length > MAX_GRAPHEMES_PER_CHUNK) {
      for (let i = 0; i < parts.length; i += MAX_GRAPHEMES_PER_CHUNK) {
        out.push(parts.slice(i, i + MAX_GRAPHEMES_PER_CHUNK).join(''));
      }
    } else {
      out.push(cur);
    }
    cur = '';
  };
  for (const g of gs) {
    cur += g;
    // Whitespace ends a chunk (the space stays with the word before it,
    // so the next chunk never starts with a space or a combining mark).
    if (/^\s$/.test(g)) flush();
  }
  flush();
  return out;
}

/** True when the string starts with a combining mark (would mean a
 *  grapheme cluster was split). Used by tests; never true for chunks
 *  produced by splitIntoChunks. */
export function startsWithCombiningMark(s: string): boolean {
  return s.length > 0 && /\p{M}/u.test(s[0]);
}

/* ================= Typewriter (controlled progressive display) ================= */

export interface TypewriterOptions {
  /** Words per second (default 11 → ~91 ms per word: a 30-word reply
   *  takes ~2.7 s, a 150-word reply ~13.6 s). */
  wordsPerSec?: number;
  /** Called with the full displayed text after every step. */
  onUpdate: (displayed: string) => void;
  /** Called once when every received character has been displayed. */
  onDone?: (displayed: string) => void;
  /** Called when stop() keeps the text shown so far. */
  onStop?: (displayed: string) => void;
}

/**
 * Progressive display over a full text OR an incremental string
 * source (streaming). Append new text at any time — it is buffered
 * and typed in order; nothing is lost, skipped or duplicated.
 *
 * Invariant: after end() + drain (or flush()), displayed === the
 * concatenation of everything appended, exactly.
 */
export class Typewriter {
  private readonly wordsPerSec: number;
  private readonly onUpdate: (displayed: string) => void;
  private readonly onDone?: (displayed: string) => void;
  private readonly onStop?: (displayed: string) => void;
  /** Complete chunks ready to display, in order. */
  private queue: string[] = [];
  /** A trailing partial word held back until it completes (words are
   *  never shown half-typed) — merged with the next append. */
  private tail = '';
  private displayed = '';
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = false;
  private stopped = false;
  private doneFired = false;

  constructor(opts: TypewriterOptions) {
    this.wordsPerSec = opts.wordsPerSec && opts.wordsPerSec > 0 ? opts.wordsPerSec : 11;
    this.onUpdate = opts.onUpdate;
    this.onDone = opts.onDone;
    this.onStop = opts.onStop;
  }

  /** Text displayed so far. */
  get displayedText(): string {
    return this.displayed;
  }
  /** True once the full source has been displayed (or flush() ran). */
  get isDone(): boolean {
    return this.doneFired;
  }
  /** True after stop(). */
  get isStopped(): boolean {
    return this.stopped;
  }

  /** Feed more text (e.g. the next SSE chunk). Safe while typing.
   *  Only the new text is chunked (the held-back tail is merged in),
   *  so long streams stay O(n) instead of re-splitting everything. */
  append(text: string): void {
    if (!text || this.stopped || this.doneFired) return;
    const chunks = splitIntoChunks(this.tail + text);
    this.tail = '';
    if (chunks.length === 0) return;
    const last = chunks[chunks.length - 1];
    if (!this.ended && !/\s$/.test(last)) {
      // Last chunk may still be a partial word — hold it back.
      this.tail = last;
      this.queue.push(...chunks.slice(0, -1));
    } else {
      this.queue.push(...chunks);
    }
    this.ensureTicking();
  }

  /** Convenience: feed a complete reply at once and mark it ended
   *  (local-engine path: the whole text exists, display is paced). */
  setSource(text: string): void {
    this.append(text);
    this.end();
  }

  /** No more text will arrive: drain the buffer, then fire onDone. */
  end(): void {
    if (this.stopped || this.doneFired) return;
    this.ended = true;
    if (this.tail) {
      this.queue.push(this.tail);
      this.tail = '';
    }
    if (this.queue.length === 0) {
      this.finish();
      return;
    }
    this.ensureTicking();
  }

  start(): void {
    if (!this.stopped && !this.doneFired) this.ensureTicking();
  }

  pause(): void {
    this.clearTimer();
  }

  resume(): void {
    if (!this.stopped && !this.doneFired && (this.queue.length > 0 || this.tail || !this.ended)) this.ensureTicking();
  }

  /** Stop now: keep exactly what is displayed, fire onStop (not onDone). */
  stop(): void {
    if (this.stopped || this.doneFired) return;
    this.clearTimer();
    this.stopped = true;
    this.onStop?.(this.displayed);
  }

  /** Show everything immediately and finish (no animation). */
  flush(): void {
    if (this.stopped || this.doneFired) return;
    this.clearTimer();
    const rest = this.queue.join('') + this.tail;
    this.queue = [];
    this.tail = '';
    if (rest) {
      this.displayed += rest;
      this.onUpdate(this.displayed);
    }
    this.finish();
  }

  private ensureTicking(): void {
    if (this.timer !== null || this.stopped || this.doneFired) return;
    const intervalMs = 1000 / this.wordsPerSec;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One step: display the next ready chunk (one word per tick at the
   *  configured pace). A held-back partial word is never displayed. */
  private tick(): void {
    if (this.stopped || this.doneFired) {
      this.clearTimer();
      return;
    }
    const chunk = this.queue.shift();
    if (chunk === undefined) {
      if (this.ended) this.finish();
      return;
    }
    this.displayed += chunk;
    this.onUpdate(this.displayed);
    if (this.queue.length === 0 && this.ended) this.finish();
  }

  private finish(): void {
    this.clearTimer();
    if (this.doneFired) return;
    this.doneFired = true;
    this.onDone?.(this.displayed);
  }
}

/* ================= SSE consumer (genuine backend streaming) ================= */

/** Typed streaming failure — the message is always a short, plain,
 *  non-technical sentence (never raw HTTP text, never a status code,
 *  never a provider name). `aborted` is true when the user (or the
 *  UI) cancelled the stream. */
export class StreamError extends Error {
  readonly aborted: boolean;
  constructor(message: string, aborted = false) {
    super(message);
    this.name = 'StreamError';
    this.aborted = aborted;
  }
}

export const STREAM_UNREACHABLE_MSG =
  'AI service se jawab nahi mila. Apna connection aur AI Chat settings check karke dobara try karo.';

/**
 * Extract displayable text from one parsed SSE `data:` payload.
 * Handles the shapes a generic chat endpoint may send (delta /
 * message / reply / text / content); returns null for an empty or
 * unrecognised payload. Throws StreamError for an error payload.
 */
export function extractStreamText(data: unknown): string | null {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const err = o.error;
  if (typeof err === 'string' && err) throw new StreamError(STREAM_UNREACHABLE_MSG);
  if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === 'string' && m) throw new StreamError(STREAM_UNREACHABLE_MSG);
    throw new StreamError(STREAM_UNREACHABLE_MSG);
  }
  const choices = o.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const c = choices[0] as Record<string, unknown>;
    const delta = c.delta as Record<string, unknown> | undefined;
    if (delta && typeof delta.content === 'string') return delta.content;
    const msg = c.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === 'string') return msg.content;
    if (typeof c.text === 'string') return c.text;
  }
  if (typeof o.reply === 'string') return o.reply;
  if (typeof o.text === 'string') return o.text;
  if (typeof o.content === 'string') return o.content;
  return null;
}

/**
 * Consume a streaming fetch Response as Server-Sent Events.
 * - Parses `data:` lines; a `[DONE]` line ends the stream cleanly.
 * - Handles lines split across network chunks AND multi-byte UTF-8
 *   characters split across chunks (TextDecoder in streaming mode).
 * - An SSE error payload becomes a StreamError with a clean message.
 * - Aborts promptly when `signal` aborts (StreamError, aborted=true).
 * - Network / non-OK responses become StreamError (never raw HTTP text).
 * Resolves when the stream ends normally ([DONE] or body closed).
 */
export async function consumeSSE(
  response: Response,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.ok) throw new StreamError(STREAM_UNREACHABLE_MSG);
  if (!response.body) throw new StreamError(STREAM_UNREACHABLE_MSG);
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try {
      void reader.cancel();
    } catch { /* ignore */ }
  };
  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }
  try {
    for (;;) {
      if (aborted || signal?.aborted) throw new StreamError(STREAM_UNREACHABLE_MSG, true);
      let read;
      try {
        read = await reader.read();
      } catch {
        if (aborted || signal?.aborted) throw new StreamError(STREAM_UNREACHABLE_MSG, true);
        throw new StreamError(STREAM_UNREACHABLE_MSG);
      }
      if (read.done) {
        // Note: reader.cancel() (from the abort handler) resolves a
        // pending read with done:true instead of rejecting it, so an
        // abort that lands mid-read surfaces HERE, not in the catch.
        if (aborted || signal?.aborted) throw new StreamError(STREAM_UNREACHABLE_MSG, true);
        break;
      }
      buffer += decoder.decode(read.value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') return;
          if (!payload) {
            nl = buffer.indexOf('\n');
            continue;
          }
          let text: string | null = null;
          try {
            text = extractStreamText(JSON.parse(payload) as unknown);
          } catch (e) {
            if (e instanceof StreamError) throw e;
            // Not JSON: treat the raw line as plain streamed text.
            text = payload;
          }
          if (text) onChunk(text);
        }
        nl = buffer.indexOf('\n');
      }
    }
    // Flush any decoder remainder, then a final partial line (a stream
    // that closes without a trailing newline still yields its text).
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        let text: string | null = null;
        try {
          text = extractStreamText(JSON.parse(payload) as unknown);
        } catch (e) {
          if (e instanceof StreamError) throw e;
          text = payload;
        }
        if (text) onChunk(text);
      }
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch { /* ignore */ }
  }
}
