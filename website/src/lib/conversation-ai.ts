/**
 * BizKhata conversational-AI client — UPDATE 15.
 *
 * Provider-neutral: the assistant can call a conversational-AI
 * service the OWNER configures in Settings. No provider name, model
 * name or key text ever appears in the UI, in strings, in errors or
 * in logs. The configuration is generic — an endpoint + a key — and
 * the key is stored ONLY in the browser's local storage under a
 * dedicated key, never in the business profile, never in backups or
 * exports, never sent anywhere except to the configured endpoint.
 *
 * Static-export reality: this website has no backend server, so the
 * call goes directly from the owner's device to the endpoint they
 * configured. If no service is configured, the assistant says so
 * honestly in plain language (conversation.ts) and the local engine
 * (general.ts / intent.ts) handles only what it can genuinely handle.
 * A local template fallback is NEVER the main conversation engine.
 *
 * UPDATE 17 — streaming: when a service IS configured, the chat UI
 * calls the Cloudflare Pages Function at /api/ai-chat (see
 * functions/api/ai-chat.ts) through callConversationAIStream() below,
 * and the reply arrives as a real SSE stream (parsed by
 * lib/streaming.ts). If the Function is not deployed (local static
 * server), the client falls back to a direct streaming call to the
 * configured endpoint, and finally to the non-streaming call.
 *
 * KEY MIGRATION (UPDATE 17): the pre-UPDATE-12 Settings card stored
 * the owner's key on the business profile inside the persisted app
 * state (localStorage key bizkhata.v1), under a legacy profile field.
 * The rebuild replaced that field with the generic key above, so a key
 * the owner entered early on would otherwise be orphaned. On first
 * read, getAiServiceKey() copies that legacy value opaquely into the
 * new key slot (never logged, never displayed, never sent anywhere
 * except the configured endpoint as before) and leaves the original
 * in place for rollback. The migration runs once (marker below), so
 * deliberately removing the new key is respected. NOTE: only the KEY
 * is migrated — the old setup never stored a service address (its
 * endpoint was hard-coded in the removed code and its request shape
 * does not match the generic client), so after migration the owner
 * still adds the service address once in Settings → AI Chat.
 * The AI service NEVER performs financial actions and NEVER receives
 * the whole database: it only gets the conversation history, the
 * business context (profile name, CSC centre, services) and a short
 * facts summary the app already computed from the real ledgers.
 * Financial actions are proposed by the structured parser and go
 * through preview → confirm → backend flow (assistant.ts).
 */
import type { AiLangCode } from './languages';
import { consumeSSE, StreamError } from './streaming';

/** Local-storage keys (browser only; never part of the app state). */
const KEY_STORAGE = 'bizkhata.ai.service.key.v1';
const ENDPOINT_STORAGE = 'bizkhata.ai.service.endpoint.v1';

/**
 * Default model sent with every chat request. The configured endpoint
 * is an OpenAI-compatible chat-completions endpoint, which REQUIRES a
 * `model` field — without it the service rejects the call even with a
 * valid key. This value is internal only: it is sent in the request
 * body, never shown in the UI, never logged, and never stored in the
 * business profile. UPDATE 19: the coordinators may change the model
 * choice (features / quality / latency / cost on the free tier), but
 * a model must always be sent.
 */
const DEFAULT_MODEL = 'gemini-2.0-flash';
/** Legacy state + profile field from the pre-UPDATE-12 Settings card.
 *  This is the ONLY place the old field name appears: it is read here
 *  purely to migrate a key the owner entered early on (see the header
 *  comment). It is never displayed, never logged, never sent anywhere
 *  except the configured endpoint. */
const LEGACY_STATE_KEY = 'bizkhata.v1';
const LEGACY_PROFILE_KEY_FIELD = 'geminiKey';
/** Set after the one-time migration attempt (found a key or not). */
const MIGRATION_MARKER = 'bizkhata.ai.service.migrated.v1';

/** In-memory fallback for tests / non-browser runtimes. */
const mem = new Map<string, string>();

function lsGet(k: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage.getItem(k);
  } catch { /* ignore */ }
  return mem.get(k) ?? null;
}
function lsSet(k: string, v: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.setItem(k, v); return; }
  } catch { /* ignore */ }
  mem.set(k, v);
}
function lsDel(k: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.removeItem(k); return; }
  } catch { /* ignore */ }
  mem.delete(k);
}

/** The owner-configured AI service key (generic, unnamed). Empty = not configured. */
export function getAiServiceKey(): string {
  migrateLegacyAiKey();
  return (lsGet(KEY_STORAGE) || '').trim();
}

/**
 * One-time migration of a key the owner entered in the old Settings
 * card: if the new key slot is empty and the persisted app state still
 * carries a key on a business profile (legacy field), copy it opaquely
 * into the new slot. The original stays in place (rollback-safe).
 * Returns true when a value was copied. Never logs or displays it.
 */
export function migrateLegacyAiKey(): boolean {
  try {
    if (lsGet(MIGRATION_MARKER)) return false;
    lsSet(MIGRATION_MARKER, '1');
    if ((lsGet(KEY_STORAGE) || '').trim()) return false;
    const raw = lsGet(LEGACY_STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      activeProfileId?: string;
      profiles?: Record<string, unknown>[];
    };
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
    if (profiles.length === 0) return false;
    const ordered = [...profiles].sort((a, b) => {
      if (a.id === parsed.activeProfileId) return -1;
      if (b.id === parsed.activeProfileId) return 1;
      return 0;
    });
    for (const p of ordered) {
      const v = p[LEGACY_PROFILE_KEY_FIELD];
      if (typeof v === 'string' && v.trim()) {
        lsSet(KEY_STORAGE, v.trim());
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
export function hasAiServiceKey(): boolean {
  return getAiServiceKey().length > 0;
}
export function setAiServiceKey(key: string): void {
  const v = (key || '').trim();
  if (v) lsSet(KEY_STORAGE, v);
  else lsDel(KEY_STORAGE);
}
export function clearAiServiceKey(): void {
  lsDel(KEY_STORAGE);
}
/** Configured endpoint (generic chat endpoint). Empty = use the built-in default path (none — no call is made without an endpoint + key). */
export function getAiServiceEndpoint(): string {
  return (lsGet(ENDPOINT_STORAGE) || '').trim();
}
export function setAiServiceEndpoint(url: string): void {
  const v = (url || '').trim();
  if (v) lsSet(ENDPOINT_STORAGE, v);
  else lsDel(ENDPOINT_STORAGE);
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * System prompt carried with every conversational-AI call. It fixes
 * the assistant's behaviour: reply in the user's language/style,
 * never invent figures, never perform financial actions itself,
 * never mention any provider/model/key, and say plainly when it does
 * not know something.
 */
export function buildSystemPrompt(opts: {
  lang: AiLangCode;
  langName: string;
  profileName: string;
  category: string;
  services: string[];
  factsSummary: string;
}): string {
  return [
    'You are the BizKhata AI Assistant, a helpful personal + business assistant for a small shop owner in India.',
    `The owner runs "${opts.profileName}" (${opts.category}). Services offered: ${opts.services.join(', ')}.`,
    `Reply in the user's own language and style. Detected language code: ${opts.lang} (${opts.langName}). If the user writes in Hinglish (Roman Hindi), reply in Hinglish. If they write in Gujarati (native or Roman), reply in Gujarati. Match their language exactly — never mix languages randomly.`,
    'Understand the user actual intention first: casual chat, a statement, a plan, a question, a request, or a financial action. A plan or statement (for example "I have to make PAN cards tomorrow") is NOT a financial action — acknowledge it, discuss it, offer relevant help such as a checklist. NEVER ask "how much money?" for a message that contains no amount and no money question.',
    'You do NOT perform financial actions. If the user wants to record income, an expense, a payment or a correction, say what you understood and that the app will show a preview for confirmation — do not claim anything is saved.',
    'Figures: use ONLY the ledger facts below. If a figure is not in the facts, say you do not have that record — never invent numbers, customers, or transactions.',
    'If you do not know something (especially live/current information such as news, rates or scores), say so plainly instead of guessing.',
    'Keep replies natural, short and useful. Ask a follow-up question only when it is genuinely needed.',
    'Never mention any AI provider, model name, credential, or technical detail.',
    `Ledger facts (real records only, 100 paise = 1 rupee):\n${opts.factsSummary}`,
  ].join('\n');
}

export interface AiCallResult {
  ok: boolean;
  /** Generated reply text (when ok). */
  text?: string;
  /** Short, non-technical failure reason (never shown raw to the user). */
  reason?: string;
}

/**
 * Call the owner-configured conversational-AI service with a generic
 * chat request. Returns { ok: false } on any failure — the caller
 * falls back to the local engine and never shows a technical error.
 * A timeout of 10s keeps the chat responsive; the key is sent only
 * as a bearer header to the configured endpoint.
 */
export async function callConversationAI(
  messages: AiChatMessage[],
  systemPrompt: string,
  timeoutMs = 10000,
): Promise<AiCallResult> {
  const endpoint = getAiServiceEndpoint();
  const key = getAiServiceKey();
  if (!endpoint || !key) return { ok: false, reason: 'not-configured' };
  if (typeof fetch === 'undefined') return { ok: false, reason: 'unavailable' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const data = await res.json() as { choices?: { message?: { content?: string } }[]; reply?: string; text?: string };
    const text =
      data?.choices?.[0]?.message?.content?.trim()
      || (typeof data?.reply === 'string' ? data.reply.trim() : '')
      || (typeof data?.text === 'string' ? data.text.trim() : '');
    if (!text) return { ok: false, reason: 'empty' };
    return { ok: true, text };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export interface AiStreamResult {
  ok: boolean;
  /** The user (or the UI) cancelled the generation. */
  aborted?: boolean;
  /** Short failure reason (never shown raw to the user). */
  reason?: string;
}

/**
 * Streaming conversational-AI call — UPDATE 17 (genuine SSE).
 *
 * Preferred path: POST to the Cloudflare Pages Function /api/ai-chat
 * with { endpoint, key, messages, systemPrompt }; the Function relays
 * the owner's configured endpoint as an SSE stream, and each chunk is
 * delivered to onChunk as it arrives. The key is sent only to the
 * Function (same origin) and from there to the configured endpoint —
 * never stored server-side, never logged.
 *
 * Fallbacks (honest, in order): if the Function is not deployed (the
 * path 404s — e.g. a local static server), call the configured
 * endpoint directly asking for a stream; a non-SSE answer there is
 * read as one complete reply and delivered as a single chunk. If the
 * stream fails at any point, the result is { ok: false } and the
 * caller shows Retry — it never silently substitutes a local reply
 * for a failed configured service.
 */
export async function callConversationAIStream(
  messages: AiChatMessage[],
  systemPrompt: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<AiStreamResult> {
  const endpoint = getAiServiceEndpoint();
  const key = getAiServiceKey();
  if (!endpoint || !key) return { ok: false, reason: 'not-configured' };
  if (typeof fetch === 'undefined') return { ok: false, reason: 'unavailable' };
  const payload = { endpoint, key, messages, systemPrompt };
  try {
    const res = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      // No Pages Function on this host (a deployed Function always
      // answers 200 with an SSE error event instead) — fall back to a
      // direct streaming call. Static servers answer an unknown POST
      // with 404/405/501.
      return await streamDirect(endpoint, key, messages, systemPrompt, onChunk, signal);
    }
    await consumeSSE(res, onChunk, signal);
    return { ok: true };
  } catch (e) {
    if (e instanceof StreamError) return { ok: false, aborted: e.aborted, reason: e.aborted ? 'aborted' : 'stream-error' };
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, aborted: true, reason: 'aborted' };
    return { ok: false, reason: 'network' };
  }
}

/** Direct streaming call to the configured endpoint (no Function). */
async function streamDirect(
  endpoint: string,
  key: string,
  messages: AiChatMessage[],
  systemPrompt: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<AiStreamResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
        stream: true,
      }),
      signal,
    });
    if (!res.ok) return { ok: false, reason: 'http-error' };
    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('text/event-stream')) {
      await consumeSSE(res, onChunk, signal);
      return { ok: true };
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[]; reply?: string; text?: string };
    const text =
      data?.choices?.[0]?.message?.content?.trim()
      || (typeof data?.reply === 'string' ? data.reply.trim() : '')
      || (typeof data?.text === 'string' ? data.text.trim() : '');
    if (!text) return { ok: false, reason: 'empty' };
    onChunk(text);
    return { ok: true };
  } catch (e) {
    if (e instanceof StreamError) return { ok: false, aborted: e.aborted, reason: e.aborted ? 'aborted' : 'stream-error' };
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, aborted: true, reason: 'aborted' };
    return { ok: false, reason: 'network' };
  }
}
