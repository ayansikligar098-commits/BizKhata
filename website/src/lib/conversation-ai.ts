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
 * calls the Cloudflare Pages Function at /api/ai-chat (see the
 * repo-root `functions/api/ai-chat.ts` — NOT website/functions/, which
 * never deploys) and the reply arrives as a real SSE stream (parsed by
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
import { detectLanguage } from './languages';
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
 * business profile.
 *
 * UPDATE 19 model choice (verified 2026-11-27 against Google's own
 * models page, ai.google.dev/gemini-api/docs/models): the previous
 * value is SHUT DOWN (June 1, 2026 — the page lists it under
 * "Previous models" as "(Shut down)"), and the 2.5 Flash model is
 * deprecated (routes to the 3.5 Flash-Lite model from Dec 1, 2026).
 * `gemini-3.5-flash-lite` is the live Stable Flash-Lite model, free-tier, and
 * works at the OpenAI-compatible endpoint (the model string is passed
 * through unchanged). It matches Android's AI_MODEL constant — the two
 * surfaces must always agree. MODELS GET SHUT DOWN: re-check this
 * value against Google's models page periodically, and update it in
 * ALL THREE places together (here, streamDirect below, and
 * UPSTREAM_MODEL in the repo-root functions/api/ai-chat.ts) — see
 * tests/streaming.test.mjs 'model' checks, which fail the suite if
 * the constants drift apart or name a dead model.
 */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
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
  /** What the local router already knows (pending offer/question, active checklist, topic). */
  contextNote?: string;
}): string {
  return [
    'You are the BizKhata AI Assistant, a helpful personal + business assistant for a small shop owner in India.',
    `The owner runs "${opts.profileName}" (${opts.category}). Services offered: ${opts.services.join(', ')}.`,
    `Reply in the user's own language and style. Detected language code: ${opts.lang} (${opts.langName}). If the user writes in Hinglish (Roman Hindi), reply in Hinglish. If they write in Gujarati (native or Roman), reply in Gujarati. Match their language exactly — never mix languages randomly.`,
    'Understand the user actual intention first: casual chat, a statement, a plan, a question, a request, or a financial action. A plan or statement (for example "I have to make PAN cards tomorrow") is NOT a financial action — acknowledge it, discuss it, offer relevant help such as a checklist. NEVER ask "how much money?" for a message that contains no amount and no money question.',
    'You do NOT perform financial actions. If the user wants to record income, an expense, a payment or a correction, say what you understood and that the app will show a preview for confirmation — do not claim anything is saved.',
    'UPDATE 26 — "Dhanda" is the owner\'s word for the whole day\'s mixed business (Passport Size Photo, Smart Card, Xerox, Documents profit and Money Transfer profit, all together). It is a general category, NOT one service: when the owner says "dhanda", NEVER ask them to pick a single service from a list and NEVER reply with a bare service list — ask for the amount and whether it was cash or UPI, and say the app will show a preview for confirmation. When they ask "aaj dhanda kitna hua?", answer with today\'s total from the ledger facts below (collection across services, Money Transfer commission only — the principal is never income — and dues are never counted as collection).',
    'UPDATE 23 — you NEVER save, delete, correct or refund any record yourself, and you NEVER claim one was saved, deleted, corrected or refunded. If the user asks to delete an entry, say plainly that the app will show a preview and only delete it after they confirm — do NOT say it is already deleted, removed or gone. Never say "hata diya", "delete kar diya", "save kar diya" or any equivalent about a record.',
    'UPDATE 23 — VERIFIED SAVES: if the conversation context below says an entry was saved and verified, NEVER say it was never saved, that it existed before, or that its figures were already there. Ground every statement about a past entry in the ledger facts and the conversation context below — never invent a different history.',
    'Figures: use ONLY the ledger facts below. If a figure is not in the facts, say you do not have that record — never invent numbers, customers, or transactions.',
    'If you do not know something (especially live/current information such as news, rates or scores), say so plainly instead of guessing.',
    'Keep replies natural, short and useful. Ask a follow-up question only when it is genuinely needed. Never repeat an introduction or greeting in the middle of a conversation — continue from what was already discussed.',
    'Never mention any AI provider, model name, credential, or technical detail.',
    'Real app pages (never invent a screen — use these exact names and paths): Daily Business (/daily-business) is where the day\'s mixed service collections are recorded; Cash Book (/cash-book) for cash entries; UPI Book (/upi-book) for UPI entries; Customer Khata (/customer-khata) for customer dues; Agents (/agents) and Agent Payments (/agent-payments); PAN Card (/services/pan-card), Aadhaar (/services/aadhaar), Voter ID (/services/voter-id), Ayushman (/services/ayushman), Xerox (/services/xerox), Printing (/services/printing); Money Transfer (/money-transfer); Reports (/reports); Receipt Generator (/receipt-generator); Module Requests (/module-requests) lists development requests queued from chat. When the user asks where to record something, name the exact page.',
    'You cannot open pages, save entries, build checklists or deploy code yourself — the app does those locally. Describe what will happen; never claim you did it. If the user asks for a new module, service, field or feature, explain plainly that the in-app assistant cannot deploy code: show the proposed plan, and offer to save it to the development queue. Never claim a module exists or is ready before it is built and tested. A BizKhata management module only tracks the shop\'s own work — it never submits anything to UIDAI or any government portal.',
    ...(opts.contextNote ? [`Current conversation context: ${opts.contextNote}`] : []),
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

/* ================= UPDATE 23 — cloud reply guard =================
 *
 * Deterministic (not a prompt tweak): a cloud reply is text the app
 * did not generate from its own ledgers, so it must be checked before
 * the user ever sees it as final. The 2026-11-27 16:03 failure was
 * exactly this: the cloud said "hata diya" for a deletion that never
 * happened, then invented "koi entry save hi nahi ki thi... pehle se
 * tha" about a save the app had verified minutes earlier.
 *
 * Two claim families are blocked when NO local action matched
 * (the cloud never performs financial actions, by construction):
 *   1. financial-success claims — past-tense save/delete/correct/
 *      refund/payment claims about a record;
 *   2. contradiction claims — only when a verified save is known
 *      (verifiedSaveLabel): "never saved" / "already existed".
 * A blocked reply is REPLACED with an honest limitation + the exact
 * manual path (Daily Business / the right book), never silently
 * dropped and never reworded into another claim. Benign replies
 * pass through untouched. The chat UI applies this in displayText
 * (onDone) for cloud-streamed replies; the tests drive it directly.
 */

/** Past-tense claims that a financial action already happened. */
const FINANCIAL_SUCCESS_RES: RegExp[] = [
  // delete / remove (Hinglish + English + Devanagari)
  /hata\s*diya|delete\s*kar\s*diya|remove\s*kar\s*diya|mita\s*diya|delete\s*ho\s*gay[ai]|remove\s*ho\s*gay[ai]|hata\s*diya\s*gaya|entry\s*(delete|remove|hata)\s*(kar\s*)?di|deleted|removed|entry\s+has\s+been\s+deleted/i,
  /हटा\s*दिया|मिटा\s*दिया|डिलीट\s*कर\s*दिया/i,
  // save (past tense only — "will be saved after you confirm" is fine)
  /save\s*kar\s*diya|save\s*ho\s*gay[ai]|saved\s*(successfully)?|entry\s+has\s+been\s+saved/i,
  /सेव\s*हो\s*गया|सेव\s*कर\s*दिया/i,
  // correct / refund / payment (past tense)
  /correct\s*kar\s*diya|correct\s*ho\s*gay[ai]|corrected/i,
  /refund\s*kar\s*diya|refund\s*ho\s*gay[ai]|refunded/i,
  /payment\s*kar\s*diya|payment\s*ho\s*gay[ai]/i,
];

/** Claims that contradict a known verified save — only applied when
 *  a verified save is supplied (otherwise "pehle se tha" may be a
 *  benign statement about something else). */
const CONTRADICTION_RES: RegExp[] = [
  /koi entry save (hi )?nahi ki|save (hi )?nahi ki thi|maine koi entry save nahi|never saved|koi entry save nahi hui/i,
  /pehle se (hi )?(tha|thi|the)|already (there|existed|saved)/i,
  /पहले से (ही )?(था|थी|थे)/i,
];

/** True when the text claims a financial action already happened. */
export function claimsFinancialAction(text: string): boolean {
  const t = String(text || '');
  return FINANCIAL_SUCCESS_RES.some((re) => re.test(t));
}

/** True when the text contradicts a known verified save. */
export function contradictsVerifiedSave(text: string): boolean {
  const t = String(text || '');
  return CONTRADICTION_RES.some((re) => re.test(t));
}

export interface GuardedCloudReply {
  text: string;
  /** True when the original text was replaced. */
  blocked: boolean;
  /** 'financial_claim' | 'contradiction' | null. */
  reason: 'financial_claim' | 'contradiction' | null;
}

const HONEST_DELETE_LIMIT =
  'Maine yahan se koi entry save ya delete nahi ki hai — chat se financial kaam sirf preview dikhakar aur aapke Confirm ke baad hota hai. Entry delete karni ho to mujhe batao kaunsi entry hai (jaise "Aadhaar 600 wali entry delete kar do"), main preview dikhaunga — ya Daily Business / UPI Book kholo aur wahan se delete karo (entry Recycle Bin mein jayegi, wahan se restore bhi ho sakti hai).';

/**
 * Check a cloud reply before it is shown as final. When no local
 * action matched, any financial-success claim or (with a verified
 * save known) any contradiction of that save is replaced with the
 * honest limitation above. Benign text is returned unchanged.
 */
export function guardCloudReply(
  text: string,
  opts?: { verifiedSaveLabel?: string | null },
): GuardedCloudReply {
  const t = String(text || '');
  const label = (opts?.verifiedSaveLabel || '').trim();
  if (label && contradictsVerifiedSave(t)) {
    return {
      text: `Ye sahi nahi hai — aapki entry save hui thi aur verify bhi ho gayi thi: ${label}. Maine use delete nahi kiya hai; agar use hatana hai to batao, main preview dikhakar confirm karwaunga — ya Daily Business kholo aur wahan se delete karo (Recycle Bin mein jayegi).`,
      blocked: true,
      reason: 'contradiction',
    };
  }
  if (claimsFinancialAction(t)) {
    return { text: HONEST_DELETE_LIMIT, blocked: true, reason: 'financial_claim' };
  }
  return { text: t, blocked: false, reason: null };
}

/**
 * UPDATE 25 (C-15): did a successful cloud reply stay in the user's
 * language? The system prompt ASKS for it, but a cloud reply in
 * English to a Hinglish user (or a Marathi-mixed reply) used to be
 * shown as-is. The chat UI calls this at stream completion: on a
 * mismatch it shows the local reply instead (never the wrong-
 * language cloud text). Uncertain detections (confidence < 0.7, or
 * a mixed reply that still contains the expected language) pass —
 * the check only fires on a clear mismatch.
 */
export function cloudReplyMatchesLanguage(text: string, expected: AiLangCode): boolean {
  const t = String(text || '').trim();
  if (!/[\p{L}]/u.test(t)) return true;
  const det = detectLanguage(t);
  if (det.code === expected) return true;
  if (det.confidence < 0.7) return true;
  if (det.languages && det.languages.includes(expected)) return true;
  return false;
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
  // The stream must never hang the chat: 30s total for the whole call.
  // (The non-streaming call has a 10s timeout; the streaming path had
  // none, so a slow endpoint left the thinking dots spinning for
  // minutes and the user with no answer at all.) The user's own Stop
  // still aborts immediately via the passed-in signal. A timeout is
  // reported as reason 'timeout' (never as user-aborted) so the
  // caller can fall back to the local reply.
  const timeoutMs = 30000;
  let timedOut = false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onExternalAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const finish = (r: AiStreamResult): AiStreamResult => {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
    if (timedOut) return { ok: false, reason: 'timeout' };
    return r;
  };
  const payload = { endpoint, key, messages, systemPrompt };
  try {
    const res = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // No Pages Function on this host (a deployed Function always
      // answers 200 with an SSE error event instead) — fall back to a
      // direct streaming call. Static servers answer an unknown POST
      // with 404/405/501.
      return finish(await streamDirect(endpoint, key, messages, systemPrompt, onChunk, ctrl.signal));
    }
    await consumeSSE(res, onChunk, ctrl.signal);
    return finish({ ok: true });
  } catch (e) {
    if (e instanceof StreamError) return finish({ ok: false, aborted: e.aborted && !timedOut, reason: e.aborted && !timedOut ? 'aborted' : 'stream-error' });
    if (e instanceof Error && e.name === 'AbortError') return finish({ ok: false, aborted: !timedOut, reason: timedOut ? 'timeout' : 'aborted' });
    return finish({ ok: false, reason: 'network' });
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
